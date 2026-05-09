/**
 * TicketPreview Component - Vista previa de tickets POS
 * 
 * @description Componente React para previsualizar e imprimir tickets.
 * Soporta múltiples métodos de impresión:
 * - Browser print (window.print)
 * - PDF download
 * - ESC/POS USB (via backend)
 * - Bluetooth (Web Bluetooth API)
 * 
 * @version 1.0.0
 * @author Sistema Conectados
 */

import React, { useState, useEffect, useRef } from 'react';
import { Printer, Download, Eye, X, Bluetooth, Usb, Monitor } from 'lucide-react';

interface Invoice {
  id: number;
  number: number;
  full_number: string;
  tipo_comprobante: string;
  fecha: string;
  cliente_nombre: string;
  cliente_cuit?: string;
  total: number;
  subtotal?: number;
  iva?: number;
  items: Array<{
    name: string;
    qty: number;
    price: number;
    total: number;
  }>;
  afip_cae?: string;
  afip_cae_due_date?: string;
}

interface Printer {
  id: string;
  name: string;
  type: 'usb' | 'bluetooth' | 'browser' | 'pdf';
  enabled: boolean;
}

interface TicketPreviewProps {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
  onPrint?: () => void;
}

export const TicketPreview: React.FC<TicketPreviewProps> = ({
  invoice,
  isOpen,
  onClose,
  onPrint
}) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('browser');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Cargar HTML preview al abrir
  useEffect(() => {
    if (isOpen && invoice) {
      loadPreview();
      loadPrinters();
    }
  }, [isOpen, invoice]);

  const loadPreview = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/printer/preview/${invoice.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (!response.ok) throw new Error('Error cargando preview');

      const data = await response.json();
      
      if (data.success) {
        setHtmlContent(data.data.html);
      } else {
        throw new Error(data.error || 'Error desconocido');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando preview');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPrinters = async () => {
    try {
      const response = await fetch('/api/printer/printers', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPrinters(data.data);
        }
      }
    } catch {
      // Silencioso - usar browser como fallback
    }
  };

  // Imprimir vía browser (window.print)
  const handleBrowserPrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
      setPrintStatus('success');
      onPrint?.();
      
      setTimeout(() => setPrintStatus('idle'), 3000);
    }
  };

  // Descargar PDF
  const handlePDFDownload = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch(`/api/printer/pdf/${invoice.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (!response.ok) throw new Error('Error generando PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticket_${invoice.full_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      window.URL.revokeObjectURL(url);
      
      setPrintStatus('success');
      setTimeout(() => setPrintStatus('idle'), 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error descargando PDF');
      setPrintStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Imprimir vía backend (USB/Bluetooth)
  const handleBackendPrint = async () => {
    try {
      setIsLoading(true);
      setPrintStatus('printing');

      const response = await fetch(`/api/printer/print/${invoice.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          printerId: selectedPrinter === 'browser' ? undefined : selectedPrinter,
          method: selectedPrinter === 'browser' ? 'browser' : undefined,
          copies: 1
        })
      });

      if (!response.ok) throw new Error('Error en impresión');

      const data = await response.json();
      
      if (data.success) {
        // Si es browser, abrir en nueva ventana
        if (data.data.method === 'browser' && data.data.url) {
          window.open(data.data.url, '_blank', 'width=400,height=700');
        }
        
        setPrintStatus('success');
        onPrint?.();
      } else {
        throw new Error(data.error || 'Error en impresión');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error imprimiendo');
      setPrintStatus('error');
    } finally {
      setIsLoading(false);
      setTimeout(() => setPrintStatus('idle'), 3000);
    }
  };

  // Imprimir vía Bluetooth (Web Bluetooth API)
  const handleBluetoothPrint = async () => {
    try {
      setIsLoading(true);
      setPrintStatus('printing');

      // Verificar soporte Web Bluetooth
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth no soportado en este navegador. Usar Chrome/Edge.');
      }

      // Solicitar dispositivo Bluetooth
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Standard ESC/POS
          { namePrefix: 'Printer' }
        ],
        optionalServices: ['device_information']
      });

      const server = await device.gatt?.connect();
      if (!server) throw new Error('No se pudo conectar al dispositivo');

      // Obtener datos ESC/POS del backend
      const response = await fetch(`/api/printer/escpos/${invoice.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (!response.ok) throw new Error('Error obteniendo comandos ESC/POS');

      const data = await response.json();
      
      // Convertir base64 a buffer
      const escposBuffer = Uint8Array.from(atob(data.data.data), c => c.charCodeAt(0));

      // Enviar a impresora (simplificado - en producción usar característica específica)
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
      
      await characteristic.writeValue(escposBuffer);

      await server.disconnect();

      setPrintStatus('success');
      onPrint?.();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error Bluetooth');
      setPrintStatus('error');
    } finally {
      setIsLoading(false);
      setTimeout(() => setPrintStatus('idle'), 3000);
    }
  };

  const getPrinterIcon = (type: string) => {
    switch (type) {
      case 'usb': return <Usb className="w-4 h-4" />;
      case 'bluetooth': return <Bluetooth className="w-4 h-4" />;
      case 'browser': return <Monitor className="w-4 h-4" />;
      default: return <Printer className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Vista Previa de Ticket
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Preview */}
          <div className="flex-1 p-4 overflow-auto bg-gray-100">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-red-600">
                <p>Error: {error}</p>
                <button
                  onClick={loadPreview}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                className="w-full h-full bg-white shadow-lg"
                style={{ minHeight: '500px' }}
                title="Ticket Preview"
              />
            )}
          </div>

          {/* Sidebar - Print Options */}
          <div className="w-80 p-4 border-l bg-gray-50 flex flex-col gap-4">
            {/* Invoice Info */}
            <div className="bg-white p-3 rounded border">
              <h3 className="font-medium text-sm text-gray-700 mb-2">Factura</h3>
              <p className="text-sm"><strong>N°:</strong> {invoice.full_number}</p>
              <p className="text-sm"><strong>Total:</strong> ${invoice.total?.toFixed(2)}</p>
              <p className="text-sm"><strong>Cliente:</strong> {invoice.cliente_nombre || 'Consumidor Final'}</p>
            </div>

            {/* Printer Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Método de Impresión
              </label>
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="browser">
                  🖥️ Navegador (window.print)
                </option>
                <option value="pdf">
                  📄 Descargar PDF
                </option>
                {printers.map(printer => (
                  <option key={printer.id} value={printer.id}>
                    {getPrinterIcon(printer.type)} {printer.name}
                  </option>
                ))}
                <option value="bluetooth">
                  🔵 Bluetooth (Web API)
                </option>
              </select>
            </div>

            {/* Print Buttons */}
            <div className="space-y-2">
              {selectedPrinter === 'browser' && (
                <button
                  onClick={handleBrowserPrint}
                  disabled={isLoading || !htmlContent}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Printer className="w-4 h-4" />
                  {isLoading ? 'Imprimiendo...' : 'Imprimir (Navegador)'}
                </button>
              )}

              {selectedPrinter === 'pdf' && (
                <button
                  onClick={handlePDFDownload}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {isLoading ? 'Generando...' : 'Descargar PDF'}
                </button>
              )}

              {selectedPrinter === 'bluetooth' && (
                <button
                  onClick={handleBluetoothPrint}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  <Bluetooth className="w-4 h-4" />
                  {isLoading ? 'Conectando...' : 'Imprimir Bluetooth'}
                </button>
              )}

              {selectedPrinter !== 'browser' && selectedPrinter !== 'pdf' && selectedPrinter !== 'bluetooth' && (
                <button
                  onClick={handleBackendPrint}
                  disabled={isLoading || !htmlContent}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  {isLoading ? 'Imprimiendo...' : 'Imprimir'}
                </button>
              )}
            </div>

            {/* Status */}
            {printStatus === 'success' && (
              <div className="p-3 bg-green-100 text-green-800 rounded text-sm">
                ✅ Impresión exitosa
              </div>
            )}
            {printStatus === 'error' && (
              <div className="p-3 bg-red-100 text-red-800 rounded text-sm">
                ❌ Error en impresión
              </div>
            )}

            {/* Instructions */}
            <div className="mt-auto p-3 bg-blue-50 rounded text-xs text-blue-800">
              <strong>Tip:</strong> Para impresoras térmicas USB, usa Chrome/Edge y permite acceso cuando lo solicite.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketPreview;
