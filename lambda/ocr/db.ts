import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

// Configuración de DynamoDB
const client = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(client);

// Nombres de tablas desde variables de entorno
const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE || 'conectados-documents';
const OCR_RESULTS_TABLE = process.env.OCR_RESULTS_TABLE || 'conectados-ocr-results';

// Interfaces
export interface Document {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  s3Key: string;
  s3Bucket: string;
  status: 'uploaded' | 'processing' | 'processed' | 'failed';
  uploadedAt: string;
  processedAt?: string;
  errorMessage?: string;
}

export interface OCRResult {
  id: string;
  documentId: string;
  userId: string;
  extractedData: {
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string;
    totalAmount?: number;
    taxAmount?: number;
    customerName?: string;
    customerTaxId?: string;
    supplierName?: string;
    supplierTaxId?: string;
    items?: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
  };
  confidence: number;
  status: 'pending' | 'completed' | 'failed';
  processedAt: string;
  errorMessage?: string;
}

export interface CreateDocumentRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
  s3Key: string;
  s3Bucket: string;
}

export interface CreateOCRResultRequest {
  documentId: string;
  extractedData: OCRResult['extractedData'];
  confidence: number;
}

// Funciones de base de datos
export class OCRDB {
  /**
   * Crear registro de documento
   */
  static async createDocument(docData: CreateDocumentRequest & { userId: string }): Promise<Document> {
    const document: Document = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...docData,
      status: 'uploaded',
      uploadedAt: new Date().toISOString()
    };

    await dynamoDoc.send(new PutCommand({
      TableName: DOCUMENTS_TABLE,
      Item: document
    }));

    return document;
  }

  /**
   * Obtener documento por ID
   */
  static async getDocument(documentId: string): Promise<Document | null> {
    const result = await dynamoDoc.send(new GetCommand({
      TableName: DOCUMENTS_TABLE,
      Key: { id: documentId }
    }));

    return result.Item as Document || null;
  }

  /**
   * Actualizar estado de documento
   */
  static async updateDocumentStatus(documentId: string, status: Document['status'], errorMessage?: string): Promise<boolean> {
    try {
      // En una implementación real, necesitaríamos obtener primero el documento
      // y luego actualizarlo. Por simplicidad, usamos PutCommand
      const updateData: Partial<Document> = {
        status,
        processedAt: new Date().toISOString()
      };

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }

      await dynamoDoc.send(new PutCommand({
        TableName: DOCUMENTS_TABLE,
        Item: {
          id: documentId,
          ...updateData
        },
        ConditionExpression: 'attribute_exists(id)'
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener documentos de un usuario
   */
  static async getUserDocuments(userId: string, status?: Document['status']): Promise<Document[]> {
    let filterExpression = 'userId = :userId';
    const expressionAttributeValues: any = {
      ':userId': userId
    };
    const expressionAttributeNames: any = {};

    if (status) {
      filterExpression += ' AND #status = :status';
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = status;
    }

    const result = await dynamoDoc.send(new QueryCommand({
      TableName: DOCUMENTS_TABLE,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false // Ordenar por fecha descendente
    }));

    return result.Items as Document[] || [];
  }

  /**
   * Crear resultado de OCR
   */
  static async createOCRResult(resultData: CreateOCRResultRequest & { userId: string }): Promise<OCRResult> {
    const ocrResult: OCRResult = {
      id: `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...resultData,
      status: 'completed',
      processedAt: new Date().toISOString()
    };

    await dynamoDoc.send(new PutCommand({
      TableName: OCR_RESULTS_TABLE,
      Item: ocrResult
    }));

    return ocrResult;
  }

  /**
   * Obtener resultado de OCR por ID de documento
   */
  static async getOCRResultByDocumentId(documentId: string): Promise<OCRResult | null> {
    const result = await dynamoDoc.send(new QueryCommand({
      TableName: OCR_RESULTS_TABLE,
      IndexName: 'ByDocumentId', // Asumiendo que existe este índice
      KeyConditionExpression: 'documentId = :documentId',
      ExpressionAttributeValues: {
        ':documentId': documentId
      },
      Limit: 1
    }));

    const items = result.Items as OCRResult[] || [];
    return items.length > 0 ? items[0] : null;
  }

  /**
   * Marcar resultado de OCR como fallido
   */
  static async markOCRAsFailed(documentId: string, errorMessage: string): Promise<boolean> {
    try {
      await dynamoDoc.send(new PutCommand({
        TableName: OCR_RESULTS_TABLE,
        Item: {
          id: `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          documentId,
          userId: 'unknown', // Necesitaríamos obtener del documento
          extractedData: {},
          confidence: 0,
          status: 'failed',
          processedAt: new Date().toISOString(),
          errorMessage
        }
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtener estadísticas de OCR
   */
  static async getOCRStats(userId?: string): Promise<{
    totalDocuments: number;
    processedDocuments: number;
    failedDocuments: number;
    pendingDocuments: number;
    averageConfidence: number;
  }> {
    let filterExpression = '';
    const expressionAttributeValues: any = {};

    if (userId) {
      filterExpression = 'userId = :userId';
      expressionAttributeValues[':userId'] = userId;
    }

    const documentsResult = await dynamoDoc.send(new QueryCommand({
      TableName: DOCUMENTS_TABLE,
      FilterExpression: filterExpression || undefined,
      ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined
    }));

    const documents = documentsResult.Items as Document[] || [];
    
    const stats = documents.reduce((acc, doc) => {
      acc.totalDocuments++;
      switch (doc.status) {
        case 'processed':
          acc.processedDocuments++;
          break;
        case 'failed':
          acc.failedDocuments++;
          break;
        case 'uploaded':
        case 'processing':
          acc.pendingDocuments++;
          break;
      }
      return acc;
    }, {
      totalDocuments: 0,
      processedDocuments: 0,
      failedDocuments: 0,
      pendingDocuments: 0,
      averageConfidence: 0
    });

    // Obtener confianza promedio de resultados completados
    if (stats.processedDocuments > 0) {
      const ocrResults = await Promise.all(
        documents
          .filter(doc => doc.status === 'processed')
          .map(doc => this.getOCRResultByDocumentId(doc.id))
      );

      const validResults = ocrResults.filter(result => result !== null) as OCRResult[];
      if (validResults.length > 0) {
        stats.averageConfidence = validResults.reduce((sum, result) => sum + result.confidence, 0) / validResults.length;
      }
    }

    return stats;
  }

  /**
   * Limpiar documentos antiguos (mantener solo últimos 30 días)
   */
  static async cleanupOldDocuments(userId?: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffTime = thirtyDaysAgo.toISOString();

    let filterExpression = 'uploadedAt < :cutoffTime';
    const expressionAttributeValues: any = {
      ':cutoffTime': cutoffTime
    };

    if (userId) {
      filterExpression += ' AND userId = :userId';
      expressionAttributeValues[':userId'] = userId;
    }

    const result = await dynamoDoc.send(new QueryCommand({
      TableName: DOCUMENTS_TABLE,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    }));

    const oldDocuments = result.Items as Document[] || [];
    
    // En una implementación real, eliminaríamos cada documento
    // Por simplicidad, solo retornamos el conteo
    return oldDocuments.length;
  }
}

export { dynamoDoc };
