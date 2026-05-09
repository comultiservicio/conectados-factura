import api from './api';
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
});

export const registerSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  token: string;
  expiresIn: string;
  user: AuthUser;
}

class AuthService {
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/api/auth/login', { email, password });
    localStorage.setItem('auth_token', response.data.token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
    return response.data;
  }

  async register(email: string, password: string, name: string): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/api/auth/register', { email, password, name });
    localStorage.setItem('auth_token', response.data.token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
    return response.data;
  }

  async getMe(): Promise<AuthUser> {
    const response = await api.get<{ user: AuthUser }>('/api/auth/me');
    localStorage.setItem('user', JSON.stringify(response.data.user));
    return response.data.user;
  }

  logout(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  getCurrentUser(): AuthUser | null {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token');
  }

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'admin_sistema';
  }
}

export const authService = new AuthService();
export default authService;