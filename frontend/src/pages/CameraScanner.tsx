import React, { useState, useRef, useCallback } from 'react';
import { Camera, Upload, X, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useAlerts } from '../components';
import './CameraScanner.css';

interface ScannedDocument {
  id: string;
  image: string;
  type: 'boleta' | 'factura' | 'ticket';
  amount?: number;
  date?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

const CameraScanner: React.FC = () => {
  const { showSuccess, showError } = useAlerts();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scannedDocs, setScannedDocs] = useState<ScannedDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Simulación de OCR - en producción usaría Tesseract.js o API backend
  const processImage = useCallback(async (imageData: string): Promise<ScannedDocument> => {
    setIsProcessing(true);
    
    // Simular procesamiento OCR
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generar datos simulados
    const mockAmount = Math.floor(Math.random() * 5000) + 100;
    const mockDate = new Date().toLocaleDateString('es-AR');
    
    setIsProcessing(false);
    
    return {
      id: Date.now().toString(),
      image: imageData,
      type: 'boleta',
      amount: mockAmount,
      date: mockDate,
      status: 'completed',
    };
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      showError('No se pudo acceder a la cámara. Verifique los permisos.');
      console.error('Camera error:', err);
    }
  }, [showError]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  const captureImage = useCallback(async () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(videoRef.current, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    // Procesar imagen
    const doc = await processImage(imageData);
    setScannedDocs(prev => [doc, ...prev]);
    
    showSuccess('Documento escaneado correctamente');
    stopCamera();
  }, [processImage, showSuccess, stopCamera]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageData = event.target?.result as string;
      if (imageData) {
        const doc = await processImage(imageData);
        setScannedDocs(prev => [doc, ...prev]);
        showSuccess('Imagen cargada correctamente');
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [processImage, showSuccess]);

  const removeDocument = useCallback((id: string) => {
    setScannedDocs(prev => prev.filter(doc => doc.id !== id));
    showSuccess('Documento eliminado');
  }, [showSuccess]);

  const approveDocument = useCallback((id: string) => {
    setScannedDocs(prev => prev.map(doc => 
      doc.id === id ? { ...doc, status: 'completed' } : doc
    ));
    showSuccess('Documento aprobado y guardado');
  }, [showSuccess]);

  return (
    <div className="camera-scanner-page">
      <div className="scanner-header">
        <h1>Carga de Boletas</h1>
        <p>Escanea o carga imágenes de boletas, facturas y tickets</p>
      </div>

      <div className="scanner-content">
        {/* Camera/Upload Section */}
        <div className="scanner-actions">
          {isCameraActive ? (
            <div className="camera-view">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline
                className="camera-video"
              />
              <div className="camera-overlay">
                <div className="camera-frame">
                  <div className="corner top-left" />
                  <div className="corner top-right" />
                  <div className="corner bottom-left" />
                  <div className="corner bottom-right" />
                </div>
                <p className="camera-hint">Enfoca el documento dentro del marco</p>
              </div>
              <div className="camera-controls">
                <button 
                  className="btn-capture"
                  onClick={captureImage}
                  disabled={isProcessing}
                  aria-label="Capturar imagen"
                  title="Capturar"
                >
                  {isProcessing ? <RefreshCw className="spin" /> : <Camera />}
                </button>
                <button 
                  className="btn-cancel"
                  onClick={stopCamera}
                  aria-label="Cancelar cámara"
                  title="Cancelar"
                >
                  <X />
                </button>
              </div>
            </div>
          ) : (
            <div className="upload-section">
              <div className="upload-options">
                <button 
                  className="upload-btn primary"
                  onClick={startCamera}
                >
                  <Camera size={32} />
                  <span>Usar Cámara</span>
                </button>
                
                <div className="divider">o</div>
                
                <button 
                  className="upload-btn secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={32} />
                  <span>Cargar Imagen</span>
                </button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  aria-label="Cargar imagen desde archivo"
                  title="Seleccionar archivo"
                />
              </div>
              
              <div className="supported-formats">
                <AlertCircle size={14} />
                <span>Formatos soportados: JPG, PNG, PDF</span>
              </div>
            </div>
          )}
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="processing-indicator">
            <RefreshCw className="spin" size={24} />
            <span>Procesando imagen con OCR...</span>
          </div>
        )}

        {/* Scanned Documents List */}
        <div className="scanned-docs">
          <h2>Documentos Escaneados</h2>
          
          {scannedDocs.length === 0 ? (
            <div className="empty-state">
              <Camera size={48} opacity={0.3} />
              <p>No hay documentos escaneados</p>
            </div>
          ) : (
            <div className="docs-grid">
              {scannedDocs.map((doc) => (
                <div 
                  key={doc.id} 
                  className={`doc-card ${doc.status}`}
                >
                  <div className="doc-image">
                    <img src={doc.image} alt="Documento escaneado" />
                  </div>
                  
                  <div className="doc-info">
                    <span className="doc-type">{doc.type.toUpperCase()}</span>
                    {doc.amount && (
                      <span className="doc-amount">
                        ${doc.amount.toLocaleString('es-AR')}
                      </span>
                    )}
                    {doc.date && (
                      <span className="doc-date">{doc.date}</span>
                    )}
                  </div>
                  
                  <div className="doc-actions">
                    {doc.status === 'pending' && (
                      <>
                        <button 
                          className="btn-approve"
                          onClick={() => approveDocument(doc.id)}
                          title="Aprobar"
                        >
                          <Check size={18} />
                        </button>
                        <button 
                          className="btn-retry"
                          onClick={() => removeDocument(doc.id)}
                          title="Eliminar"
                        >
                          <X size={18} />
                        </button>
                      </>
                    )}
                    {doc.status === 'completed' && (
                      <span className="status-badge completed">
                        <Check size={14} />
                        Guardado
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        {scannedDocs.length > 0 && (
          <div className="scanner-summary">
            <div className="summary-row">
              <span>Total Documentos:</span>
              <strong>{scannedDocs.length}</strong>
            </div>
            <div className="summary-row">
              <span>Monto Total:</span>
              <strong>
                ${scannedDocs
                  .filter(d => d.amount)
                  .reduce((sum, d) => sum + (d.amount || 0), 0)
                  .toLocaleString('es-AR')}
              </strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraScanner;
