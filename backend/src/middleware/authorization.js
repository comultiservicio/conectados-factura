/**
 * Middleware de Autorización - Backend Conectados Factura+
 * 
 * @description Middleware Express para verificar permisos basados en roles.
 * Integra con el sistema unificado de 5 roles.
 * 
 * @author Sistema Conectados
 * @version 2.0.0
 */

const { 
  hasPermission, 
  requirePermission,
  requireRole,
  migrateRole,
  isValidRole,
  RoleLabels 
} = require('../../shared/types/roles');

/**
 * Error de autorización
 */
class AuthorizationError extends Error {
  constructor(message, requiredPermission = null) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
    this.requiredPermission = requiredPermission;
  }
}

/**
 * Extrae el rol del usuario desde el request
 * Busca en: req.user (después de auth), headers, o body (para testing)
 * 
 * @param {Object} req - Request de Express
 * @returns {string} Rol del usuario (migrado si es antiguo)
 */
function extractUserRole(req) {
  // Prioridad 1: Usuario ya autenticado (set by auth middleware)
  if (req.user && req.user.role) {
    return migrateRole(req.user.role);
  }

  // Prioridad 2: Header X-User-Role (para desarrollo/testing)
  const headerRole = req.headers['x-user-role'];
  if (headerRole) {
    return migrateRole(headerRole);
  }

  // Prioridad 3: Query param (para testing)
  const queryRole = req.query.role;
  if (queryRole) {
    return migrateRole(queryRole);
  }

  // Default: viewer (más restrictivo por seguridad)
  return 'viewer';
}

/**
 * Middleware: Requiere permiso específico
 * 
 * @param {string} action - Acción requerida (create, read, update, delete, etc.)
 * @param {string} resource - Recurso objetivo (invoices, products, etc.)
 * @returns {Function} Middleware de Express
 * 
 * @example
 * router.post('/invoices', 
 *   requireAuth,
 *   requirePermission('create', 'invoices'),
 *   createInvoiceHandler
 * );
 */
function requirePermission(action, resource) {
  return (req, res, next) => {
    try {
      const userRole = extractUserRole(req);
      
      if (!hasPermission(userRole, action, resource)) {
        throw new AuthorizationError(
          `El rol '${RoleLabels[userRole]}' no tiene permiso para '${action}' en '${resource}'`,
          { action, resource }
        );
      }

      // Agregar info de permisos al request para uso posterior
      req.permissions = {
        role: userRole,
        action,
        resource,
        granted: true,
        timestamp: new Date().toISOString()
      };

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
          requiredPermission: error.requiredPermission,
          currentRole: extractUserRole(req)
        });
      }
      next(error);
    }
  };
}

/**
 * Middleware: Requiere uno de los roles especificados
 * 
 * @param {...string} allowedRoles - Roles permitidos
 * @returns {Function} Middleware de Express
 * 
 * @example
 * router.get('/admin/reports',
 *   requireAuth,
 *   requireRoles('admin', 'manager'),
 *   getAdminReports
 * );
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    try {
      const userRole = extractUserRole(req);

      if (!allowedRoles.includes(userRole)) {
        throw new AuthorizationError(
          `Se requiere uno de los siguientes roles: ${allowedRoles.map(r => RoleLabels[r] || r).join(', ')}`
        );
      }

      req.authorizedRoles = allowedRoles;
      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
          requiredRoles: allowedRoles,
          currentRole: extractUserRole(req)
        });
      }
      next(error);
    }
  };
}

/**
 * Middleware: Requiere rol mínimo en la jerarquía
 * 
 * @param {string} minimumRole - Rol mínimo requerido
 * @returns {Function} Middleware de Express
 */
function requireMinimumRole(minimumRole) {
  return (req, res, next) => {
    try {
      const userRole = extractUserRole(req);
      const { RoleHierarchy } = require('../../shared/types/roles');

      if (RoleHierarchy[userRole] < RoleHierarchy[minimumRole]) {
        throw new AuthorizationError(
          `Se requiere rol '${RoleLabels[minimumRole]}' o superior`
        );
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
          requiredRole: minimumRole,
          currentRole: extractUserRole(req)
        });
      }
      next(error);
    }
  };
}

/**
 * Middleware: Solo Admin
 * Shortcut para requireRoles('admin')
 */
function requireAdmin(req, res, next) {
  return requireRoles('admin')(req, res, next);
}

/**
 * Middleware: Admin o Manager
 * Shortcut para requireRoles('admin', 'manager')
 */
function requireManagerOrAbove(req, res, next) {
  return requireRoles('admin', 'manager')(req, res, next);
}

/**
 * Middleware: Solo propietario del recurso o Admin
 * Útil para operaciones donde solo el creador o un admin puede actuar
 * 
 * @param {Function} getOwnerId - Función que extrae el owner ID del recurso
 * @returns {Function} Middleware de Express
 * 
 * @example
 * router.delete('/invoices/:id',
 *   requireAuth,
 *   requireOwnership(
 *     (req) => req.invoice.user_id,
 *     'admin', 'cashier'  // Admin y cashier pueden borrar
 *   ),
 *   deleteInvoiceHandler
 * );
 */
function requireOwnership(getOwnerId, ...allowedRoles) {
  return async (req, res, next) => {
    try {
      const userRole = extractUserRole(req);
      const userId = req.user?.id;

      // Si tiene un rol permitido, bypass ownership check
      if (allowedRoles.includes(userRole)) {
        return next();
      }

      // Si no, verificar ownership
      const ownerId = await getOwnerId(req);
      
      if (ownerId !== userId) {
        throw new AuthorizationError(
          'No tienes permiso para acceder a este recurso'
        );
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message
        });
      }
      next(error);
    }
  };
}

/**
 * Factory: Middleware de permisos compuestos (AND)
 * Requiere TODOS los permisos especificados
 * 
 * @param {Array<{action: string, resource: string}>} permissions
 * @returns {Function} Middleware de Express
 */
function requireAllPermissions(permissions) {
  return (req, res, next) => {
    try {
      const userRole = extractUserRole(req);

      const missing = permissions.filter(
        p => !hasPermission(userRole, p.action, p.resource)
      );

      if (missing.length > 0) {
        throw new AuthorizationError(
          `Faltan permisos: ${missing.map(p => `${p.action} ${p.resource}`).join(', ')}`
        );
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
          missingPermissions: missing
        });
      }
      next(error);
    }
  };
}

/**
 * Factory: Middleware de permisos alternativos (OR)
 * Requiere AL MENOS UNO de los permisos especificados
 * 
 * @param {Array<{action: string, resource: string}>} permissions
 * @returns {Function} Middleware de Express
 */
function requireAnyPermission(permissions) {
  return (req, res, next) => {
    try {
      const userRole = extractUserRole(req);

      const hasAny = permissions.some(
        p => hasPermission(userRole, p.action, p.resource)
      );

      if (!hasAny) {
        throw new AuthorizationError(
          `Se requiere al menos uno de: ${permissions.map(p => `${p.action} ${p.resource}`).join(', ')}`
        );
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message,
          requiredAny: permissions
        });
      }
      next(error);
    }
  };
}

/**
 * Decorador: Log de auditoría de acceso
 * Loguea todos los intentos de acceso (exitosos y fallidos)
 * 
 * @param {string} resourceName - Nombre del recurso para el log
 * @returns {Function} Middleware de Express
 */
function auditAccess(resourceName) {
  return (req, res, next) => {
    const userRole = extractUserRole(req);
    const userId = req.user?.id || 'anonymous';
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;

    // Log al iniciar el request
    console.log(`[AUDIT] Access attempt: ${timestamp} | ${userId} | ${userRole} | ${req.method} ${req.path} | ${ip}`);

    // Capturar respuesta
    const originalJson = res.json;
    res.json = function(data) {
      const status = res.statusCode;
      const success = status < 400;
      
      console.log(`[AUDIT] Access result: ${timestamp} | ${userId} | ${userRole} | ${req.method} ${req.path} | ${status} | ${success ? 'SUCCESS' : 'DENIED'}`);
      
      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Endpoint helper: Generar info de permisos del usuario actual
 * Útil para GET /api/auth/permissions
 */
function getUserPermissionsEndpoint(req, res) {
  const userRole = extractUserRole(req);
  const { getAccessibleResources, getAllowedActions, RolePermissions } = require('../../shared/types/roles');

  const resources = getAccessibleResources(userRole);
  const permissions = {};

  resources.forEach(resource => {
    permissions[resource] = getAllowedActions(userRole, resource);
  });

  res.json({
    role: userRole,
    roleLabel: RoleLabels[userRole],
    permissions,
    resources
  });
}

// Exportar todo
module.exports = {
  // Middlewares principales
  requirePermission,
  requireRoles,
  requireMinimumRole,
  requireAdmin,
  requireManagerOrAbove,
  requireOwnership,
  requireAllPermissions,
  requireAnyPermission,
  
  // Utilidades
  auditAccess,
  extractUserRole,
  getUserPermissionsEndpoint,
  AuthorizationError,
  
  // Helpers para tests
  isValidRole,
  migrateRole
};
