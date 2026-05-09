-- Migración 001: Tablas para integración AFIP
-- Crea tablas necesarias para tracking de facturas electrónicas AFIP

-- Tabla de facturas pendientes de autorización AFIP
CREATE TABLE IF NOT EXISTS afip_pending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL UNIQUE,
  attempts INTEGER DEFAULT 0,
  last_attempt DATETIME,
  next_retry DATETIME,
  last_error TEXT,
  error_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX idx_afip_pending_invoice ON afip_pending(invoice_id);
CREATE INDEX idx_afip_pending_retry ON afip_pending(next_retry);

-- Tabla de logs de eventos AFIP
CREATE TABLE IF NOT EXISTS afip_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  event_type TEXT NOT NULL, -- 'SUCCESS', 'RETRY_FAILED', 'MANUAL_RETRY', etc.
  message TEXT,
  details TEXT, -- JSON
  response_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);

CREATE INDEX idx_afip_logs_invoice ON afip_logs(invoice_id);
CREATE INDEX idx_afip_logs_event ON afip_logs(event_type);
CREATE INDEX idx_afip_logs_date ON afip_logs(created_at);

-- Tabla de auditoría de archivos XML
CREATE TABLE IF NOT EXISTS afip_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pos INTEGER,
  invoice_number INTEGER,
  type TEXT NOT NULL, -- 'request', 'response', 'error'
  filename TEXT NOT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_afip_audit_pos ON afip_audit_logs(pos);
CREATE INDEX idx_afip_audit_number ON afip_audit_logs(invoice_number);
CREATE INDEX idx_afip_audit_date ON afip_audit_logs(created_at);

-- Tabla de health check de servidores AFIP
CREATE TABLE IF NOT EXISTS afip_health_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_server INTEGER, -- 1=OK, 0=FAIL
  db_server INTEGER,
  auth_server INTEGER,
  details TEXT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_afip_health_date ON afip_health_logs(checked_at);

-- Tabla de reportes diarios
CREATE TABLE IF NOT EXISTS afip_daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date DATE UNIQUE NOT NULL,
  total_invoices INTEGER DEFAULT 0,
  authorized INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  pending INTEGER DEFAULT 0,
  avg_response_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_afip_reports_date ON afip_daily_reports(report_date);

-- Tabla de alertas del sistema (reutilizable)
CREATE TABLE IF NOT EXISTS system_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL, -- 'AFIP_RETRY_EXHAUSTED', 'AFIP_SERVERS_DOWN', etc.
  message TEXT NOT NULL,
  data TEXT, -- JSON
  acknowledged INTEGER DEFAULT 0,
  acknowledged_at DATETIME,
  acknowledged_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_system_alerts_type ON system_alerts(alert_type);
CREATE INDEX idx_system_alerts_ack ON system_alerts(acknowledged);
CREATE INDEX idx_system_alerts_date ON system_alerts(created_at);

-- Actualizar tabla de facturas con campos AFIP
ALTER TABLE invoices ADD COLUMN afip_status TEXT DEFAULT 'pending' 
  CHECK(afip_status IN ('pending', 'authorized', 'failed', 'manual'));

ALTER TABLE invoices ADD COLUMN afip_cae TEXT;
ALTER TABLE invoices ADD COLUMN afip_cae_due_date DATE;
ALTER TABLE invoices ADD COLUMN afip_response_date DATETIME;
ALTER TABLE invoices ADD COLUMN afip_error TEXT;
ALTER TABLE invoices ADD COLUMN afip_request_count INTEGER DEFAULT 0;

CREATE INDEX idx_invoices_afip_status ON invoices(afip_status);
