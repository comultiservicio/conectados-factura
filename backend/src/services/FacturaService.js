/**
 * Servicio de Facturas - CRUD con SQLite
 * Reemplaza operaciones DynamoDB
 * @module services/FacturaService
 */

const db = require('../database/connection');

class FacturaService {
  constructor() {
    this.db = db.getInstance();
  }

  /**
   * Crea una nueva factura
   * @param {Object} factura - Datos de la factura
   * @returns {Object} Factura creada con ID
   */
  async create(factura) {
    const stmt = this.db.prepare(`
      INSERT INTO facturas (numero, cliente, cuit, total, items, estado, vendedor_id)
      VALUES (@numero, @cliente, @cuit, @total, @items, @estado, @vendedor_id)
    `);

    const result = stmt.run({
      numero: factura.numero,
      cliente: factura.cliente,
      cuit: factura.cuit || null,
      total: factura.total,
      items: JSON.stringify(factura.items),
      estado: factura.estado || 'pendiente',
      vendedor_id: factura.vendedor_id
    });

    return this.findById(result.lastInsertRowid);
  }

  /**
   * Busca factura por ID
   * @param {number} id - ID de la factura
   * @returns {Object|null}
   */
  findById(id) {
    const stmt = this.db.prepare(`
      SELECT f.*, u.name as vendedor_name, u.email as vendedor_email
      FROM facturas f
      LEFT JOIN users u ON f.vendedor_id = u.id
      WHERE f.id = ?
    `);
    
    const factura = stmt.get(id);
    if (factura) {
      factura.items = JSON.parse(factura.items);
    }
    return factura || null;
  }

  /**
   * Lista facturas con filtros y paginación
   * @param {Object} filters - Filtros de búsqueda
   * @param {Object} pagination - Opciones de paginación
   * @returns {Object} { data, total, page, limit }
   */
  findAll(filters = {}, pagination = { page: 1, limit: 20 }) {
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filters.cliente) {
      whereClause += ' AND f.cliente LIKE ?';
      params.push(`%${filters.cliente}%`);
    }

    if (filters.estado) {
      whereClause += ' AND f.estado = ?';
      params.push(filters.estado);
    }

    if (filters.vendedor_id) {
      whereClause += ' AND f.vendedor_id = ?';
      params.push(filters.vendedor_id);
    }

    if (filters.fecha_desde && filters.fecha_hasta) {
      whereClause += ' AND f.fecha BETWEEN ? AND ?';
      params.push(filters.fecha_desde, filters.fecha_hasta);
    }

    // Contar total
    const countStmt = this.db.prepare(`
      SELECT COUNT(*) as total FROM facturas f ${whereClause}
    `);
    const { total } = countStmt.get(...params);

    // Obtener datos
    const dataStmt = this.db.prepare(`
      SELECT f.*, u.name as vendedor_name
      FROM facturas f
      LEFT JOIN users u ON f.vendedor_id = u.id
      ${whereClause}
      ORDER BY f.fecha DESC
      LIMIT ? OFFSET ?
    `);

    const data = dataStmt.all(...params, limit, offset);
    
    // Parsear items JSON
    data.forEach(f => {
      f.items = JSON.parse(f.items);
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Actualiza una factura
   * @param {number} id - ID de la factura
   * @param {Object} updates - Campos a actualizar
   * @returns {Object} Factura actualizada
   */
  async update(id, updates) {
    const allowedFields = ['cliente', 'cuit', 'total', 'items', 'estado', 'sync_status'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(key === 'items' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE facturas 
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.findById(id);
  }

  /**
   * Elimina una factura (soft delete cambiando estado)
   * @param {number} id - ID de la factura
   */
  async delete(id) {
    const stmt = this.db.prepare(`
      UPDATE facturas 
      SET estado = 'anulada', sync_status = 'pending'
      WHERE id = ?
    `);
    
    stmt.run(id);
    return { id, deleted: true };
  }

  /**
   * Obtiene estadísticas de facturación
   * @param {Object} filters - Filtros de fecha
   * @returns {Object} Estadísticas
   */
  getStats(filters = {}) {
    let whereClause = 'WHERE estado != "anulada"';
    const params = [];

    if (filters.fecha_desde && filters.fecha_hasta) {
      whereClause += ' AND fecha BETWEEN ? AND ?';
      params.push(filters.fecha_desde, filters.fecha_hasta);
    }

    const statsStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_facturas,
        SUM(total) as total_facturado,
        AVG(total) as promedio_factura,
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pendientes,
        COUNT(CASE WHEN estado = 'pagada' THEN 1 END) as pagadas
      FROM facturas
      ${whereClause}
    `);

    return statsStmt.get(...params);
  }

  /**
   * Marca facturas para sincronización
   * @param {number[]} ids - IDs de facturas a marcar
   * @param {string} status - Estado de sync
   */
  async markForSync(ids, status = 'pending') {
    const stmt = this.db.prepare(`
      UPDATE facturas 
      SET sync_status = ?
      WHERE id = ?
    `);

    const updateMany = this.db.transaction((ids) => {
      for (const id of ids) {
        stmt.run(status, id);
      }
    });

    updateMany(ids);
    return { updated: ids.length };
  }
}

module.exports = new FacturaService();
