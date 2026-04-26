import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { authService } from '../authService';

describe('AuthService', () => {
  beforeEach(() => {
    // Clear localStorage mock
    jest.clearAllMocks();
    
    // Mock fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockResponse = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: {
          id: '1',
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'user',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await authService.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result).toEqual(mockResponse);
      expect(localStorage.setItem).toHaveBeenCalledWith('accessToken', mockResponse.accessToken);
      expect(localStorage.setItem).toHaveBeenCalledWith('refreshToken', mockResponse.refreshToken);
    });

    it('should throw error on failed login', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(
        authService.login({ email: 'test@test.com', password: 'wrong' })
      ).rejects.toThrow('Login failed');
    });
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const mockResponse = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: {
          id: '1',
          email: 'new@test.com',
          firstName: 'New',
          lastName: 'User',
          role: 'user',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await authService.register({
        email: 'new@test.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        companyName: 'Test Co',
        cuit: '20-12345678-9',
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('logout', () => {
    it('should clear tokens from localStorage', () => {
      authService.logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('accessToken');
      expect(localStorage.removeItem).toHaveBeenCalledWith('refreshToken');
      expect(localStorage.removeItem).toHaveBeenCalledWith('user');
    });
  });

  describe('getToken', () => {
    it('should return access token from localStorage', () => {
      (localStorage.getItem as jest.Mock).mockReturnValueOnce('mock-token');

      const token = authService.getToken();

      expect(token).toBe('mock-token');
      expect(localStorage.getItem).toHaveBeenCalledWith('accessToken');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when token exists', () => {
      (localStorage.getItem as jest.Mock).mockReturnValueOnce('mock-token');

      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should return false when no token', () => {
      (localStorage.getItem as jest.Mock).mockReturnValueOnce(null);

      expect(authService.isAuthenticated()).toBe(false);
    });
  });
});
