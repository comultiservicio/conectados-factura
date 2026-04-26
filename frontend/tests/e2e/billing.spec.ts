import { test, expect } from '@playwright/test';

test.describe('Billing E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByPlaceholder('tu@email.com').fill('test@test.com');
    await page.getByPlaceholder('********').fill('password123');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
    
    // Navigate to billing
    await page.goto('/billing');
    await expect(page.getByText(/facturación/i)).toBeVisible();
  });

  test('crear factura con ítems válidos → aparece en listado', async ({ page }) => {
    // Click new invoice button
    await page.getByRole('button', { name: /nueva factura/i }).click();
    
    // Fill customer data
    await page.getByPlaceholder(/nombre del cliente/i).fill('Cliente Test E2E');
    await page.getByPlaceholder(/cuit/i).fill('20-12345678-9');
    
    // Select invoice type
    await page.getByLabel(/tipo de factura/i).selectOption('B');
    
    // Add item
    await page.getByPlaceholder(/producto|ítem/i).fill('Producto Test');
    await page.getByPlaceholder(/cantidad/i).fill('2');
    await page.getByPlaceholder(/precio/i).fill('100');
    await page.getByRole('button', { name: /agregar|añadir/i }).click();
    
    // Verify item appears in list
    await expect(page.getByText('Producto Test')).toBeVisible();
    await expect(page.getByText('$200')).toBeVisible();
    
    // Create invoice
    await page.getByRole('button', { name: /crear factura|emitir/i }).click();
    
    // Wait for success message
    await expect(page.getByText(/factura creada|éxito/i)).toBeVisible();
    
    // Verify invoice appears in list
    await expect(page.getByText('Cliente Test E2E')).toBeVisible();
    await expect(page.getByText('$200')).toBeVisible();
  });

  test('cancelar factura → estado actualizado', async ({ page }) => {
    // Create a test invoice first
    await page.getByRole('button', { name: /nueva factura/i }).click();
    await page.getByPlaceholder(/nombre del cliente/i).fill('Cliente Cancelar');
    await page.getByPlaceholder(/cuit/i).fill('20-12345678-9');
    await page.getByPlaceholder(/producto/i).fill('Producto Cancelar');
    await page.getByPlaceholder(/cantidad/i).fill('1');
    await page.getByPlaceholder(/precio/i).fill('50');
    await page.getByRole('button', { name: /agregar/i }).click();
    await page.getByRole('button', { name: /crear factura/i }).click();
    
    // Wait for invoice to appear in list
    await expect(page.getByText('Cliente Cancelar')).toBeVisible();
    
    // Find and click cancel button for the invoice
    const invoiceRow = page.locator('tr', { hasText: 'Cliente Cancelar' });
    await invoiceRow.getByRole('button', { name: /cancelar|anular/i }).click();
    
    // Confirm cancellation
    await page.getByRole('button', { name: /confirmar|sí/i }).click();
    
    // Verify status changed to cancelled
    await expect(page.getByText(/cancelada|anulada/i)).toBeVisible();
  });

  test('descargar PDF AFIP → archivo generado', async ({ page }) => {
    // Create a test invoice first
    await page.getByRole('button', { name: /nueva factura/i }).click();
    await page.getByPlaceholder(/nombre del cliente/i).fill('Cliente PDF');
    await page.getByPlaceholder(/cuit/i).fill('20-12345678-9');
    await page.getByPlaceholder(/producto/i).fill('Producto PDF');
    await page.getByPlaceholder(/cantidad/i).fill('1');
    await page.getByPlaceholder(/precio/i).fill('150');
    await page.getByRole('button', { name: /agregar/i }).click();
    await page.getByRole('button', { name: /crear factura/i }).click();
    
    // Wait for invoice to appear
    await expect(page.getByText('Cliente PDF')).toBeVisible();
    
    // Setup download listener
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /pdf|descargar/i }).first().click()
    ]);
    
    // Verify download started
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    
    // Save file (optional, for verification)
    const path = await download.path();
    expect(path).toBeTruthy();
  });
});
