/**
 * API REST - Rutas principales
 * Reemplaza API Gateway + Lambda de AWS
 * @module routes/api
 */

const express = require('express');
const router = express.Router();
const facturaService = require('../services/FacturaService');
const { AuthService, authenticateToken, requireRole, requireOwnerOrAdmin } = require('../middleware/auth');

// ============================================================================
// AUTENTICACIÓN
// ============================================================================

/**
 * POST /api/auth/login
 * Iniciar sesión
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: 'Datos incompletos',
        message: 'Email y contraseña son requeridos'
      });
    }

    const result = await AuthService.login(email, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({
      error: 'Error de autenticación',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/register
 * Registrar usuario (solo admin)
 */
router.post('/auth/register', 
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const result = await AuthService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({
        error: 'Error al registrar',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/auth/me
 * Obtener usuario actual
 */
router.get('/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

/**
 * POST /api/auth/change-password
 * Cambiar contraseña
 */
router.post('/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await AuthService.changePassword(req.user.id, currentPassword, newPassword);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: 'Error al cambiar contraseña',
      message: error.message
    });
  }
});

// ============================================================================
// FACTURAS
// ============================================================================

/**
 * GET /api/facturas
 * Listar facturas (con filtros)
 * Roles: admin, contador (todas), vendedor/chofer (solo propias)
 */
router.get('/facturas', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, cliente, estado, fecha_desde, fecha_hasta } = req.query;
    
    const filters = {
      cliente,
      estado,
      fecha_desde,
      fecha_hasta
    };

    // Si es vendedor o chofer, solo ve sus propias facturas
    if (req.user.role === 'vendedor' || req.user.role === 'chofer') {
      filters.vendedor_id = req.user.id;
    }

    const result = await facturaService.findAll(filters, { page: parseInt(page), limit: parseInt(limit) });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Error al obtener facturas',
      message: error.message
    });
  }
});

/**
 * GET /api/facturas/:id
 * Obtener factura por ID
 */
router.get('/facturas/:id', authenticateToken, async (req, res) => {
  try {
    const factura = await facturaService.findById(req.params.id);
    
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // Verificar permisos (solo propietario o admin/contador)
    if (req.user.role === 'vendedor' || req.user.role === 'chofer') {
      if (factura.vendedor_id !== req.user.id) {
        return res.status(403).json({ error: 'No tiene permisos para ver esta factura' });
      }
    }

    res.json(factura);
  } catch (error) {
    res.status(500).json({
      error: 'Error al obtener factura',
      message: error.message
    });
  }
});

/**
 * POST /api/facturas
 * Crear factura
 * Roles: admin, vendedor, chofer
 */
router.post('/facturas',
  authenticateToken,
  requireRole('admin', 'vendedor', 'chofer'),
  async (req, res) => {
    try {
      const facturaData = {
        ...req.body,
        vendedor_id: req.user.id, // Siempre asignar al usuario actual
        sync_status: 'pending' // Para sincronización offline
      };

      const factura = await facturaService.create(facturaData);
      res.status(201).json(factura);
    } catch (error) {
      res.status(400).json({
        error: 'Error al crear factura',
        message: error.message
      });
    }
  }
);

/**
 * PUT /api/facturas/:id
 * Actualizar factura
 * Solo propietario o admin puede actualizar
 */
router.put('/facturas/:id',
  authenticateToken,
  requireOwnerOrAdmin(async (req) => {
    const factura = await facturaService.findById(req.params.id);
    return factura ? factura.vendedor_id : null;
  }),
  async (req, res) => {
    try {
      const factura = await facturaService.update(req.params.id, req.body);
      res.json(factura);
    } catch (error) {
      res.status(400).json({
        error: 'Error al actualizar factura',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/facturas/:id
 * Anular factura (soft delete)
 */
router.delete('/facturas/:id',
  authenticateToken,
  requireOwnerOrAdmin(async (req) => {
    const factura = await facturaService.findById(req.params.id);
    return factura ? factura.vendedor_id : null;
  }),
  async (req, res) => {
    try {
      const result = await facturaService.delete(req.params.id);
      res.json(result);
    } catch (error) {
      res.status(400).json({
        error: 'Error al anular factura',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/facturas/stats/resumen
 * Estadísticas de facturación
 * Roles: admin, contador (todas), vendedor (propias)
 */
router.get('/facturas/stats/resumen', authenticateToken, async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;
    
    const filters = {
      fecha_desde,
      fecha_hasta
    };

    // Si es vendedor, filtrar por sus facturas
    if (req.user.role === 'vendedor') {
      // Necesitamos modificar el servicio para soportar esto
      // Por ahora devolvemos stats generales para admin/contador
    }

    const stats = await facturaService.getStats(filters);
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Error al obtener estadísticas',
      message: error.message
    });
  }
});

// ============================================================================
// ADMIN - GESTIÓN DE USUARIOS
// ============================================================================

/**
 * GET /api/admin/users
 * Listar usuarios
 */
router.get('/admin/users',
  authenticateToken,
  requireRole('admin'),
  (req, res) => {
    try {
      const users = AuthService.listUsers(req.query);
      res.json({ users });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * PUT /api/admin/users/:id/deactivate
 * Desactivar usuario
 */
router.put('/admin/users/:id/deactivate',
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const result = await AuthService.deactivateUser(req.params.id);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// ============================================================================
// SYNC - SINCRONIZACIÓN OFFLINE
// ============================================================================

/**
 * POST /api/sync/pending
 * Enviar cambios pendientes desde cliente
 */
router.post('/sync/pending', authenticateToken, async (req, res) => {
  try {
    const { changes } = req.body;
    
    // Procesar cambios pendientes
    const results = [];
    
    for (const change of changes) {
      try {
        switch (change.operation) {
          case 'CREATE_FACTURA':
            const factura = await facturaService.create({
              ...change.data,
              vendedor_id: req.user.id
            });
            results.push({ id: change.localId, serverId: factura.id, status: 'synced' });
            break;
            
          case 'UPDATE_FACTURA':
            await facturaService.update(change.data.id, change.data);
            results.push({ id: change.data.id, status: 'synced' });
            break;
            
          default:
            results.push({ id: change.localId, status: 'error', error: 'Operación no soportada' });
        }
      } catch (error) {
        results.push({ id: change.localId, status: 'error', error: error.message });
      }
    }
    
    res.json({ synced: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sync/changes
 * Obtener cambios del servidor desde una fecha
 */
router.get('/sync/changes', authenticateToken, async (req, res) => {
  try {
    const { since } = req.query;
    
    // Obtener facturas modificadas desde 'since'
    const stmt = req.app.locals.db.prepare(`
      SELECT * FROM facturas 
      WHERE updated_at > ?
      AND (vendedor_id = ? OR ? IN ('admin', 'contador'))
      ORDER BY updated_at ASC
    `);
    
    const changes = stmt.all(since || '1970-01-01', req.user.id, req.user.role);
    
    res.json({ changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
