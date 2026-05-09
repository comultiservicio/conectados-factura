-- Migración 002: Tablas para Cierre de Caja (Cash Register)
-- Sistema completo de gestión de caja para POS

-- Tabla principal de cierres de caja
CREATE TABLE IF NOT EXISTS cash_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  pos_id INTEGER DEFAULT 1,
  
  -- Fechas del período
  opening_date DATETIME NOT NULL,
  closing_date DATETIME,
  
  -- Montos iniciales
  initial_cash DECIMAL(12, 2) DEFAULT 0.00,
  
  -- Ventas del período
  total_sales DECIMAL(12, 2) DEFAULT 0.00,
  total_sales_count INTEGER DEFAULT 0,
  
  -- Por tipo de pago
  cash_sales DECIMAL(12, 2) DEFAULT 0.00,
  cash_sales_count INTEGER DEFAULT 0,
  
  debit_sales DECIMAL(12, 2) DEFAULT 0.00,
  debit_sales_count INTEGER DEFAULT 0,
  
  credit_sales DECIMAL(12, 2) DEFAULT 0.00,
  credit_sales_count INTEGER DEFAULT 0,
  
  transfer_sales DECIMAL(12, 2) DEFAULT 0.00,
  transfer_sales_count INTEGER DEFAULT 0,
  
  mercadopago_sales DECIMAL(12, 2) DEFAULT 0.00,
  mercadopago_sales_count INTEGER DEFAULT 0,
  
  other_sales DECIMAL(12, 2) DEFAULT 0.00,
  other_sales_count INTEGER DEFAULT 0,
  
  -- Reimpresiones y correcciones
  reprints_count INTEGER DEFAULT 0,
  cancellations_count INTEGER DEFAULT 0,
  cancellations_amount DECIMAL(12, 2) DEFAULT 0.00,
  
  -- Retiros (extracciones de caja)
  withdrawals DECIMAL(12, 2) DEFAULT 0.00,
  withdrawals_count INTEGER DEFAULT 0,
  
  -- Arqueo de caja (conteo físico)
  physical_cash DECIMAL(12, 2),
  physical_coins DECIMAL(12, 2),
  physical_other DECIMAL(12, 2),
  
  -- Diferencia arqueo vs sistema
  cash_difference DECIMAL(12, 2),
  
  -- Observaciones
  notes TEXT,
  closed_by INTEGER,
  
  -- Estado
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closing', 'closed', 'verified')),
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

CREATE INDEX idx_cash_closings_user ON cash_closings(user_id);
CREATE INDEX idx_cash_closings_status ON cash_closings(status);
CREATE INDEX idx_cash_closings_opening ON cash_closings(opening_date);
CREATE INDEX idx_cash_closings_closing ON cash_closings(closing_date);

-- Tabla de movimientos de caja (incomes/expenses)
CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_closing_id INTEGER NOT NULL,
  
  -- Tipo de movimiento
  type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'withdrawal')),
  
  -- Categoría
  category TEXT NOT NULL CHECK(category IN (
    'sale', 'withdrawal', 'supplier_payment', 'expense', 
    'refund', 'adjustment', 'opening_balance', 'other'
  )),
  
  -- Monto
  amount DECIMAL(12, 2) NOT NULL,
  
  -- Método de pago
  payment_method TEXT CHECK(payment_method IN (
    'cash', 'debit', 'credit', 'transfer', 'mercadopago', 'other'
  )),
  
  -- Referencia
  reference_id INTEGER, -- ID de factura, etc.
  reference_type TEXT,  -- 'invoice', 'expense_note', etc.
  
  -- Descripción
  description TEXT,
  
  -- Usuario que realizó el movimiento
  user_id INTEGER NOT NULL,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (cash_closing_id) REFERENCES cash_closings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_cash_movements_closing ON cash_movements(cash_closing_id);
CREATE INDEX idx_cash_movements_type ON cash_movements(type);
CREATE INDEX idx_cash_movements_category ON cash_movements(category);
CREATE INDEX idx_cash_movements_created ON cash_movements(created_at);

-- Tabla de detalle de arqueo (conteo por denominación)
CREATE TABLE IF NOT EXISTS cash_count_detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_closing_id INTEGER NOT NULL,
  
  -- Denominación
  denomination_type TEXT NOT NULL CHECK(denomination_type IN ('bill', 'coin', 'other')),
  denomination_value DECIMAL(10, 2) NOT NULL, -- Valor de la denominación (ej: 1000.00)
  quantity INTEGER NOT NULL, -- Cantidad de billetes/monedas
  
  -- Total calculado
  total_amount DECIMAL(12, 2) GENERATED ALWAYS AS (denomination_value * quantity) STORED,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (cash_closing_id) REFERENCES cash_closings(id) ON DELETE CASCADE
);

CREATE INDEX idx_cash_count_closing ON cash_count_detail(cash_closing_id);

-- Tabla de retiros/extracciones (con detalle)
CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_closing_id INTEGER NOT NULL,
  
  -- Monto retirado
  amount DECIMAL(12, 2) NOT NULL,
  
  -- Motivo
  reason TEXT NOT NULL CHECK(reason IN (
    'cash_delivery', 'supplier_payment', 'expense', 
    'bank_deposit', 'change', 'other'
  )),
  
  -- Descripción adicional
  description TEXT,
  
  -- Quién autorizó/retiró
  withdrawn_by TEXT,
  
  -- Usuario que registró
  user_id INTEGER NOT NULL,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (cash_closing_id) REFERENCES cash_closings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_cash_withdrawals_closing ON cash_withdrawals(cash_closing_id);

-- Vista resumen de cierres
CREATE VIEW IF NOT EXISTS v_cash_closing_summary AS
SELECT 
  cc.id,
  cc.user_id,
  u.name as user_name,
  cc.pos_id,
  cc.opening_date,
  cc.closing_date,
  cc.initial_cash,
  cc.total_sales,
  cc.cash_sales,
  cc.debit_sales,
  cc.credit_sales,
  cc.withdrawals,
  cc.physical_cash,
  cc.cash_difference,
  cc.status,
  cc.notes,
  (cc.initial_cash + cc.cash_sales - cc.withdrawals) as expected_cash,
  (SELECT COUNT(*) FROM cash_movements cm WHERE cm.cash_closing_id = cc.id) as movement_count
FROM cash_closings cc
LEFT JOIN users u ON cc.user_id = u.id;

-- Trigger para actualizar updated_at
CREATE TRIGGER IF NOT EXISTS trg_cash_closings_updated
AFTER UPDATE ON cash_closings
BEGIN
  UPDATE cash_closings 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = NEW.id;
END;
