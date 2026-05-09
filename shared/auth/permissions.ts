/**
 * Middleware de Autorización - Conectados Factura+
 * 
 * @description Sistema centralizado de autorización basado en roles y permisos.
 * Proporciona funciones para validar acceso a recursos y acciones.
 * 
 * @example
 * // Verificar permiso simple
 * if (hasPermission(user.role, 'create', 'invoices')) { ... }
 * 
 * // Usar middleware en Lambda
 * export const handler = withAuth(async (event, context) => {
 *   requirePermission(event.userRole, 'read', 'reports');
 *   // ... handler logic
 * });
 * 
 * @author Sistema Conectados
 * @version 2.0.0
 */

import {
  UserRole,
  Action,
  Resource,
  hasPermission as hasPermissionBase,
  hasMinimumRole as hasMinimumRoleBase,
  getAllowedActions,
  RoleHierarchy,
  migrateRole
} from '../types/roles';

// Re-exportar funciones base para conveniencia
export { hasPermissionBase as hasPermission, hasMinimumRoleBase as hasMinimumRole };

/**
 * Error de autorización personalizado
 */
export class AuthorizationError extends Error {
  public readonly statusCode: number;
  public readonly requiredPermission: { action: Action; resource: Resource };
  public readonly userRole: UserRole;

  constructor(
    message: string,
    userRole: UserRole,
    action: Action,
    resource: Resource
  ) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
    this.userRole = userRole;
    this.requiredPermission = { action, resource };
  }

  toJSON() {
    return {
      error: 'Forbidden',
      message: this.message,
      requiredPermission: this.requiredPermission,
      currentRole: this.userRole
    };
  }
}

/**
 * Interface para el contexto de autorización
 */
export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

/**
 * Interface para el payload del token JWT
 */
export interface TokenPayload {
  sub: string;
  email: string;
  role: string; // String porque viene del token antiguo
  companyId: string;
  permissions?: string[];
  iat: number;
  exp: number;
}

/**
 * Verifica si un rol tiene permiso sobre una acción y recurso.
 * Lanza AuthorizationError si no tiene permiso.
 * 
 * @param role - Rol del usuario
 * @param action - Acción requerida
 * @param resource - Recurso objetivo
 * @throws AuthorizationError si no tiene permiso
 * 
 * @example
 * try {
 *   requirePermission('cashier', 'create', 'invoices');
 *   // Continuar con la operación
 * } catch (error) {
 *   if (error instanceof AuthorizationError) {
 *     return { statusCode: 403, body: JSON.stringify(error.toJSON()) };
 *   }
 * }
 */
export function requirePermission(
  role: UserRole,
  action: Action,
  resource: Resource
): void {
  if (!hasPermissionBase(role, action, resource)) {
    throw new AuthorizationError(
      `El rol '${role}' no tiene permiso para '${action}' en '${resource}'`,
      role,
      action,
      resource
    );
  }
}

/**
 * Requiere que el usuario tenga al menos el rol mínimo especificado.
 * 
 * @param userRole - Rol actual del usuario
 * @param requiredRole - Rol mínimo requerido
 * @throws AuthorizationError si no cumple el requisito
 */
export function requireMinimumRole(
  userRole: UserRole,
  requiredRole: UserRole
): void {
  if (!hasMinimumRoleBase(userRole, requiredRole)) {
    throw new AuthorizationError(
      `Se requiere rol '${requiredRole}' o superior. Rol actual: '${userRole}'`,
      userRole,
      'read', // Action dummy para el error
      'users'  // Resource dummy para el error
    );
  }
}

/**
 * Requiere que el usuario tenga uno de los roles permitidos.
 * 
 * @param userRole - Rol actual del usuario
 * @param allowedRoles - Array de roles permitidos
 * @throws AuthorizationError si el rol no está en la lista
 */
export function requireRole(
  userRole: UserRole,
  allowedRoles: UserRole[]
): void {
  if (!allowedRoles.includes(userRole)) {
    throw new AuthorizationError(
      `Se requiere uno de los siguientes roles: ${allowedRoles.join(', ')}`,
      userRole,
      'read',
      'users'
    );
  }
}

/**
 * Verifica múltiples permisos (AND - todos deben cumplirse).
 * 
 * @param role - Rol del usuario
 * @param permissions - Array de permisos requeridos
 * @returns true si tiene TODOS los permisos
 */
export function hasAllPermissions(
  role: UserRole,
  permissions: Array<{ action: Action; resource: Resource }>
): boolean {
  return permissions.every((p) => hasPermissionBase(role, p.action, p.resource));
}

/**
 * Verifica múltiples permisos (OR - al menos uno debe cumplirse).
 * 
 * @param role - Rol del usuario
 * @param permissions - Array de permisos (cualquiera sirve)
 * @returns true si tiene AL MENOS UN permiso
 */
export function hasAnyPermission(
  role: UserRole,
  permissions: Array<{ action: Action; resource: Resource }>
): boolean {
  return permissions.some((p) => hasPermissionBase(role, p.action, p.resource));
}

/**
 * Requiere todos los permisos especificados (AND).
 * 
 * @throws AuthorizationError si falta algún permiso
 */
export function requireAllPermissions(
  role: UserRole,
  permissions: Array<{ action: Action; resource: Resource }>
): void {
  const missing = permissions.filter(
    (p) => !hasPermissionBase(role, p.action, p.resource)
  );
  
  if (missing.length > 0) {
    throw new AuthorizationError(
      `Faltan permisos requeridos: ${missing.map(p => `${p.action} ${p.resource}`).join(', ')}`,
      role,
      missing[0].action,
      missing[0].resource
    );
  }
}

/**
 * Wrapper para handlers de Lambda que añade autorización.
 * 
 * @param handler - Handler original de Lambda
 * @param requiredPermission - Permiso requerido para ejecutar el handler
 * @returns Handler envuelto con autorización
 * 
 * @example
 * export const createInvoice = withAuthorization(
 *   { action: 'create', resource: 'invoices' },
 *   async (event, context) => {
 *     // Lógica del handler - solo ejecuta si tiene permiso
 *     return { statusCode: 200, body: JSON.stringify({ success: true }) };
 *   }
 * );
 */
export function withAuthorization(
  requiredPermission: { action: Action; resource: Resource },
  handler: (event: any, context: any) => Promise<any>
): (event: any, context: any) => Promise<any> {
  return async (event, context) => {
    try {
      // Extraer rol del token JWT en el evento
      const userRole = extractRoleFromEvent(event);
      
      // Verificar permiso
      requirePermission(userRole, requiredPermission.action, requiredPermission.resource);
      
      // Si pasa la autorización, ejecutar el handler
      return await handler(event, context);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(error.toJSON())
        };
      }
      
      // Error de autenticación (token inválido, etc.)
      if (error instanceof AuthenticationError) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Unauthorized', message: error.message })
        };
      }
      
      throw error;
    }
  };
}

/**
 * Wrapper para handlers que requieren múltiples roles permitidos.
 * 
 * @param allowedRoles - Roles que pueden ejecutar el handler
 * @param handler - Handler original
 * @returns Handler envuelto con verificación de rol
 */
export function withRoles(
  allowedRoles: UserRole[],
  handler: (event: any, context: any) => Promise<any>
): (event: any, context: any) => Promise<any> {
  return async (event, context) => {
    try {
      const userRole = extractRoleFromEvent(event);
      requireRole(userRole, allowedRoles);
      return await handler(event, context);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(error.toJSON())
        };
      }
      throw error;
    }
  };
}

/**
 * Error de autenticación (token inválido, expirado, etc.)
 */
export class AuthenticationError extends Error {
  public readonly statusCode: number = 401;
  
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Extrae y valida el rol desde el evento de Lambda.
 * Maneja migración de roles antiguos automáticamente.
 * 
 * @param event - Evento de API Gateway
 * @returns UserRole validado y migrado
 * @throws AuthenticationError si no se puede extraer el rol
 */
export function extractRoleFromEvent(event: any): UserRole {
  // Intentar extraer de requestContext (API Gateway con autorizer)
  const requestContext = event.requestContext;
  if (requestContext?.authorizer?.claims?.['custom:role']) {
    const rawRole = requestContext.authorizer.claims['custom:role'];
    return migrateRole(rawRole);
  }
  
  // Intentar extraer de headers (desarrollo local)
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (authHeader) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const payload = decodeToken(token);
      return migrateRole(payload.role);
    } catch (e) {
      throw new AuthenticationError('Token inválido o expirado');
    }
  }
  
  // Intentar extraer de body (para testing)
  if (event.body) {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    if (body?.userRole) {
      return migrateRole(body.userRole);
    }
  }
  
  throw new AuthenticationError('No se encontró rol de usuario en el request');
}

/**
 * Decodifica un token JWT sin verificar firma (para extraer payload).
 * Solo usar en casos donde la firma ya fue verificada por API Gateway.
 * 
 * @param token - JWT token
 * @returns Payload decodificado
 */
function decodeToken(token: string): TokenPayload {
  try {
    const base64Payload = token.split('.')[1];
    const payload = Buffer.from(base64Payload, 'base64').toString('ascii');
    return JSON.parse(payload);
  } catch (e) {
    throw new AuthenticationError('Formato de token inválido');
  }
}

/**
 * Construye un contexto de autorización completo desde el evento.
 * Útil para pasar información de auth a los handlers.
 * 
 * @param event - Evento de API Gateway
 * @returns AuthContext completo
 */
export function buildAuthContext(event: any): AuthContext {
  const role = extractRoleFromEvent(event);
  const allowedActions = getAllowedActions(role, 'invoices'); // Ejemplo
  
  return {
    userId: event.requestContext?.authorizer?.claims?.sub || 'unknown',
    email: event.requestContext?.authorizer?.claims?.email || 'unknown',
    role,
    companyId: event.requestContext?.authorizer?.claims?.['custom:companyId'] || 'unknown',
    permissions: allowedActions as string[]
  };
}

/**
 * Middleware factory para verificar propiedad del recurso.
 * Útil para casos donde un usuario solo puede editar sus propios recursos.
 * 
 * @param resourceOwnerField - Campo que contiene el owner ID
 * @param userIdField - Campo del contexto que contiene el user ID
 * @returns Middleware de verificación de propiedad
 */
export function requireOwnership(
  resourceOwnerField: string = 'userId',
  userIdField: string = 'sub'
): (event: any, resource: any) => boolean {
  return (event, resource) => {
    const userId = event.requestContext?.authorizer?.claims?.[userIdField];
    const ownerId = resource[resourceOwnerField];
    
    return userId === ownerId;
  };
}

/**
 * PERMISSIONS constant export para uso directo en validaciones.
 * Matriz de permisos por rol.
 */
export const PERMISSIONS = {
  viewer: {
    canRead: true,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    resources: ['invoices', 'products', 'customers', 'reports', 'stock']
  },
  driver: {
    canRead: true,
    canCreate: true, // invoices, customers
    canUpdate: true,  // customers
    canDelete: false,
    resources: ['invoices', 'products', 'customers', 'ocr', 'sync_queue']
  },
  cashier: {
    canRead: true,
    canCreate: true, // invoices, customers, cash_register
    canUpdate: true, // invoices (own), customers
    canDelete: false,
    resources: ['invoices', 'products', 'customers', 'cash_register', 'stock']
  },
  manager: {
    canRead: true,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canApprove: true, // invoice cancellations
    resources: ['invoices', 'products', 'customers', 'reports', 'cash_register', 'users', 'logs']
  },
  admin: {
    canRead: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    resources: ['*'] // All resources
  }
} as const;

/** Type helper para recursos permitidos */
export type PermissionCheck = {
  role: UserRole;
  action: Action;
  resource: Resource;
  granted: boolean;
  timestamp: string;
};

/**
 * Log de auditoría de permisos (para compliance).
 * 
 * @param check - Resultado del check de permisos
 * @param metadata - Metadata adicional (IP, user agent, etc.)
 */
export function logPermissionCheck(
  check: PermissionCheck,
  metadata?: Record<string, any>
): void {
  const logEntry = {
    ...check,
    metadata,
    timestamp: new Date().toISOString()
  };
  
  // En producción, enviar a CloudWatch Logs o similar
  console.log('[AUDIT] Permission check:', JSON.stringify(logEntry));
}
