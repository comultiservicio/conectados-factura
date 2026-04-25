-- Conectados Factura+ Database Schema
-- PostgreSQL Schema for RDS Database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable timestamp with timezone
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Create custom types
CREATE TYPE invoice_type AS ENUM ('A', 'B', 'C');
CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'posnet', 'qr_mercado_pago', 'stripe');
CREATE TYPE document_type AS ENUM ('factura', 'remito', 'nota_credito', 'nota_debito');
CREATE TYPE user_role AS ENUM ('admin', 'driver', 'customer', 'viewer');
CREATE TYPE sync_status AS ENUM ('pending', 'synced', 'failed');
CREATE TYPE movement_type AS ENUM ('in', 'out', 'adjustment');

-- Users and Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'driver',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    cognito_sub VARCHAR(255) UNIQUE,
    company_id UUID REFERENCES companies(id)
);

-- Companies/Organizations
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(20) UNIQUE NOT NULL, -- CUIT/CUIL
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    afip_certificate_url VARCHAR(500),
    afip_key_url VARCHAR(500)
);

-- Products Catalog
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    unit VARCHAR(50) NOT NULL, -- kg, unidad, caja, etc.
    price DECIMAL(12, 2) NOT NULL,
    cost DECIMAL(12, 2),
    iva_rate DECIMAL(5, 2) DEFAULT 21.00, -- 21%, 10.5%, 0%
    is_active BOOLEAN DEFAULT true,
    barcode VARCHAR(50),
    min_stock_level INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, sku)
);

-- Stock Management
CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) NOT NULL,
    warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
    movement_type movement_type NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(12, 2),
    reference_id UUID, -- Can reference invoice, purchase order, etc.
    reference_type VARCHAR(50), -- 'invoice', 'purchase', 'adjustment'
    driver_id UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

CREATE TABLE current_stock (
    product_id UUID REFERENCES products(id) NOT NULL,
    warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, warehouse_id)
);

-- Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(20), -- CUIT/CUIL
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    credit_limit DECIMAL(12, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, tax_id)
);

-- Invoices and Documents
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    customer_id UUID REFERENCES customers(id) NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    invoice_type invoice_type NOT NULL,
    document_type document_type NOT NULL DEFAULT 'factura',
    cae VARCHAR(20), -- Código de Autorización Electrónica
    cae_due_date DATE,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount DECIMAL(12, 2) NOT NULL,
    net_amount DECIMAL(12, 2) NOT NULL,
    iva_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    other_taxes DECIMAL(12, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'ARS',
    exchange_rate DECIMAL(10, 4) DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft', -- draft, issued, cancelled, paid
    notes TEXT,
    driver_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    UNIQUE(company_id, invoice_number, invoice_type)
);

CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    discount_rate DECIMAL(5, 2) DEFAULT 0,
    iva_rate DECIMAL(5, 2) NOT NULL,
    total_line DECIMAL(12, 2) NOT NULL,
    notes TEXT
);

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) NOT NULL,
    payment_method payment_method NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_number VARCHAR(100), -- Bank transfer reference, posnet batch, etc.
    status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, failed, cancelled
    external_id VARCHAR(255), -- Mercado Pago/Stripe transaction ID
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Synchronization and Offline Support
CREATE TABLE sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'invoice', 'stock_movement', 'payment'
    entity_id UUID NOT NULL,
    operation VARCHAR(20) NOT NULL, -- 'create', 'update', 'delete'
    data JSONB NOT NULL, -- Serialized entity data
    status sync_status DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Driver Routes and Visits
CREATE TABLE driver_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES users(id) NOT NULL,
    route_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'planned', -- planned, in_progress, completed, cancelled
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    total_distance INTEGER, -- in kilometers
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID REFERENCES driver_routes(id),
    driver_id UUID REFERENCES users(id) NOT NULL,
    customer_id UUID REFERENCES customers(id) NOT NULL,
    visit_date DATE NOT NULL,
    arrival_time TIMESTAMP WITH TIME ZONE,
    departure_time TIMESTAMP WITH TIME ZONE,
    purpose VARCHAR(100), -- 'delivery', 'sale', 'collection', 'visit'
    notes TEXT,
    gps_location POINT, -- PostGIS point for location
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- OCR Processing
CREATE TABLE ocr_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    document_type document_type NOT NULL,
    s3_url VARCHAR(500) NOT NULL,
    extracted_data JSONB,
    confidence_score DECIMAL(5, 2),
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    processed_at TIMESTAMP WITH TIME ZONE,
    manual_review_required BOOLEAN DEFAULT false,
    reviewer_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Audit Trail
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System Configuration
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, key)
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_cognito_sub ON users(cognito_sub);
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_products_company_id ON products(company_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_warehouse_id ON stock_movements(warehouse_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX idx_invoices_company_id ON invoices(company_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_sync_queue_user_id ON sync_queue(user_id);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);
CREATE INDEX idx_sync_queue_created_at ON sync_queue(created_at);
CREATE INDEX idx_driver_routes_driver_id ON driver_routes(driver_id);
CREATE INDEX idx_driver_routes_route_date ON driver_routes(route_date);
CREATE INDEX idx_customer_visits_customer_id ON customer_visits(customer_id);
CREATE INDEX idx_customer_visits_visit_date ON customer_visits(visit_date);
CREATE INDEX idx_ocr_documents_status ON ocr_documents(status);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at column
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_visits_updated_at BEFORE UPDATE ON customer_visits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ocr_documents_updated_at BEFORE UPDATE ON ocr_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for stock management
CREATE OR REPLACE FUNCTION update_current_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO current_stock (product_id, warehouse_id, quantity)
        VALUES (NEW.product_id, NEW.warehouse_id, NEW.quantity)
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            quantity = current_stock.quantity + NEW.quantity,
            last_updated = CURRENT_TIMESTAMP;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle stock adjustments
        UPDATE current_stock SET
            quantity = current_stock.quantity + (NEW.quantity - OLD.quantity),
            last_updated = CURRENT_TIMESTAMP
        WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE current_stock SET
            quantity = current_stock.quantity - OLD.quantity,
            last_updated = CURRENT_TIMESTAMP
        WHERE product_id = OLD.product_id AND warehouse_id = OLD.warehouse_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER stock_movement_trigger
    AFTER INSERT OR UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION update_current_stock();

-- Audit trigger
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        COALESCE(current_setting('app.current_user_id', true)::UUID, NULL),
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Apply audit trigger to important tables
CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_invoices_trigger
    AFTER INSERT OR UPDATE OR DELETE ON invoices
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_payments_trigger
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Views for common queries
CREATE VIEW customer_balance AS
SELECT 
    c.id as customer_id,
    c.name as customer_name,
    COALESCE(SUM(i.total_amount), 0) as total_invoiced,
    COALESCE(SUM(p.amount), 0) as total_paid,
    COALESCE(SUM(i.total_amount), 0) - COALESCE(SUM(p.amount), 0) as balance
FROM customers c
LEFT JOIN invoices i ON c.id = i.customer_id AND i.status != 'cancelled'
LEFT JOIN payments p ON i.id = p.invoice_id AND p.status = 'confirmed'
GROUP BY c.id, c.name;

CREATE VIEW stock_summary AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.sku,
    w.name as warehouse_name,
    COALESCE(cs.quantity, 0) as current_quantity,
    p.min_stock_level,
    CASE 
        WHEN COALESCE(cs.quantity, 0) <= p.min_stock_level THEN 'critical'
        WHEN COALESCE(cs.quantity, 0) <= p.min_stock_level * 2 THEN 'low'
        ELSE 'normal'
    END as stock_status
FROM products p
CROSS JOIN warehouses w
LEFT JOIN current_stock cs ON p.id = cs.product_id AND w.id = cs.warehouse_id
WHERE p.is_active = true AND w.is_active = true;

-- Default system settings
INSERT INTO system_settings (company_id, key, value, description) VALUES
((SELECT id FROM companies LIMIT 1), 'afip_environment', '"testing"', 'AFIP environment: testing or production'),
((SELECT id FROM companies LIMIT 1), 'default_iva_rate', '21.0', 'Default IVA rate for products'),
((SELECT id FROM companies LIMIT 1), 'auto_sync_interval', '300', 'Auto sync interval in seconds'),
((SELECT id FROM companies LIMIT 1), 'low_stock_alert_threshold', '10', 'Low stock alert threshold percentage'),
((SELECT id FROM companies LIMIT 1), 'currency', '"ARS"', 'Default currency'),
((SELECT id FROM companies LIMIT 1), 'timezone', '"America/Argentina/Buenos_Aires"', 'Default timezone');

-- Sample data for testing (remove in production)
INSERT INTO companies (id, name, tax_id, email) VALUES
('00000000-0000-0000-0000-000000000001', 'Conectados Multiservicio', '30-12345678-9', 'info@conectadosfactura.com');

INSERT INTO users (id, email, password_hash, first_name, last_name, role, company_id) VALUES
('00000000-0000-0000-0000-000000000001', 'admin@conectadosfactura.com', '$2b$12$dummy_hash', 'Admin', 'User', 'admin', '00000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000002', 'driver@conectadosfactura.com', '$2b$12$dummy_hash', 'Chofer', 'Test', 'driver', '00000000-0000-0000-0000-000000000001');

INSERT INTO warehouses (id, company_id, name) VALUES
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Depósito Principal');

INSERT INTO products (id, company_id, sku, name, unit, price, iva_rate) VALUES
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'POLLO-001', 'Pollo Entero', 'kg', 1500.00, 21.00),
('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'POLLO-002', 'Pechuga de Pollo', 'kg', 1800.00, 21.00);

INSERT INTO customers (id, company_id, name, tax_id) VALUES
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Acá no más', '20-98765432-1');
