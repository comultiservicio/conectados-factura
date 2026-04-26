import api from './api';
import { z } from 'zod';

// Validation schemas
export const ocrUploadSchema = z.object({
  documentType: z.enum(['invoice', 'receipt', 'document']),
  file: z.instanceof(File).refine(
    (file) => file.size <= 10 * 1024 * 1024,
    'El archivo debe ser menor a 10MB'
  ).refine(
    (file) => ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type),
    'Solo se permiten archivos JPG, PNG o PDF'
  ),
});

export const ocrSearchSchema = z.object({
  query: z.string().min(1, 'La búsqueda es requerida'),
  documentType: z.enum(['invoice', 'receipt', 'document']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export type OcrUploadInput = z.infer<typeof ocrUploadSchema>;
export type OcrSearchInput = z.infer<typeof ocrSearchSchema>;

export interface OcrDocument {
  id: string;
  userId: string;
  documentType: 'invoice' | 'receipt' | 'document';
  originalFilename: string;
  s3Key: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  extractedText?: string;
  extractedData?: Record<string, unknown>;
  confidence?: number;
  errorMessage?: string;
  fileUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OcrStatus {
  isAvailable: boolean;
  queueLength: number;
  message: string;
}

export interface SearchResult {
  documents: OcrDocument[];
  total: number;
  query: string;
}

class OcrService {
  // Upload document for OCR processing
  async uploadDocument(data: OcrUploadInput): Promise<OcrDocument> {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('documentType', data.documentType);

    const response = await api.post<OcrDocument>('/ocr/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  // Get OCR processing status
  async getStatus(): Promise<OcrStatus> {
    const response = await api.get<OcrStatus>('/ocr/status');
    return response.data;
  }

  // Get user's documents
  async getDocuments(params?: {
    documentType?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<OcrDocument[]> {
    const response = await api.get<OcrDocument[]>('/ocr/documents', { params });
    return response.data;
  }

  // Get document by ID
  async getDocumentById(documentId: string): Promise<OcrDocument> {
    const response = await api.get<OcrDocument>(`/ocr/documents/${documentId}`);
    return response.data;
  }

  // Search in extracted text
  async searchDocuments(data: OcrSearchInput): Promise<SearchResult> {
    const response = await api.post<SearchResult>('/ocr/search', data);
    return response.data;
  }

  // Get extracted data in structured format
  async getExtractedData(documentId: string): Promise<{
    document: OcrDocument;
    structuredData: {
      vendor?: string;
      date?: string;
      total?: number;
      items?: Array<{
        description: string;
        quantity: number;
        price: number;
      }>;
    };
  }> {
    const response = await api.get(`/ocr/documents/${documentId}/data`);
    return response.data;
  }

  // Delete document
  async deleteDocument(documentId: string): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(`/ocr/documents/${documentId}`);
    return response.data;
  }

  // Reprocess document
  async reprocessDocument(documentId: string): Promise<OcrDocument> {
    const response = await api.post<OcrDocument>(`/ocr/documents/${documentId}/reprocess`);
    return response.data;
  }
}

export const ocrService = new OcrService();
export default ocrService;
