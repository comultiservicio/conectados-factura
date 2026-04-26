import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import App from '../../App';

// Mock the services
jest.mock('../services', () => ({
  authService: {
    login: jest.fn(),
    logout: jest.fn(),
    getToken: jest.fn(),
    isAuthenticated: jest.fn(),
    getUser: jest.fn().mockReturnValue({ firstName: 'Test', role: 'admin' }),
  },
  billingService: {
    getInvoices: jest.fn().mockResolvedValue({ invoices: [], total: 0 }),
  },
  stockService: {
    getCurrentStock: jest.fn().mockResolvedValue([]),
    getLowStockAlerts: jest.fn().mockResolvedValue([]),
  },
  paymentsService: {
    getPayments: jest.fn().mockResolvedValue([]),
  },
  syncService: {
    getPendingItems: jest.fn().mockResolvedValue([]),
  },
}));

describe('Auth Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to login when not authenticated', () => {
    const { authService } = require('../services');
    authService.isAuthenticated.mockReturnValue(false);
    
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    );
    
    // Should redirect to login
    expect(screen.getByPlaceholderText('tu@email.com')).toBeInTheDocument();
  });

  it('allows navigation through protected routes when authenticated', async () => {
    const { authService } = require('../services');
    authService.isAuthenticated.mockReturnValue(true);
    authService.getToken.mockReturnValue('mock-token');
    
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    );
    
    // Should show dashboard
    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });
  });

  it('completes full login flow', async () => {
    const { authService } = require('../services');
    authService.login.mockResolvedValueOnce({
      accessToken: 'mock-token',
      refreshToken: 'mock-refresh',
      user: { id: '1', email: 'test@test.com', firstName: 'Test', role: 'user' },
    });
    authService.isAuthenticated.mockReturnValue(true);
    
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );
    
    // Fill login form
    fireEvent.change(screen.getByPlaceholderText('tu@email.com'), {
      target: { value: 'test@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('********'), {
      target: { value: 'password123' },
    });
    
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    
    await waitFor(() => {
      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'password123',
      });
    });
  });
});
