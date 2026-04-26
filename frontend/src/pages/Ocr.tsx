import React, { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { ocrService } from '../services';
import { useAlerts } from '../components';
import './Ocr.css';

const uploadSchema = z.object({
  documentType: z.enum(['invoice', 'receipt', 'document']),
  file: z.instanceof(File).refine(
    (file) => file.size <= 10 * 1024 * 1024,
    'El archivo debe ser menor a 10MB'
  ).refine(
    (file) => ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type),
    'Solo se permiten archivos JPG, PNG o PDF'
  ),
});

interface OcrDocument {
  id: string;
  documentType: 'invoice' | 'receipt' | 'document';
  originalFilename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  extractedText?: string;
  extractedData?: Record<string, unknown>;
  confidence?: number;
  errorMessage?: string;
  fileUrl?: string;
  createdAt: string;
}

const Ocr: React.FC = () => {
  const { showSuccess, showError } = useAlerts();
  const [documents, setDocuments] = useState<OcrDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<OcrDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const data = await ocrService.getDocuments();
      setDocuments(data);
    } catch (error) {
      showError('Error al cargar documentos');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      await handleFileUpload(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      await handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const validatedData = uploadSchema.parse({
        documentType: 'document',
        file,
      });

      await ocrService.uploadDocument(validatedData);
      showSuccess('Documento subido exitosamente. Procesando...');
      loadDocuments();
    } catch (error) {
      if (error instanceof z.ZodError) {
        showError(error.errors[0].message);
      } else {
        showError('Error al subir documento');
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadDocuments();
      return;
    }

    try {
      const results = await ocrService.searchDocuments({ query: searchQuery });
      setDocuments(results.documents);
    } catch (error) {
      showError('Error al buscar documentos');
    }
  };

  const handleViewDocument = async (doc: OcrDocument) => {
    setSelectedDocument(doc);
  };

  const handleReprocess = async (docId: string) => {
    try {
      await ocrService.reprocessDocument(docId);
      showSuccess('Documento en cola para reprocesamiento');
      loadDocuments();
    } catch (error) {
      showError('Error al reprocesar documento');
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('¿Está seguro de eliminar este documento?')) return;

    try {
      await ocrService.deleteDocument(docId);
      showSuccess('Documento eliminado');
      if (selectedDocument?.id === docId) {
        setSelectedDocument(null);
      }
      loadDocuments();
    } catch (error) {
      showError('Error al eliminar documento');
    }
  };

  const getDocumentTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      invoice: '📄',
      receipt: '🧾',
      document: '📃',
    };
    return icons[type] || '📄';
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      invoice: 'Factura',
      receipt: 'Recibo',
      document: 'Documento',
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { class: string; label: string }> = {
      pending: { class: 'badge-pending', label: 'Pendiente' },
      processing: { class: 'badge-processing', label: 'Procesando' },
      completed: { class: 'badge-completed', label: 'Completado' },
      failed: { class: 'badge-failed', label: 'Fallido' },
    };
    const badge = badges[status] || { class: 'badge-default', label: status };
    return <span className={`status-badge ${badge.class}`}>{badge.label}</span>;
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'gray';
    if (confidence >= 90) return 'high';
    if (confidence >= 70) return 'medium';
    return 'low';
  };

  return (
    <div className="ocr-page">
      <div className="page-header">
        <h1>OCR - Reconocimiento de Documentos</h1>
      </div>

      {/* Upload Area */}
      <div
        className={`upload-area ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="upload-content">
          <div className="upload-icon">📤</div>
          <p className="upload-text">
            Arrastra y suelta archivos aquí, o{' '}
            <span className="upload-link" onClick={() => fileInputRef.current?.click()}>
              selecciona un archivo
            </span>
          </p>
          <p className="upload-hint">Formatos soportados: JPG, PNG, PDF (máx. 10MB)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={handleFileChange}
            className="file-input-hidden"
            aria-label="Seleccionar archivo para subir"
          />
        </div>
        {isUploading && (
          <div className="upload-overlay">
            <div className="spinner"></div>
            <p>Subiendo...</p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="search-section">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Buscar en documentos procesados..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
            aria-label="Buscar documentos"
          />
          <button type="submit" className="btn-secondary">🔍 Buscar</button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); loadDocuments(); }}
              className="btn-text"
            >
              Limpiar
            </button>
          )}
        </form>
      </div>

      {/* Documents List */}
      <div className="documents-section">
        <h2>Documentos Procesados</h2>
        
        {documents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <p>No hay documentos procesados</p>
            <span>Sube un documento para comenzar</span>
          </div>
        ) : (
          <div className="documents-grid">
            {documents.map(doc => (
              <div
                key={doc.id}
                className={`document-card ${selectedDocument?.id === doc.id ? 'selected' : ''}`}
                onClick={() => handleViewDocument(doc)}
              >
                <div className="document-header">
                  <span className="document-icon">{getDocumentTypeIcon(doc.documentType)}</span>
                  <span className="document-type">{getDocumentTypeLabel(doc.documentType)}</span>
                  {getStatusBadge(doc.status)}
                </div>
                <div className="document-body">
                  <p className="document-name" title={doc.originalFilename}>
                    {doc.originalFilename.length > 30
                      ? doc.originalFilename.substring(0, 30) + '...'
                      : doc.originalFilename}
                  </p>
                  <p className="document-date">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {doc.status === 'completed' && doc.confidence && (
                  <div className="document-footer">
                    <span className={`confidence-badge ${getConfidenceColor(doc.confidence)}`}>
                      Confianza: {doc.confidence}%
                    </span>
                  </div>
                )}
                {doc.status === 'failed' && (
                  <div className="document-footer">
                    <span className="error-text" title={doc.errorMessage}>
                      Error: {doc.errorMessage?.substring(0, 30)}...
                    </span>
                  </div>
                )}
                <div className="document-actions">
                  {doc.status === 'failed' && (
                    <button
                      className="btn-icon"
                      onClick={e => { e.stopPropagation(); handleReprocess(doc.id); }}
                      title="Reprocesar"
                    >
                      🔄
                    </button>
                  )}
                  <button
                    className="btn-icon btn-delete"
                    onClick={e => { e.stopPropagation(); handleDelete(doc.id); }}
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Detail Modal */}
      {selectedDocument && (
        <div className="modal-overlay" onClick={() => setSelectedDocument(null)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalle del Documento</h2>
              <button
                className="btn-close"
                onClick={() => setSelectedDocument(null)}
              >
                ×
              </button>
            </div>
            
            <div className="document-detail">
              <div className="detail-section">
                <h3>Información General</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Nombre:</label>
                    <span>{selectedDocument.originalFilename}</span>
                  </div>
                  <div className="detail-item">
                    <label>Tipo:</label>
                    <span>{getDocumentTypeLabel(selectedDocument.documentType)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Estado:</label>
                    <span>{getStatusBadge(selectedDocument.status)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Fecha:</label>
                    <span>{new Date(selectedDocument.createdAt).toLocaleString()}</span>
                  </div>
                  {selectedDocument.confidence && (
                    <div className="detail-item">
                      <label>Confianza OCR:</label>
                      <span className={`confidence-value ${getConfidenceColor(selectedDocument.confidence)}`}>
                        {selectedDocument.confidence}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedDocument.extractedText && (
                <div className="detail-section">
                  <h3>Texto Extraído</h3>
                  <pre className="extracted-text">{selectedDocument.extractedText}</pre>
                </div>
              )}

              {selectedDocument.extractedData && (
                <div className="detail-section">
                  <h3>Datos Estructurados</h3>
                  <pre className="extracted-data">
                    {JSON.stringify(selectedDocument.extractedData, null, 2)}
                  </pre>
                </div>
              )}

              {selectedDocument.fileUrl && (
                <div className="detail-section">
                  <h3>Vista Previa</h3>
                  <a
                    href={selectedDocument.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                  >
                    📄 Ver Documento Original
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ocr;
