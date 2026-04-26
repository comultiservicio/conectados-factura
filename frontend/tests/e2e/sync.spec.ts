import { test, expect } from '@playwright/test';

test.describe('Sync E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByPlaceholder('tu@email.com').fill('test@test.com');
    await page.getByPlaceholder('********').fill('password123');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
    
    // Navigate to sync page
    await page.goto('/sync');
    await expect(page.getByText(/sincronización|sync/i)).toBeVisible();
  });

  test('simular desconexión → modo offline visible', async ({ page, context }) => {
    // Verify online status initially
    await expect(page.getByText(/en línea|online|conectado/i)).toBeVisible();
    
    // Simulate offline by blocking network
    await context.setOffline(true);
    
    // Wait for offline detection
    await page.waitForTimeout(3000);
    
    // Refresh page to trigger offline mode
    await page.reload();
    
    // Verify offline indicator is visible
    await expect(page.getByText(/sin conexión|offline|desconectado/i)).toBeVisible();
    
    // Verify offline icon or styling
    await expect(page.locator('[class*="offline"], [class*="disconnected"]').first()).toBeVisible();
    
    // Restore connection
    await context.setOffline(false);
  });

  test('registrar operación offline → queda en cola', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(2000);
    await page.reload();
    
    // Navigate to billing while offline
    await page.goto('/billing');
    
    // Create an invoice
    await page.getByRole('button', { name: /nueva factura/i }).click();
    await page.getByPlaceholder(/nombre del cliente/i).fill('Cliente Offline');
    await page.getByPlaceholder(/cuit/i).fill('20-12345678-9');
    await page.getByPlaceholder(/producto/i).fill('Producto Offline');
    await page.getByPlaceholder(/cantidad/i).fill('1');
    await page.getByPlaceholder(/precio/i).fill('100');
    await page.getByRole('button', { name: /agregar/i }).click();
    
    // Try to create invoice
    await page.getByRole('button', { name: /crear factura/i }).click();
    
    // Verify operation queued message
    await expect(page.getByText(/guardado localmente|cola|pendiente|offline/i)).toBeVisible();
    
    // Go to sync page to verify queue
    await page.goto('/sync');
    
    // Verify queue has 1 pending item
    await expect(page.getByText(/1|pendiente|en cola/i)).toBeVisible();
    
    // Verify queue table shows the operation
    await expect(page.getByText(/factura|billing/i)).toBeVisible();
    await expect(page.getByText(/crear|create/i)).toBeVisible();
    
    // Restore connection
    await context.setOffline(false);
  });

  test('reconectar → sincroniza cola', async ({ page, context }) => {
    // First create an offline operation
    await context.setOffline(true);
    await page.waitForTimeout(2000);
    
    // Navigate to billing and create offline operation
    await page.goto('/billing');
    await page.getByRole('button', { name: /nueva factura/i }).click();
    await page.getByPlaceholder(/nombre del cliente/i).fill('Cliente Sync');
    await page.getByPlaceholder(/cuit/i).fill('20-12345678-9');
    await page.getByPlaceholder(/producto/i).fill('Producto Sync');
    await page.getByPlaceholder(/cantidad/i).fill('2');
    await page.getByPlaceholder(/precio/i).fill('200');
    await page.getByRole('button', { name: /agregar/i }).click();
    await page.getByRole('button', { name: /crear factura/i }).click();
    
    // Verify queued
    await page.goto('/sync');
    await expect(page.getByText(/1|pendiente/i)).toBeVisible();
    
    // Reconnect
    await context.setOffline(false);
    await page.waitForTimeout(2000);
    await page.reload();
    
    // Trigger sync
    await page.getByRole('button', { name: /sincronizar|sync|reintentar/i }).click();
    
    // Wait for sync to complete
    await page.waitForTimeout(3000);
    
    // Verify sync success message
    await expect(page.getByText(/sincronizado|completado|éxito/i)).toBeVisible();
    
    // Verify queue is now empty
    await expect(page.getByText(/0|vacía|sin pendientes/i)).toBeVisible();
    
    // Verify last sync timestamp updated
    await expect(page.getByText(/última sincronización|last sync/i)).toBeVisible();
    await expect(page.locator('text=/\\d{2}:\\d{2}|hoy|recién/i').first()).toBeVisible();
    
    // Verify the invoice now appears in billing (synced to server)
    await page.goto('/billing');
    await expect(page.getByText('Cliente Sync')).toBeVisible();
  });
});
