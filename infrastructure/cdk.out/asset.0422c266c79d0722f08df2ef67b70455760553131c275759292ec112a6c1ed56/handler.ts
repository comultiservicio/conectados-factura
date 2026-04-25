import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TextractClient, AnalyzeDocumentCommand, GetDocumentAnalysisCommand } from '@aws-sdk/client-textract';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { v4 as uuidv4 } from 'uuid';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';

import { OCRDocument, ApiResponse, PaginatedResponse, DecodedToken } from '../../shared/types';
import { logError, logInfo, logMetric } from '../../shared/logger';
import { CacheManager } from '../../shared/cache';
import { RetryHelper } from '../../shared/retry';
import { Metrics } from '../../shared/metrics';

const textractClient = new TextractClient({});
const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const OCR_TABLE = process.env.OCR_TABLE || 'conectados-ocr-documents';
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET_NAME || 'conectados-factura-documents';

// Esquemas de validación
const ocrDocumentSchema = z.object({
  documentType: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
  description: z.string().optional(),
});

const ocrUpdateSchema = z.object({
  status: z.enum(['uploaded', 'processing', 'completed', 'failed']).optional(),
  extractedData: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

interface ExtractedInvoiceData {
  invoiceNumber?: string;
  issueDate?: string;
  customerName?: string;
  customerTaxId?: string;
  totalAmount?: number;
  netAmount?: number;
  ivaAmount?: number;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}

class OCRService {
  private async validateUser(token: string, requiredRole?: string): Promise<DecodedToken> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedToken;
      
      if (requiredRole && decoded.role !== requiredRole) {
        throw new Error(`Insufficient permissions. Required: ${requiredRole}, Current: ${decoded.role}`);
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  private async uploadDocument(file: Buffer, fileName: string, contentType: string): Promise<string> {
    const key = `documents/${fileName}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: key,
      Body: file,
      ContentType: contentType,
    }));

    return `https://${DOCUMENTS_BUCKET}.s3.amazonaws.com/${key}`;
  }

  private async analyzeDocument(s3Url: string): Promise<ExtractedInvoiceData> {
    try {
      // Extract bucket and key from S3 URL
      const urlParts = s3Url.replace('https://', '').split('/');
      const bucket = urlParts[0];
      const key = urlParts.slice(1).join('/');

      // Start document analysis
      const analyzeCommand = new AnalyzeDocumentCommand({
        Document: {
          S3Object: {
            Bucket: bucket,
            Name: key,
          },
        },
        FeatureTypes: ['FORMS', 'TABLES'],
      });

      const response = await textractClient.send(analyzeCommand);
      
      // Extract data from Textract response
      return this.extractInvoiceData(response);
    } catch (error) {
      console.error('Error analyzing document:', error);
      throw new Error('Document analysis failed');
    }
  }

  private extractInvoiceData(textractResponse: any): ExtractedInvoiceData {
    const data: ExtractedInvoiceData = {};

    try {
      // Extract key-value pairs from forms
      if (textractResponse.Blocks) {
        const blocks = textractResponse.Blocks;
        
        // Look for key-value pairs
        blocks.forEach((block: any) => {
          if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
            const keyText = this.getTextForBlock(block, blocks);
            const valueText = this.getValueForKey(block, blocks);

            // Map common invoice fields
            if (keyText.toLowerCase().includes('factura') || keyText.toLowerCase().includes('número')) {
              data.invoiceNumber = valueText;
            } else if (keyText.toLowerCase().includes('fecha')) {
              data.issueDate = valueText;
            } else if (keyText.toLowerCase().includes('cliente') || keyText.toLowerCase().includes('razón social')) {
              data.customerName = valueText;
            } else if (keyText.toLowerCase().includes('cuit') || keyText.toLowerCase().includes('cuil')) {
              data.customerTaxId = valueText;
            } else if (keyText.toLowerCase().includes('total')) {
              const amount = this.extractAmount(valueText);
              if (amount) data.totalAmount = amount;
            } else if (keyText.toLowerCase().includes('neto') || keyText.toLowerCase().includes('subtotal')) {
              const amount = this.extractAmount(valueText);
              if (amount) data.netAmount = amount;
            } else if (keyText.toLowerCase().includes('iva')) {
              const amount = this.extractAmount(valueText);
              if (amount) data.ivaAmount = amount;
            }
          }
        });

        // Extract table data for line items
        const tables = blocks.filter((block: any) => block.BlockType === 'TABLE');
        if (tables.length > 0) {
          data.items = this.extractTableItems(tables[0], blocks);
        }
      }

      return data;
    } catch (error) {
      console.error('Error extracting invoice data:', error);
      return data;
    }
  }

  private getTextForBlock(block: any, allBlocks: any[]): string {
    if (block.Relationships) {
      const textBlocks = block.Relationships
        .filter((rel: any) => rel.Type === 'CHILD')
        .map((rel: any) => allBlocks.find((b: any) => b.Id === rel.Id))
        .filter((b: any) => b && b.BlockType === 'WORD')
        .map((wordBlock: any) => wordBlock.Text)
        .join(' ');
      
      return textBlocks;
    }
    return '';
  }

  private getValueForKey(keyBlock: any, allBlocks: any[]): string {
    if (keyBlock.Relationships) {
      const valueRelationship = keyBlock.Relationships.find((rel: any) => rel.Type === 'VALUE');
      if (valueRelationship) {
        const valueBlock = allBlocks.find((b: any) => b.Id === valueRelationship.Ids[0]);
        if (valueBlock) {
          return this.getTextForBlock(valueBlock, allBlocks);
        }
      }
    }
    return '';
  }

  private extractAmount(text: string): number | null {
    // Extract numeric value from text (e.g., "$1,234.56" -> 1234.56)
    const match = text.match(/[\d.,]+/);
    if (match) {
      const cleaned = match[0].replace(/[.,]/g, (match) => match === ',' ? '.' : '');
      const amount = parseFloat(cleaned);
      return isNaN(amount) ? null : amount;
    }
    return null;
  }

  private extractTableItems(tableBlock: any, allBlocks: any[]): Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }> {
    const items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    try {
      if (tableBlock.Relationships) {
        const cellBlocks = tableBlock.Relationships
          .filter((rel: any) => rel.Type === 'CHILD')
          .map((rel: any) => allBlocks.find((b: any) => b.Id === rel.Ids[0]))
          .filter((b: any) => b && b.BlockType === 'CELL');

        // Group cells by row
        const rows: { [key: number]: any[] } = {};
        cellBlocks.forEach((cell: any) => {
          const rowIndex = cell.RowIndex;
          if (!rows[rowIndex]) rows[rowIndex] = [];
          rows[rowIndex].push(cell);
        });

        // Process each row (skip header row)
        Object.keys(rows).forEach(rowIndex => {
          const rowNum = parseInt(rowIndex);
          if (rowNum > 1) { // Skip header
            const cells = rows[rowNum].sort((a, b) => a.ColumnIndex - b.ColumnIndex);
            
            if (cells.length >= 3) {
              const description = this.getTextForBlock(cells[0], allBlocks);
              const quantity = this.extractAmount(this.getTextForBlock(cells[1], allBlocks)) || 1;
              const unitPrice = this.extractAmount(this.getTextForBlock(cells[2], allBlocks)) || 0;
              const totalPrice = this.extractAmount(this.getTextForBlock(cells[3] || cells[2], allBlocks)) || (quantity * unitPrice);

              if (description && (quantity > 0 || unitPrice > 0 || totalPrice > 0)) {
                items.push({
                  description,
                  quantity,
                  unitPrice,
                  totalPrice,
                });
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Error extracting table items:', error);
    }

    return items;
  }

  private calculateConfidenceScore(extractedData: ExtractedInvoiceData): number {
    let score = 0;
    let totalChecks = 0;

    if (extractedData.invoiceNumber) { score += 20; totalChecks++; }
    if (extractedData.issueDate) { score += 15; totalChecks++; }
    if (extractedData.customerName) { score += 20; totalChecks++; }
    if (extractedData.customerTaxId) { score += 15; totalChecks++; }
    if (extractedData.totalAmount && extractedData.totalAmount > 0) { score += 20; totalChecks++; }
    if (extractedData.items && extractedData.items.length > 0) { score += 10; totalChecks++; }

    return totalChecks > 0 ? score : 0;
  }

  async processDocument(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const startTime = Date.now();
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const decoded = await this.validateUser(token, 'user'); // Solo usuarios pueden procesar documentos
      
      // Parse multipart form data
      const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
      
      if (!contentType.includes('multipart/form-data')) {
        return this.createResponse(400, { 
          success: false, 
          error: 'Content-Type must be multipart/form-data' 
        });
      }

      const body = event.body;
      if (!body) {
        return this.createResponse(400, { 
          success: false, 
          error: 'Request body is required' 
        });
      }

      // For simplicity, assume the file is sent as base64
      // In production, use a proper multipart parser
      const documentData = JSON.parse(body);
      const { file, fileName, documentType, companyId } = documentData;

      if (!file || !fileName || !documentType || !companyId) {
        return this.createResponse(400, { 
          success: false, 
          error: 'File, fileName, documentType, and companyId are required' 
        });
      }

      // Upload file to S3
      const buffer = Buffer.from(file, 'base64');
      const s3Url = await this.uploadDocument(buffer, fileName, 'application/pdf');

      // Create OCR document record
      const ocrDocument: OCRDocument = {
        id: uuidv4(),
        fileName: fileName,
        fileSize: buffer.length,
        mimeType: 'application/pdf',
        documentType: documentType,
        s3Key: s3Url.split('/').pop(),
        userId: decoded.sub, // Usar el userId del token decodificado
        status: 'uploaded',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as OCRDocument;

      await dynamoDoc.send(new PutCommand({
        TableName: OCR_TABLE,
        Item: ocrDocument,
      }));

      try {
        // Analyze document with Textract
        const extractedData = await this.analyzeDocument(s3Url);
        const confidenceScore = this.calculateConfidenceScore(extractedData);

        // Update OCR document with results
        await dynamoDoc.send(new UpdateCommand({
          TableName: OCR_TABLE,
          Key: { id: ocrDocument.id },
          UpdateExpression: 'SET extractedData = :extractedData, confidenceScore = :confidenceScore, status = :status, processedAt = :processedAt, manualReviewRequired = :manualReviewRequired',
          ExpressionAttributeValues: {
            ':extractedData': extractedData,
            ':confidenceScore': confidenceScore,
            ':status': confidenceScore >= 70 ? 'completed' : 'failed',
            ':processedAt': new Date().toISOString(),
            ':manualReviewRequired': confidenceScore < 70,
          },
        }));

        // Get updated document
        const result = await dynamoDoc.send(new GetCommand({
          TableName: OCR_TABLE,
          Key: { id: ocrDocument.id },
        }));

        return this.createResponse(200, { 
          success: true, 
          data: result.Item 
        });

      } catch (analysisError) {
        // Update document with error
        await dynamoDoc.send(new UpdateCommand({
          TableName: OCR_TABLE,
          Key: { id: ocrDocument.id },
          UpdateExpression: 'SET status = :status, processedAt = :processedAt, manualReviewRequired = :manualReviewRequired',
          ExpressionAttributeValues: {
            ':status': 'failed',
            ':processedAt': new Date().toISOString(),
            ':manualReviewRequired': true,
          },
        }));

        return this.createResponse(200, { 
          success: true, 
          data: {
            ...ocrDocument,
            status: 'failed',
            manualReviewRequired: true,
          }
        });
      }

    } catch (error) {
      console.error('Error processing document:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getDocument(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const documentId = event.pathParameters?.id;
      if (!documentId) {
        return this.createResponse(400, { success: false, error: 'Document ID required' });
      }

      const result = await dynamoDoc.send(new GetCommand({
        TableName: OCR_TABLE,
        Key: { id: documentId },
      }));

  async listDocuments(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const token = event.headers.Authorization?.replace('Bearer ', '');
      if (!token) {
        return this.createResponse(401, { success: false, error: 'Authentication required' });
      }

      const queryParams = event.queryStringParameters || {};
      const companyId = queryParams.companyId;
      const status = queryParams.status;
      const page = parseInt(queryParams.page || '1');
      const limit = parseInt(queryParams.limit || '10');

      if (!companyId) {
        return this.createResponse(400, { 
          success: false, 
          error: 'Company ID is required' 
        });
      }

      // For simplicity, using scan - in production use GSI for better performance
      const params: any = {
        TableName: OCR_TABLE,
        FilterExpression: 'companyId = :companyId',
        ExpressionAttributeValues: {
          ':companyId': companyId,
        },
        Limit: limit,
      };

      if (status) {
        params.FilterExpression += ' AND #status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues[':status'] = status;
      }

      // This would need a proper implementation with pagination
      // For now, returning a simplified response
      return this.createResponse(200, {
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
        },
      });

    } catch (error) {
      console.error('Error listing documents:', error);
      return this.createResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  public createResponse(statusCode: number, body: any): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    };
  }
}

const ocrService = new OCRService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod;
  const path = event.path;

  try {
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/ocr/upload')) {
          return await ocrService.processDocument(event);
        }
        break;
      case 'GET':
        if (path.includes('/ocr/documents') && event.pathParameters?.id) {
          return await ocrService.getDocument(event);
        } else if (path.includes('/ocr/documents')) {
          return await ocrService.listDocuments(event);
        }
        break;
      default:
        return ocrService.createResponse(405, { 
          success: false, 
          error: 'Method not allowed' 
        });
    }

    return ocrService.createResponse(404, { 
      success: false, 
      error: 'Endpoint not found' 
    });

  } catch (error) {
    console.error('Unhandled error:', error);
    return ocrService.createResponse(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};
