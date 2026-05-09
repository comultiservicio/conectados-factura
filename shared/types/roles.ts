/**
 * Sistema de Roles Unificado - Conectados Factura+
 * 
 * @description Define los 5 roles del sistema y sus permisos asociados.
 * Los roles están ordenados por nivel de privilegio (de menor a mayor).
 * 
 * @author Sistema Conectados
 * @version 2.0.0
 */

/** Los 5 roles unificados del sistema */
export type UserRole = 'viewer' | 'driver' | 'cashier' | 'manager' | 'admin';

/** Descripción legible de cada rol */
export const RoleLabels: Record<UserRole, string> = {
  viewer: 'Visualizador',
  driver: 'Chofer/Repartidor',
  cashier: 'Cajero',
  manager: 'Gerente',
  admin: 'Administrador'
};

/** Jerarquía de roles (nivel numérico para comparaciones) */
export const RoleHierarchy: Record<UserRole, number> = {
  viewer: 1,
  driver: 2,
  cashier: 3,
  manager: 4,
  admin: 5
};

/** Acciones disponibles en el sistema */
export type Action = 
  | 'create' 
  | 'read' 
  | 'update' 
  | 'delete'
  | 'approve'
  | 'export'
  | 'print'
  | 'sync'
  | 'close_cash';

/** Recursos/entidades del sistema */
export type Resource =
  | 'users'
  | 'invoices'
  | 'products'
  | 'customers'
  | 'cash_register'
  | 'reports'
  | 'settings'
  | 'stock'
  | 'ocr'
  | 'sync_queue'
  | 'logs';

/** Permiso específico (acción sobre recurso) */
export interface Permission {
  action: Action;
  resource: Resource;
}

/** Definición completa de permisos por rol */
export const RolePermissions: Record<UserRole, Permission[]> = {
  /** Viewer: Solo lectura en todo el sistema */
  viewer: [
    { action: 'read', resource: 'invoices' },
    { action: 'read', resource: 'products' },
    { action: 'read', resource: 'customers' },
    { action: 'read', resource: 'reports' },
    { action: 'read', resource: 'stock' },
    { action: 'export', resource: 'reports' }
  ],

  /** Driver: Ventas móvil, OCR, sync offline */
  driver: [
    { action: 'create', resource: 'invoices' },
    { action: 'read', resource: 'invoices' },
    { action: 'read', resource: 'products' },
    { action: 'read', resource: 'customers' },
    { action: 'create', resource: 'customers' },
    { action: 'update', resource: 'customers' },
    { action: 'create', resource: 'ocr' },
    { action: 'read', resource: 'ocr' },
    { action: 'sync', resource: 'sync_queue' },
    { action: 'print', resource: 'invoices' }
  ],

  /** Cashier: Ventas, stock consulta, cierre de caja */
  cashier: [
    { action: 'create', resource: 'invoices' },
    { action: 'read', resource: 'invoices' },
    { action: 'update', resource: 'invoices' }, // Para anular facturas propias
    { action: 'read', resource: 'products' },
    { action: 'read', resource: 'customers' },
    { action: 'create', resource: 'customers' },
    { action: 'update', resource: 'customers' },
    { action: 'read', resource: 'stock' },
    { action: 'create', resource: 'cash_register' },
    { action: 'close_cash', resource: 'cash_register' },
    { action: 'read', resource: 'cash_register' },
    { action: 'print', resource: 'invoices' }
  ],

  /** Manager: Reportes, análisis, no puede modificar config */
  manager: [
    { action: 'read', resource: 'invoices' },
    { action: 'read', resource: 'products' },
    { action: 'read', resource: 'customers' },
    { action: 'read', resource: 'reports' },
    { action: 'read', resource: 'stock' },
    { action: 'read', resource: 'cash_register' },
    { action: 'read', resource: 'users' },
    { action: 'export', resource: 'reports' },
    { action: 'export', resource: 'invoices' },
    { action: 'approve', resource: 'invoices' }, // Aprobar anulaciones
    { action: 'read', resource: 'logs' }
  ],

  /** Admin: Acceso total, configuración, usuarios */
  admin: [
    // Todos los permisos sobre todos los recursos
    { action: 'create', resource: 'users' },
    { action: 'read', resource: 'users' },
    { action: 'update', resource: 'users' },
    { action: 'delete', resource: 'users' },
    { action: 'create', resource: 'invoices' },
    { action: 'read', resource: 'invoices' },
    { action: 'update', resource: 'invoices' },
    { action: 'delete', resource: 'invoices' },
    { action: 'create', resource: 'products' },
    { action: 'read', resource: 'products' },
    { action: 'update', resource: 'products' },
    { action: 'delete', resource: 'products' },
    { action: 'create', resource: 'customers' },
    { action: 'read', resource: 'customers' },
    { action: 'update', resource: 'customers' },
    { action: 'delete', resource: 'customers' },
    { action: 'create', resource: 'cash_register' },
    { action: 'read', resource: 'cash_register' },
    { action: 'update', resource: 'cash_register' },
    { action: 'delete', resource: 'cash_register' },
    { action: 'close_cash', resource: 'cash_register' },
    { action: 'read', resource: 'reports' },
    { action: 'export', resource: 'reports' },
    { action: 'create', resource: 'settings' },
    { action: 'read', resource: 'settings' },
    { action: 'update', resource: 'settings' },
    { action: 'delete', resource: 'settings' },
    { action: 'create', resource: 'stock' },
    { action: 'read', resource: 'stock' },
    { action: 'update', resource: 'stock' },
    { action: 'delete', resource: 'stock' },
    { action: 'create', resource: 'ocr' },
    { action: 'read', resource: 'ocr' },
    { action: 'update', resource: 'ocr' },
    { action: 'delete', resource: 'ocr' },
    { action: 'create', resource: 'sync_queue' },
    { action: 'read', resource: 'sync_queue' },
    { action: 'update', resource: 'sync_queue' },
    { action: 'delete', resource: 'sync_queue' },
    { action: 'sync', resource: 'sync_queue' },
    { action: 'read', resource: 'logs' },
    { action: 'export', resource: 'logs' },
    { action: 'approve', resource: 'invoices' },
    { action: 'print', resource: 'invoices' }
  ]
};

/**
 * Verifica si un rol tiene un permiso específico
 * @param role - Rol del usuario
 * @param action - Acción a verificar
 * @param resource - Recurso sobre el que actuar
 * @returns boolean indicando si tiene permiso
 */
export function hasPermission(
  role: UserRole,
  action: Action,
  resource: Resource
): boolean {
  const permissions = RolePermissions[role];
  return permissions.some(
    (p) => p.action === action && p.resource === resource
  );
}

/**
 * Verifica si un rol tiene al menos el nivel jerárquico requerido
 * @param userRole - Rol del usuario
 * @param requiredRole - Rol mínimo requerido
 * @returns boolean
 */
export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return RoleHierarchy[userRole] >= RoleHierarchy[requiredRole];
}

/**
 * Obtiene todos los recursos a los que un rol tiene acceso (para UI)
 * @param role - Rol del usuario
 * @returns Array de recursos accesibles
 */
export function getAccessibleResources(role: UserRole): Resource[] {
  const permissions = RolePermissions[role];
  return [...new Set(permissions.map((p) => p.resource))];
}

/**
 * Obtiene todas las acciones permitidas sobre un recurso
 * @param role - Rol del usuario
 * @param resource - Recurso a consultar
 * @returns Array de acciones permitidas
 */
export function getAllowedActions(role: UserRole, resource: Resource): Action[] {
  const permissions = RolePermissions[role];
  return permissions
    .filter((p) => p.resource === resource)
    .map((p) => p.action);
}

/** Mapeo de roles antiguos a nuevos (para migración) */
export const RoleMigrationMap: Record<string, UserRole> = {
  // Roles de AuthContext.tsx
  'vendedor': 'cashier',
  'chofer': 'driver',
  'contador': 'manager',
  'tesorero': 'cashier',
  'compras': 'manager',
  'admin': 'admin',
  'superadmin': 'admin',
  'tecnico': 'viewer',
  'admin_sistema': 'admin',
  'admin_cuenta': 'manager',
  // Roles de shared/types/index.ts
  'user': 'cashier',
  'auditor': 'viewer',
  'customer': 'viewer'
};

/** 
 * Valida si un string es un rol válido
 * @param role - String a validar
 * @returns Type guard para UserRole
 */
export function isValidRole(role: string): role is UserRole {
  return ['viewer', 'driver', 'cashier', 'manager', 'admin'].includes(role);
}

/** 
 * Obtiene el rol migrado o un default seguro
 * @param oldRole - Rol antiguo
 * @returns UserRole valido
 */
export function migrateRole(oldRole: string): UserRole {
  const migrated = RoleMigrationMap[oldRole];
  if (migrated && isValidRole(migrated)) {
    return migrated;
  }
  // Default seguro: viewer (solo lectura)
  return 'viewer';
}
