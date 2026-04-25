"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_textract_1 = require("@aws-sdk/client-textract");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const uuid_1 = require("uuid");
const jwt = __importStar(require("jsonwebtoken"));
const zod_1 = require("zod");
const textractClient = new client_textract_1.TextractClient({});
const s3Client = new client_s3_1.S3Client({});
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const dynamoDoc = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
const OCR_TABLE = process.env.OCR_TABLE || 'conectados-ocr-documents';
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET_NAME || 'conectados-factura-documents';
// Esquemas de validación
const ocrDocumentSchema = zod_1.z.object({
    documentType: zod_1.z.string().min(1),
    fileName: zod_1.z.string().min(1),
    fileSize: zod_1.z.number().positive(),
    mimeType: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
});
const ocrUpdateSchema = zod_1.z.object({
    status: zod_1.z.enum(['uploaded', 'processing', 'completed', 'failed']).optional(),
    extractedData: zod_1.z.string().optional(),
    confidence: zod_1.z.number().min(0).max(100).optional(),
    notes: zod_1.z.string().optional(),
});
class OCRService {
    async validateUser(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            return decoded.sub;
        }
        catch (error) {
            throw new Error('Invalid authentication token');
        }
    }
    async uploadDocument(file, fileName, contentType) {
        const key = `documents/${fileName}`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: DOCUMENTS_BUCKET,
            Key: key,
            Body: file,
            ContentType: contentType,
        }));
        return `https://${DOCUMENTS_BUCKET}.s3.amazonaws.com/${key}`;
    }
    async analyzeDocument(s3Url) {
        try {
            // Extract bucket and key from S3 URL
            const urlParts = s3Url.replace('https://', '').split('/');
            const bucket = urlParts[0];
            const key = urlParts.slice(1).join('/');
            // Start document analysis
            const analyzeCommand = new client_textract_1.AnalyzeDocumentCommand({
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
        }
        catch (error) {
            console.error('Error analyzing document:', error);
            throw new Error('Document analysis failed');
        }
    }
    extractInvoiceData(textractResponse) {
        const data = {};
        try {
            // Extract key-value pairs from forms
            if (textractResponse.Blocks) {
                const blocks = textractResponse.Blocks;
                // Look for key-value pairs
                blocks.forEach((block) => {
                    if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
                        const keyText = this.getTextForBlock(block, blocks);
                        const valueText = this.getValueForKey(block, blocks);
                        // Map common invoice fields
                        if (keyText.toLowerCase().includes('factura') || keyText.toLowerCase().includes('número')) {
                            data.invoiceNumber = valueText;
                        }
                        else if (keyText.toLowerCase().includes('fecha')) {
                            data.issueDate = valueText;
                        }
                        else if (keyText.toLowerCase().includes('cliente') || keyText.toLowerCase().includes('razón social')) {
                            data.customerName = valueText;
                        }
                        else if (keyText.toLowerCase().includes('cuit') || keyText.toLowerCase().includes('cuil')) {
                            data.customerTaxId = valueText;
                        }
                        else if (keyText.toLowerCase().includes('total')) {
                            const amount = this.extractAmount(valueText);
                            if (amount)
                                data.totalAmount = amount;
                        }
                        else if (keyText.toLowerCase().includes('neto') || keyText.toLowerCase().includes('subtotal')) {
                            const amount = this.extractAmount(valueText);
                            if (amount)
                                data.netAmount = amount;
                        }
                        else if (keyText.toLowerCase().includes('iva')) {
                            const amount = this.extractAmount(valueText);
                            if (amount)
                                data.ivaAmount = amount;
                        }
                    }
                });
                // Extract table data for line items
                const tables = blocks.filter((block) => block.BlockType === 'TABLE');
                if (tables.length > 0) {
                    data.items = this.extractTableItems(tables[0], blocks);
                }
            }
            return data;
        }
        catch (error) {
            console.error('Error extracting invoice data:', error);
            return data;
        }
    }
    getTextForBlock(block, allBlocks) {
        if (block.Relationships) {
            const textBlocks = block.Relationships
                .filter((rel) => rel.Type === 'CHILD')
                .map((rel) => allBlocks.find((b) => b.Id === rel.Id))
                .filter((b) => b && b.BlockType === 'WORD')
                .map((wordBlock) => wordBlock.Text)
                .join(' ');
            return textBlocks;
        }
        return '';
    }
    getValueForKey(keyBlock, allBlocks) {
        if (keyBlock.Relationships) {
            const valueRelationship = keyBlock.Relationships.find((rel) => rel.Type === 'VALUE');
            if (valueRelationship) {
                const valueBlock = allBlocks.find((b) => b.Id === valueRelationship.Ids[0]);
                if (valueBlock) {
                    return this.getTextForBlock(valueBlock, allBlocks);
                }
            }
        }
        return '';
    }
    extractAmount(text) {
        // Extract numeric value from text (e.g., "$1,234.56" -> 1234.56)
        const match = text.match(/[\d.,]+/);
        if (match) {
            const cleaned = match[0].replace(/[.,]/g, (match) => match === ',' ? '.' : '');
            const amount = parseFloat(cleaned);
            return isNaN(amount) ? null : amount;
        }
        return null;
    }
    extractTableItems(tableBlock, allBlocks) {
        const items = [];
        try {
            if (tableBlock.Relationships) {
                const cellBlocks = tableBlock.Relationships
                    .filter((rel) => rel.Type === 'CHILD')
                    .map((rel) => allBlocks.find((b) => b.Id === rel.Ids[0]))
                    .filter((b) => b && b.BlockType === 'CELL');
                // Group cells by row
                const rows = {};
                cellBlocks.forEach((cell) => {
                    const rowIndex = cell.RowIndex;
                    if (!rows[rowIndex])
                        rows[rowIndex] = [];
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
        }
        catch (error) {
            console.error('Error extracting table items:', error);
        }
        return items;
    }
    calculateConfidenceScore(extractedData) {
        let score = 0;
        let totalChecks = 0;
        if (extractedData.invoiceNumber) {
            score += 20;
            totalChecks++;
        }
        if (extractedData.issueDate) {
            score += 15;
            totalChecks++;
        }
        if (extractedData.customerName) {
            score += 20;
            totalChecks++;
        }
        if (extractedData.customerTaxId) {
            score += 15;
            totalChecks++;
        }
        if (extractedData.totalAmount && extractedData.totalAmount > 0) {
            score += 20;
            totalChecks++;
        }
        if (extractedData.items && extractedData.items.length > 0) {
            score += 10;
            totalChecks++;
        }
        return totalChecks > 0 ? score : 0;
    }
    async processDocument(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const userId = await this.validateUser(token);
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
            const ocrDocument = {
                id: (0, uuid_1.v4)(),
                companyId,
                documentType,
                s3Url,
                status: 'processing',
                manualReviewRequired: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: OCR_TABLE,
                Item: ocrDocument,
            }));
            try {
                // Analyze document with Textract
                const extractedData = await this.analyzeDocument(s3Url);
                const confidenceScore = this.calculateConfidenceScore(extractedData);
                // Update OCR document with results
                await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
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
                const result = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                    TableName: OCR_TABLE,
                    Key: { id: ocrDocument.id },
                }));
                return this.createResponse(200, {
                    success: true,
                    data: result.Item
                });
            }
            catch (analysisError) {
                // Update document with error
                await dynamoDoc.send(new lib_dynamodb_1.UpdateCommand({
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
        }
        catch (error) {
            console.error('Error processing document:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async getDocument(event) {
        try {
            const token = event.headers.Authorization?.replace('Bearer ', '');
            if (!token) {
                return this.createResponse(401, { success: false, error: 'Authentication required' });
            }
            const documentId = event.pathParameters?.id;
            if (!documentId) {
                return this.createResponse(400, { success: false, error: 'Document ID required' });
            }
            const result = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
                TableName: OCR_TABLE,
                Key: { id: documentId },
            }));
            if (!result.Item) {
                return this.createResponse(404, { success: false, error: 'Document not found' });
            }
            return this.createResponse(200, {
                success: true,
                data: result.Item
            });
        }
        catch (error) {
            console.error('Error getting document:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    async listDocuments(event) {
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
            const params = {
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
        }
        catch (error) {
            console.error('Error listing documents:', error);
            return this.createResponse(500, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }
    createResponse(statusCode, body) {
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
const handler = async (event) => {
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
                }
                else if (path.includes('/ocr/documents')) {
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
    }
    catch (error) {
        console.error('Unhandled error:', error);
        return ocrService.createResponse(500, {
            success: false,
            error: 'Internal server error',
        });
    }
};
exports.handler = handler;
