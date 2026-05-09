import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, AuthUser } from '../services/authService';
import { 
  UserRole as UnifiedRole, 
  RoleLabels, 
  RoleMigrationMap,
  hasPermission,
  isValidRole,
  migrateRole
} from '../../../shared/types/roles';

/**
 * SISTEMA DE ROLES UNIFICADO v2.0
 * 
 * 5 roles principales:
 * - viewer: Solo lectura
 * - driver: Chofer (ventas móvil, OCR, sync offline)
 * - cashier: Cajero (ventas, stock consulta, cierre de caja)
 * - manager: Gerente (reportes, análisis, no modifica config)
 * - admin: Administrador (acceso total)
 * 
 * Los roles antiguos se migran automáticamente mediante RoleMigrationMap.
 */

export type ImplementationPhase = 'fase1' | 'fase2' | 'fase3';

/** 
 * Nuevo tipo de rol unificado (5 roles)
 * @deprecated UserRoleLegacy se mantiene para compatibilidad backward
 */
export type UserRole = UnifiedRole;

/** Legacy roles para backward compatibility */
export type UserRoleLegacy =
  | 'vendedor'
  | 'chofer'
  | 'contador'
  | 'tesorero'
  | 'compras'
  | 'admin'
  | 'superadmin'
  | 'tecnico'
  | 'admin_sistema'
  | 'admin_cuenta';

export type Environment = 'ventas' | 'rendicion' | 'tesoreria' | 'compras' | 'procesos' | 'admin';

export interface EnvironmentVisibility {
  enabled: boolean;
  visible: boolean;
  phase: ImplementationPhase;
}

export interface UserPermissions {
  ventas: EnvironmentVisibility;
  rendicion: EnvironmentVisibility;
  tesoreria: EnvironmentVisibility;
  compras: EnvironmentVisibility;
  procesos: EnvironmentVisibility;
  admin: EnvironmentVisibility;
  logs: boolean;
}

interface User extends AuthUser {
  role: UserRole;
  permissions: UserPermissions;
}

interface LogEntry {
  id: string;
  userId: string;
  userName: string;
  environment: Environment;
  action: string;
  details?: string;
  timestamp: string;
}

/**
 * Contexto de Autenticación Unificado
 * 
 * Nuevas propiedades de rol (5 roles unificados):
 * - isViewer, isDriver, isCashier, isManager, isAdmin
 * 
 * Legacy properties mantenidas para backward compatibility:
 * - isVendedor (migrado a isCashier)
 * - isChofer (migrado a isDriver)
 * - etc.
 */
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  
  // === NUEVO SISTEMA DE ROLES (5 roles) ===
  role: UnifiedRole | null;
  roleLabel: string;
  isViewer: boolean;
  isDriver: boolean;
  isCashier: boolean;
  isManager: boolean;
  isAdmin: boolean;
  
  /**
   * Verifica permiso unificado (action + resource)
   * @example hasPermission('create', 'invoices')
   */
  hasPermission: (env: Environment) => boolean;
  hasUnifiedPermission: (action: import('../../../shared/types/roles').Action, resource: import('../../../shared/types/roles').Resource) => boolean;
  
  /**
   * Requiere rol mínimo en jerarquía
   */
  hasMinimumRole: (requiredRole: UnifiedRole) => boolean;
  
  // === LEGACY (mantenido para compatibilidad) ===
  /** @deprecated Usar isCashier */
  isVendedor: boolean;
  /** @deprecated Usar isDriver */
  isChofer: boolean;
  /** @deprecated Usar isManager */
  isContador: boolean;
  /** @deprecated Usar isCashier */
  isTesorero: boolean;
  /** @deprecated Usar isManager */
  isEncargadoCompras: boolean;
  /** @deprecated Usar isManager */
  isAdminCuenta: boolean;
  /** @deprecated Usar isAdmin */
  isAdminSistema: boolean;
  /** @deprecated Usar isAdmin */
  isSystemAdmin: boolean;
  
  canAccessEnvironment: (env: Environment) => boolean;
  getEnvironmentVisibility: (env: Environment) => EnvironmentVisibility;
  logs: LogEntry[];
  addLog: (environment: Environment, action: string, details?: string) => void;
  
  /**
   * Migrar rol legacy a nuevo sistema
   */
  migrateUserRole: (legacyRole: UserRoleLegacy) => UnifiedRole;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Mapeo de roles legacy a permisos de entorno (backward compatibility) */
const LEGACY_ROLE_PERMISSIONS: Record<UserRoleLegacy, UserPermissions> = {
  vendedor: {
    ventas: { enabled: true, visible: true, phase: 'fase1' },
    rendicion: { enabled: false, visible: true, phase: 'fase1' },
    tesoreria: { enabled: false, visible: true, phase: 'fase2' },
    compras: { enabled: false, visible: true, phase: 'fase2' },
    procesos: { enabled: false, visible: true, phase: 'fase3' },
    admin: { enabled: false, visible: false, phase: 'fase3' },
    logs: false,
  },
  chofer: {
    ventas: { enabled: true, visible: true, phase: 'fase1' },
    rendicion: { enabled: false, visible: true, phase: 'fase1' },
    tesoreria: { enabled: false, visible: true, phase: 'fase2' },
    compras: { enabled: false, visible: true, phase: 'fase2' },
    procesos: { enabled: false, visible: true, phase: 'fase3' },
    admin: { enabled: false, visible: false, phase: 'fase3' },
    logs: false,
  },
  contador: {
    ventas: { enabled: false, visible: true, phase: 'fase1' },
    rendicion: { enabled: true, visible: true, phase: 'fase1' },
    tesoreria: { enabled: true, visible: true, phase: 'fase2' },
    compras: { enabled: false, visible: true, phase: 'fase2' },
    procesos: { enabled: false, visible: true, phase: 'fase3' },
    admin: { enabled: false, visible: false, phase: 'fase3' },
    logs: false,
  },
  tesorero: {
    ventas: { enabled: false, visible: true, phase: 'fase1' },
    rendicion: { enabled: true, visible: true, phase: 'fase1' },
    tesoreria: { enabled: true, visible: true, phase: 'fase2' },
    compras: { enabled: false, visible: true, phase: 'fase2' },
    procesos: { enabled: false, visible: true, phase: 'fase3' },
    admin: { enabled: false, visible: false, phase: 'fase3' },
    logs: false,
  },
  compras: {
    ventas: { enabled: false, visible: true, phase: 'fase1' },
    rendicion: { enabled: false, visible: true, phase: 'fase1' },
    tesoreria: { enabled: false, visible: true, phase: 'fase2' },
    compras: { enabled: true, visible: true, phase: 'fase2' },
    procesos: { enabled: false, visible: true, phase: 'fase3' },
    admin: { enabled: false, visible: false, phase: 'fase3' },
    logs: false,
  },
  admin: {
    ventas: { enabled: true, visible: true, phase: 'fase1' },
    rendicion: { enabled: true, visible: true, phase: 'fase1' },
    tesoreria: { enabled: true, visible: true, phase: 'fase2' },
    compras: { enabled: true, visible: true, phase: 'fase2' },
    procesos: { enabled: true, visible: true, phase: 'fase3' },
    admin: { enabled: true, visible: true, phase: 'fase3' },
    logs: false,
  },
  superadmin: {
    ventas: { enabled: true, visible: true, phase: 'fase1' },
    rendicion: { enabled: true, visible: true, phase: 'fase1' },
    tesoreria: { enabled: true, visible: true, phase: 'fase2' },
    compras: { enabled: true, visible: true, phase: 'fase2' },
    procesos: { enabled: true, visible: true, phase: 'fase3' },
    admin: { enabled: true, visible: true, phase: 'fase3' },
    logs: true,
  },
  tecnico: {
    ventas: { enabled: false, visible: true, phase: 'fase1' },
    rendicion: { enabled: false, visible: true, phase: 'fase1' },
    tesoreria: { enabled: false, visible: true, phase: 'fase2' },
    compras: { enabled: false, visible: true, phase: 'fase2' },
    procesos: { enabled: true, visible: true, phase: 'fase3' },
    admin: { enabled: false, visible: false, phase: 'fase3' },
    logs: false,
  },
  admin_sistema: {
    ventas: { enabled: true, visible: true, phase: 'fase1' },
    rendicion: { enabled: true, visible: true, phase: 'fase1' },
    tesoreria: { enabled: true, visible: true, phase: 'fase2' },
    compras: { enabled: true, visible: true, phase: 'fase2' },
    procesos: { enabled: true, visible: true, phase: 'fase3' },
    admin: { enabled: true, visible: true, phase: 'fase3' },
    logs: true,
  },
  admin_cuenta: {
    ventas: { enabled: true, visible: true, phase: 'fase1' },
    rendicion: { enabled: true, visible: true, phase: 'fase1' },
    tesoreria: { enabled: true, visible: true, phase: 'fase2' },
    compras: { enabled: true, visible: true, phase: 'fase2' },
    procesos: { enabled: true, visible: true, phase: 'fase3' },
    admin: { enabled: true, visible: true, phase: 'fase3' },
    logs: false,
  },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const saved = localStorage.getItem('system_logs');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    const hydrateUser = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const me = await authService.getMe();
        // Migrar rol legacy a nuevo sistema unificado
        const rawRole = me.role || 'vendedor';
        const unifiedRole = migrateRole(rawRole);
        
        // Log de migración para debugging
        if (rawRole !== unifiedRole) {
          console.log(`[Auth] Rol migrado: ${rawRole} → ${unifiedRole}`);
        }
        
        setUser({
          ...me,
          role: unifiedRole,
          permissions: LEGACY_ROLE_PERMISSIONS[rawRole as UserRoleLegacy] || LEGACY_ROLE_PERMISSIONS.vendedor,
        });
      } catch {
        authService.logout();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    hydrateUser();
  }, []);

  useEffect(() => {
    localStorage.setItem('system_logs', JSON.stringify(logs));
  }, [logs]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authService.login(email, password);
    // Migrar rol legacy a nuevo sistema unificado
    const rawRole = data.user.role || 'vendedor';
    const unifiedRole = migrateRole(rawRole);
    
    setUser({
      ...data.user,
      role: unifiedRole,
      permissions: LEGACY_ROLE_PERMISSIONS[rawRole as UserRoleLegacy] || LEGACY_ROLE_PERMISSIONS.vendedor,
    });
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (env: Environment): boolean => {
      if (!user) return false;
      return user.permissions[env]?.enabled || false;
    },
    [user]
  );

  const canAccessEnvironment = useCallback(
    (env: Environment): boolean => {
      if (!user) return false;
      return user.permissions[env]?.enabled || user.role === 'admin_sistema' || user.role === 'superadmin';
    },
    [user]
  );

  const getEnvironmentVisibility = useCallback(
    (env: Environment): EnvironmentVisibility => {
      if (!user) return { enabled: false, visible: false, phase: 'fase1' };
      return user.permissions[env] || { enabled: false, visible: false, phase: 'fase1' };
    },
    [user]
  );

  const addLog = useCallback(
    (environment: Environment, action: string, details?: string) => {
      if (!user) return;
      const newLog: LogEntry = {
        id: Date.now().toString(),
        userId: String(user.id),
        userName: user.name,
        environment,
        action,
        details,
        timestamp: new Date().toISOString(),
      };
      setLogs((prev) => [newLog, ...prev].slice(0, 1000));
    },
    [user]
  );

  // === NUEVO SISTEMA DE ROLES: Callbacks ===
  const unifiedRole = (user?.role as UnifiedRole) || null;
  
  const hasUnifiedPermission = useCallback(
    (action: import('../../../shared/types/roles').Action, resource: import('../../../shared/types/roles').Resource): boolean => {
      if (!unifiedRole) return false;
      return hasPermission(unifiedRole, action, resource);
    },
    [unifiedRole]
  );
  
  const hasMinimumRole = useCallback(
    (requiredRole: UnifiedRole): boolean => {
      if (!unifiedRole) return false;
      const { RoleHierarchy } = require('../../../shared/types/roles');
      return RoleHierarchy[unifiedRole] >= RoleHierarchy[requiredRole];
    },
    [unifiedRole]
  );
  
  const migrateUserRole = useCallback(
    (legacyRole: UserRoleLegacy): UnifiedRole => {
      return migrateRole(legacyRole);
    },
    []
  );

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    
    // === NUEVO SISTEMA DE ROLES (5 roles) ===
    role: unifiedRole,
    roleLabel: unifiedRole ? RoleLabels[unifiedRole] : '',
    isViewer: unifiedRole === 'viewer',
    isDriver: unifiedRole === 'driver',
    isCashier: unifiedRole === 'cashier',
    isManager: unifiedRole === 'manager',
    isAdmin: unifiedRole === 'admin',
    hasUnifiedPermission,
    hasMinimumRole,
    
    // === LEGACY (backward compatibility) ===
    // Legacy checks usando el rol migrado para compatibilidad
    isVendedor: unifiedRole === 'cashier',
    isChofer: unifiedRole === 'driver',
    isContador: unifiedRole === 'manager',
    isTesorero: unifiedRole === 'cashier',
    isEncargadoCompras: unifiedRole === 'manager',
    isAdminCuenta: unifiedRole === 'manager' || unifiedRole === 'admin',
    isAdminSistema: unifiedRole === 'admin',
    isSystemAdmin: unifiedRole === 'admin',
    hasPermission,
    canAccessEnvironment,
    getEnvironmentVisibility,
    logs,
    addLog,
    migrateUserRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;