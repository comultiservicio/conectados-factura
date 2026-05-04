const dbConnection = require('../database/connection');

class FacturaService {
  constructor() {
    this.db = dbConnection.getInstance();
  }

  list() {
    const stmt = this.db.prepare(`
      SELECT id, numero, fecha, cliente_nombre, cliente_cuit, items, subtotal, iva, total, estado, user_id, created_at, updated_at
      FROM facturas
      ORDER BY id DESC
    `);
    return stmt.all().map(this.parseFacturaRow);
  }

  getById(id) {
    const stmt = this.db.prepare(`
      SELECT id, numero, fecha, cliente_nombre, cliente_cuit, items, subtotal, iva, total, estado, user_id, created_at, updated_at
      FROM facturas
      WHERE id = ?
    `);
    const row = stmt.get(id);
    return row ? this.parseFacturaRow(row) : null;
  }

  create(payload) {
    const stmt = this.db.prepare(`
      INSERT INTO facturas (
        numero, fecha, cliente_nombre, cliente_cuit, items, subtotal, iva, total, estado, user_id, created_at, updated_at
      ) VALUES (
        @numero, @fecha, @cliente_nombre, @cliente_cuit, @items, @subtotal, @iva, @total, @estado, @user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run({
      numero: payload.numero,
      fecha: payload.fecha,
      cliente_nombre: payload.cliente_nombre,
      cliente_cuit: payload.cliente_cuit || null,
      items: JSON.stringify(payload.items || []),
      subtotal: Number(payload.subtotal || 0),
      iva: Number(payload.iva || 0),
      total: Number(payload.total || 0),
      estado: payload.estado || 'borrador',
      user_id: payload.user_id || null
    });

    return this.getById(result.lastInsertRowid);
  }

  update(id, payload) {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const merged = {
      ...existing,
      ...payload,
      items: payload.items !== undefined ? payload.items : existing.items
    };

    const stmt = this.db.prepare(`
      UPDATE facturas
      SET numero = @numero,
          fecha = @fecha,
          cliente_nombre = @cliente_nombre,
          cliente_cuit = @cliente_cuit,
          items = @items,
          subtotal = @subtotal,
          iva = @iva,
          total = @total,
          estado = @estado,
          user_id = @user_id,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    stmt.run({
      id: Number(id),
      numero: merged.numero,
      fecha: merged.fecha,
      cliente_nombre: merged.cliente_nombre,
      cliente_cuit: merged.cliente_cuit || null,
      items: JSON.stringify(merged.items || []),
      subtotal: Number(merged.subtotal || 0),
      iva: Number(merged.iva || 0),
      total: Number(merged.total || 0),
      estado: merged.estado || 'borrador',
      user_id: merged.user_id || null
    });

    return this.getById(id);
  }

  remove(id) {
    const stmt = this.db.prepare('DELETE FROM facturas WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  parseFacturaRow(row) {
    return {
      ...row,
      items: row.items ? JSON.parse(row.items) : []
    };
  }
}

module.exports = new FacturaService();