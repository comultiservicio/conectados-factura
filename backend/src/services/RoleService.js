/**
 * Servicio de Roles y Permisos Mejorado
 * Sistema jerárquico con herencia de roles
 * 
 * @module services/RoleService
 */

const redis = require('redis');

class RoleService {
  constructor() {
    // Definición de permisos por módulo
    this.PERMISSIONS = {
      facturas: {
        create: 'facturas.create',
        read: 'facturas.read',
        update: 'facturas.update',
        delete: 'facturas.delete',
        export: 'facturas.export',
        all: 'facturas.*'
      },
      clientes: {
        create: 'clientes.create',
        read: 'clientes.read',
        update: 'clientes.update',
        delete: 'clientes.delete',
        all: 'clientes.*'
      },
      productos: {
        create: 'productos.create',
        read: 'productos.read',
        update: 'productos.update',
        delete: 'productos.delete',
        all: 'productos.*'
      },
      reportes: {
        read: 'reportes.read',
        export: 'reportes.export',
        all: 'reportes.*'
      },
      usuarios: {
        create: 'usuarios.create',
        read: 'usuarios.read',
        update: 'usuarios.update',
        delete: 'usuarios.delete',
        all: 'usuarios.*'
      },
      configuracion: {
        read: 'configuracion.read',
        update: 'configuracion.update',
        all: 'configuracion.*'
      }
    };

    // Definición de roles con permisos
    // admin > vendedor > chofer
    this.ROLES = {
      admin: {
        name: 'Administrador',
        level: 100,
        inherits: [], // Admin no hereda, tiene todo
        permissions: ['*'] // Wildcard = todos los permisos
      },
      contador: {
        name: 'Contador',
        level: 80,
        inherits: [],
        permissions: [
          'facturas.read', 'facturas.export',
          'clientes.read',
          'productos.read',
          'reportes.*',
          'configuracion.read'
        ]
      },
      vendedor: {
        name: 'Vendedor',
        level: 50,
        inherits: ['chofer'], // Hereda de chofer
        permissions: [
          'facturas.create', 'facturas.read', 'facturas.update',
          'clientes.create', 'clientes.read', 'clientes.update',
          'productos.read',
          'reportes.read'
        ]
      },
      chofer: {
        name: 'Chofer',
        level: 30,
        inherits: [], // Rol base
        permissions: [
          'facturas.create', 'facturas.read',
          'clientes.read',
          'productos.read'
        ]
      }
    };

    // Cache en Redis (opcional)
    this.redisClient = null;
    this.cacheTTL = 3600; // 1 hora
    
    this.init();
  }

  async init() {
    // Intentar conectar a Redis si está configurado
    if (process.env.REDIS_URL) {
      try {
        this.redisClient = redis.createClient({
          url: process.env.REDIS_URL
        });
        await this.redisClient.connect();
        console.log('✅ RoleService: Redis conectado para cache de permisos');
      } catch (error) {
        console.log('⚠️ RoleService: Redis no disponible, usando cache en memoria');
        this.redisClient = null;
      }
    }
  }

  /**
   * Obtiene todos los permisos efectivos de un rol (incluyendo herencia)
   */
  getEffectivePermissions(roleName) {
    const role = this.ROLES[roleName];
    if (!role) return [];

    // Si tiene wildcard, retornar todos los permisos
    if (role.permissions.includes('*')) {
      return this.getAllPermissions();
    }

    let permissions = new Set(role.permissions);

    // Heredar permisos de roles padre
    for (const parentRole of role.inherits) {
      const parentPermissions = this.getEffectivePermissions(parentRole);
      parentPermissions.forEach(p => permissions.add(p));
    }

    return Array.from(permissions);
  }

  /**
   * Obtiene todos los permisos posibles del sistema
   */
  getAllPermissions() {
    const all = [];
    for (const module of Object.values(this.PERMISSIONS)) {
      for (const perm of Object.values(module)) {
        if (!perm.endsWith('.*')) {
          all.push(perm);
        }
      }
    }
    return all;
  }

  /**
   * Verifica si un rol tiene un permiso específico
   */
  hasPermission(roleName, permission) {
    const permissions = this.getEffectivePermissions(roleName);
    
    // Check wildcard
    const module = permission.split('.')[0];
    if (permissions.includes(`${module}.*`) || permissions.includes('*')) {
      return true;
    }
    
    return permissions.includes(permission);
  }

  /**
   * Verifica si un rol tiene todos los permisos de un array
   */
  hasAllPermissions(roleName, permissions) {
    return permissions.every(p => this.hasPermission(roleName, p));
  }

  /**
   * Verifica si un rol tiene al menos uno de los permisos
   */
  hasAnyPermission(roleName, permissions) {
    return permissions.some(p => this.hasPermission(roleName, p));
  }

  /**
   * Compara jerarquía de roles
   * Retorna true si roleA es igual o superior a roleB
   */
  isRoleEqualOrHigher(roleA, roleB) {
    const levelA = this.ROLES[roleA]?.level || 0;
    const levelB = this.ROLES[roleB]?.level || 0;
    return levelA >= levelB;
  }

  /**
   * Obtiene permisos desde cache (Redis o memoria)
   */
  async getPermissionsFromCache(roleName) {
    const cacheKey = `role:permissions:${roleName}`;
    
    if (this.redisClient) {
      try {
        const cached = await this.redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.error('Error leyendo cache Redis:', error);
      }
    }
    
    // Si no hay cache, calcular y guardar
    const permissions = this.getEffectivePermissions(roleName);
    await this.setPermissionsCache(roleName, permissions);
    return permissions;
  }

  /**
   * Guarda permisos en cache
   */
  async setPermissionsCache(roleName, permissions) {
    const cacheKey = `role:permissions:${roleName}`;
    
    if (this.redisClient) {
      try {
        await this.redisClient.setEx(
          cacheKey,
          this.cacheTTL,
          JSON.stringify(permissions)
        );
      } catch (error) {
        console.error('Error guardando cache Redis:', error);
      }
    }
  }

  /**
   * Invalida cache de un rol
   */
  async invalidateCache(roleName) {
    const cacheKey = `role:permissions:${roleName}`;
    
    if (this.redisClient) {
      try {
        await this.redisClient.del(cacheKey);
      } catch (error) {
        console.error('Error invalidando cache:', error);
      }
    }
  }

  /**
   * Obtiene lista de roles disponibles
   */
  getRoles() {
    return Object.entries(this.ROLES).map(([key, value]) => ({
      id: key,
      name: value.name,
      level: value.level,
      permissions: this.getEffectivePermissions(key)
    }));
  }

  /**
   * Obtiene detalle de un rol específico
   */
  getRole(roleName) {
    const role = this.ROLES[roleName];
    if (!role) return null;

    return {
      id: roleName,
      name: role.name,
      level: role.level,
      inherits: role.inherits,
      permissions: role.permissions,
      effectivePermissions: this.getEffectivePermissions(roleName)
    };
  }

  /**
   * Middleware factory para verificar permisos en rutas
   */
  requirePermission(...requiredPermissions) {
    return async (req, res, next) => {
      try {
        const userRole = req.user?.role;
        
        if (!userRole) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Usuario no autenticado'
          });
        }

        // Obtener permisos desde cache
        const userPermissions = await this.getPermissionsFromCache(userRole);
        
        // Verificar si tiene alguno de los permisos requeridos
        const hasPermission = requiredPermissions.some(p => 
          userPermissions.includes(p) ||
          userPermissions.includes('*') ||
          userPermissions.includes(p.split('.')[0] + '.*')
        );

        if (!hasPermission) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'No tiene permisos para realizar esta acción',
            required: requiredPermissions,
            current: userPermissions
          });
        }

        // Agregar permisos al request para uso posterior
        req.userPermissions = userPermissions;
        
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Middleware para verificar propiedad de recurso o permisos elevados
   */
  requireOwnerOrPermission(permission, getResourceOwnerFn) {
    return async (req, res, next) => {
      try {
        const userRole = req.user?.role;
        const userId = req.user?.id;

        if (!userRole || !userId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Admin o permiso específico puede todo
        const permissions = await this.getPermissionsFromCache(userRole);
        const hasElevatedPermission = permissions.includes('*') || 
                                      permissions.includes(permission);

        if (hasElevatedPermission) {
          return next();
        }

        // Verificar propiedad
        const ownerId = await getResourceOwnerFn(req);
        
        if (ownerId !== userId) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'No tiene permisos para modificar este recurso'
          });
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }
}

// Singleton
const roleService = new RoleService();

module.exports = roleService;
