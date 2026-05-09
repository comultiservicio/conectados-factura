import React, { useState, useCallback } from 'react';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Check, X, AlertCircle } from 'lucide-react';
import { useAlerts } from './Alerts';
import { Table } from './ui';
import './ImportExcel.css';

// Schema for validating imported data
const importRowSchema = z.object({
  fecha: z.string().min(1, 'Fecha requerida'),
  descripcion: z.string().min(1, 'Descripción requerida'),
  monto: z.number().positive('El monto debe ser positivo'),
  tipo: z.enum(['ingreso', 'egreso', 'Ingreso', 'Egreso', 'INGRESO', 'EGRESO']),
});

interface ParsedRow {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: string;
  _raw: Record<string, any>;
}

interface ValidationResult {
  row: ParsedRow;
  valid: boolean;
  errors?: string[];
}

const ImportExcel: React.FC = () => {
  const { showSuccess, showError } = useAlerts();
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [parsedData, setParsedData] = useState<ValidationResult[]>([]);
  const [, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = (file: File) => {
    setIsLoading(true);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        let parsedRows: ParsedRow[] = [];

        if (file.name.endsWith('.csv')) {
          // Parse CSV
          const text = data as string;
          const rows = text.split('\n').filter(row => row.trim());
          const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
          
          parsedRows = rows.slice(1).map((row) => {
            const values = row.split(',').map(v => v.trim());
            const rowData: Record<string, any> = {};
            headers.forEach((header, i) => {
              rowData[header] = values[i];
            });
            return mapRowData(rowData);
          });
        } else {
          // Parse Excel
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          
          parsedRows = jsonData.map((row: any) => mapRowData(row));
        }

        // Validate each row
        const validated = parsedRows.map((row): ValidationResult => {
          const result = importRowSchema.safeParse({
            fecha: row.fecha,
            descripcion: row.descripcion,
            monto: row.monto,
            tipo: row.tipo.toLowerCase(),
          });

          if (result.success) {
            return { row, valid: true };
          } else {
            return {
              row,
              valid: false,
              errors: result.error.errors.map(e => e.message),
            };
          }
        });

        setParsedData(validated);
        setShowPreview(true);
        
        const validCount = validated.filter(r => r.valid).length;
        if (validCount > 0) {
          showSuccess(`${validCount} filas válidas listas para importar`);
        }
        
        if (validated.some(r => !r.valid)) {
          showError(`${validated.filter(r => !r.valid).length} filas tienen errores`);
        }
      } catch (err) {
        showError('Error al procesar el archivo');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const mapRowData = (rawRow: Record<string, any>): ParsedRow => {
    // Try to map common column names
    const fecha = rawRow.fecha || rawRow.Fecha || rawRow.date || rawRow.Date || rawRow[Object.keys(rawRow)[0]];
    const descripcion = rawRow.descripcion || rawRow.Descripcion || rawRow.DESCRIPCION || rawRow.description || rawRow.Description || rawRow[Object.keys(rawRow)[1]];
    const monto = parseFloat(rawRow.monto || rawRow.Monto || rawRow.MONTO || rawRow.amount || rawRow.Amount || rawRow[Object.keys(rawRow)[2]]);
    const tipo = rawRow.tipo || rawRow.Tipo || rawRow.TIPO || rawRow.type || rawRow.Type || rawRow[Object.keys(rawRow)[3]] || 'egreso';

    return {
      fecha: fecha?.toString() || '',
      descripcion: descripcion?.toString() || '',
      monto: isNaN(monto) ? 0 : monto,
      tipo: tipo?.toString() || 'egreso',
      _raw: rawRow,
    };
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        processFile(file);
      } else {
        showError('Solo se permiten archivos .xlsx, .xls o .csv');
      }
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleImport = () => {
    const validRows = parsedData.filter(r => r.valid);
    
    // Here you would typically send the data to your backend
    console.log('Importing rows:', validRows);
    
    showSuccess(`${validRows.length} registros importados correctamente`);
    setParsedData([]);
    setShowPreview(false);
    setFileName('');
  };

  const handleCancel = () => {
    setParsedData([]);
    setShowPreview(false);
    setFileName('');
  };

  const validCount = parsedData.filter(r => r.valid).length;
  const invalidCount = parsedData.filter(r => !r.valid).length;

  return (
    <div className="import-excel">
      <div className="import-header">
        <h2>Importar Excel</h2>
        <p>Sube un archivo Excel o CSV con tus ingresos y egresos</p>
      </div>

      {!showPreview ? (
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="drop-zone-content">
            <div className="drop-icon">
              <Upload size={48} />
            </div>
            <h3>Arrastra tu archivo aquí</h3>
            <p>o</p>
            <label className="file-input-label">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInput}
                aria-label="Seleccionar archivo Excel"
              />
              <span className="btn-secondary">Seleccionar archivo</span>
            </label>
            <p className="file-types">Formatos soportados: .xlsx, .xls, .csv</p>
          </div>
        </div>
      ) : (
        <div className="preview-section">
          <div className="preview-header">
            <div className="file-info">
              <FileSpreadsheet size={24} />
              <span className="file-name">{fileName}</span>
            </div>
            <div className="validation-summary">
              <span className="valid-badge">
                <Check size={16} />
                {validCount} válidos
              </span>
              {invalidCount > 0 && (
                <span className="invalid-badge">
                  <X size={16} />
                  {invalidCount} con errores
                </span>
              )}
            </div>
          </div>

          <div className="preview-table-container">
            <Table
              data={parsedData}
              columns={[
                {
                  key: 'valid',
                  header: 'Estado',
                  render: (item: ValidationResult) => (
                    <span className={`status-badge ${item.valid ? 'valid' : 'invalid'}`}>
                      {item.valid ? <Check size={16} /> : <AlertCircle size={16} />}
                      {item.valid ? 'Válido' : 'Error'}
                    </span>
                  ),
                },
                {
                  key: 'row',
                  header: 'Fecha',
                  render: (item: ValidationResult) => item.row.fecha,
                },
                {
                  key: 'row',
                  header: 'Descripción',
                  render: (item: ValidationResult) => item.row.descripcion,
                },
                {
                  key: 'row',
                  header: 'Monto',
                  render: (item: ValidationResult) => 
                    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.row.monto),
                },
                {
                  key: 'row',
                  header: 'Tipo',
                  render: (item: ValidationResult) => (
                    <span className={`type-badge ${item.row.tipo.toLowerCase()}`}>
                      {item.row.tipo}
                    </span>
                  ),
                },
                {
                  key: 'errors',
                  header: 'Errores',
                  render: (item: ValidationResult) => 
                    item.errors ? (
                      <ul className="error-list">
                        {item.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    ) : '-',
                },
              ]}
              itemsPerPage={5}
            />
          </div>

          <div className="preview-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              Cancelar
            </button>
            <button 
              className="btn-primary" 
              onClick={handleImport}
              disabled={validCount === 0}
            >
              Importar {validCount} registros
            </button>
          </div>
        </div>
      )}

      <div className="import-instructions">
        <h3>Formato esperado</h3>
        <p>El archivo debe contener las siguientes columnas:</p>
        <div className="columns-example">
          <code>Fecha | Descripción | Monto | Tipo</code>
        </div>
        <p className="example-title">Ejemplo de datos:</p>
        <div className="data-example">
          <pre>{`2026-04-27 | Venta producto A | 1500 | Ingreso
2026-04-27 | Compra insumos | 500 | Egreso
2026-04-28 | Servicio técnico | 2000 | Ingreso`}</pre>
        </div>
      </div>
    </div>
  );
};

export default ImportExcel;
