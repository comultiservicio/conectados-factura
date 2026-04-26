import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Dashboard from '../Dashboard';

// Mock the services
jest.mock('../../services', () => ({
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
  authService: {
    getUser: jest.fn().mockReturnValue({ firstName: 'Test', role: 'admin' }),
    logout: jest.fn(),
  },
}));

const renderDashboard = () => {
  return render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
};

describe('Dashboard Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dashboard with user info', async () => {
    renderDashboard();
    
    await waitFor(() => {
      expect(screen.getByText(/test/i)).toBeInTheDocument();
    });
  });

  it('displays stat cards', async () => {
    renderDashboard();
    
    await waitFor(() => {
      expect(screen.getByText(/facturas/i)).toBeInTheDocument();
      expect(screen.getByText(/stock/i)).toBeInTheDocument();
      expect(screen.getByText(/pagos/i)).toBeInTheDocument();
      expect(screen.getByText(/sincronización/i)).toBeInTheDocument();
    });
  });

  it('displays quick action buttons', () => {
    renderDashboard();
    
    expect(screen.getByText(/nueva factura/i)).toBeInTheDocument();
    expect(screen.getByText(/escanear documento/i)).toBeInTheDocument();
  });

  it('displays recent activity section', () => {
    renderDashboard();
    
    expect(screen.getByText(/actividad reciente/i)).toBeInTheDocument();
  });
});
