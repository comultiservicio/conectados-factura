import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, AuthUser } from '../services/authService';

export type ImplementationPhase = 'fase1' | 'fase2' | 'fase3';
export type UserRole =
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

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isVendedor: boolean;
  isChofer: boolean;
  isContador: boolean;
  isTesorero: boolean;
  isEncargadoCompras: boolean;
  isAdminCuenta: boolean;
  isAdminSistema: boolean;
  isSystemAdmin: boolean;
  hasPermission: (env: Environment) => boolean;
  canAccessEnvironment: (env: Environment) => boolean;
  getEnvironmentVisibility: (env: Environment) => EnvironmentVisibility;
  logs: LogEntry[];
  addLog: (environment: Environment, action: string, details?: string) => void;
}

const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
        const role = (me.role as UserRole) || 'vendedor';
        setUser({
          ...me,
          role,
          permissions: ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.vendedor,
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
    const role = (data.user.role as UserRole) || 'vendedor';
    setUser({
      ...data.user,
      role,
      permissions: ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.vendedor,
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

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    isVendedor: user?.role === 'vendedor',
    isChofer: user?.role === 'chofer',
    isContador: user?.role === 'contador',
    isTesorero: user?.role === 'tesorero',
    isEncargadoCompras: user?.role === 'compras',
    isAdminCuenta: user?.role === 'admin_cuenta' || user?.role === 'admin',
    isAdminSistema: user?.role === 'admin_sistema' || user?.role === 'superadmin',
    isSystemAdmin: user?.role === 'admin_sistema' || user?.role === 'superadmin',
    hasPermission,
    canAccessEnvironment,
    getEnvironmentVisibility,
    logs,
    addLog,
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