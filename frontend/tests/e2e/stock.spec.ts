import { test, expect } from '@playwright/test';

test.describe('Stock E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByPlaceholder('tu@email.com').fill('test@test.com');
    await page.getByPlaceholder('********').fill('password123');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
    
    // Navigate to stock
    await page.goto('/stock');
    await expect(page.getByText(/stock|inventario/i)).toBeVisible();
  });

  test('crear producto nuevo → aparece en inventario', async ({ page }) => {
    // Click add product button
    await page.getByRole('button', { name: /nuevo producto|agregar producto/i }).click();
    
    // Fill product data
    const productName = `Producto E2E ${Date.now()}`;
    await page.getByPlaceholder(/nombre/i).fill(productName);
    await page.getByPlaceholder(/sku|código/i).fill(`SKU${Date.now()}`);
    await page.getByPlaceholder(/precio/i).fill('150');
    await page.getByPlaceholder(/stock mínimo/i).fill('10');
    await page.getByPlaceholder(/stock inicial/i).fill('50');
    
    // Save product
    await page.getByRole('button', { name: /guardar|crear/i }).click();
    
    // Verify success message
    await expect(page.getByText(/producto creado|éxito/i)).toBeVisible();
    
    // Verify product appears in inventory
    await expect(page.getByText(productName)).toBeVisible();
    await expect(page.getByText('50')).toBeVisible(); // Initial stock
  });

  test('simular stock crítico (<10 unidades) → alerta visible', async ({ page }) => {
    // Create a product with low stock first
    await page.getByRole('button', { name: /nuevo producto/i }).click();
    const productName = `Producto Bajo Stock ${Date.now()}`;
    await page.getByPlaceholder(/nombre/i).fill(productName);
    await page.getByPlaceholder(/sku/i).fill(`SKU${Date.now()}`);
    await page.getByPlaceholder(/precio/i).fill('100');
    await page.getByPlaceholder(/stock mínimo/i).fill('15');
    await page.getByPlaceholder(/stock inicial/i).fill('8'); // Below minimum
    
    await page.getByRole('button', { name: /guardar/i }).click();
    
    // Wait for product to be created
    await expect(page.getByText(/producto creado/i)).toBeVisible();
    
    // Look for low stock alert section
    await expect(page.getByText(/stock crítico|stock bajo|alerta/i)).toBeVisible();
    
    // Verify the product appears in the alerts
    await expect(page.getByText(productName)).toBeVisible();
    
    // Verify alert styling (red/orange color indicator)
    const alertElement = page.locator('[class*="alert"], [class*="warning"], [class*="critical"]').first();
    await expect(alertElement).toBeVisible();
  });

  test('registrar movimiento → reflejado en tabla', async ({ page }) => {
    // First create a product
    await page.getByRole('button', { name: /nuevo producto/i }).click();
    const productName = `Producto Movimiento ${Date.now()}`;
    await page.getByPlaceholder(/nombre/i).fill(productName);
    await page.getByPlaceholder(/sku/i).fill(`SKU${Date.now()}`);
    await page.getByPlaceholder(/precio/i).fill('100');
    await page.getByPlaceholder(/stock inicial/i).fill('100');
    await page.getByRole('button', { name: /guardar/i }).click();
    
    await expect(page.getByText(/producto creado/i)).toBeVisible();
    
    // Navigate to movements tab
    await page.getByRole('tab', { name: /movimientos/i }).click();
    
    // Add new movement
    await page.getByRole('button', { name: /nuevo movimiento|registrar movimiento/i }).click();
    
    // Select the product
    await page.getByLabel(/producto/i).selectOption({ label: productName });
    
    // Fill movement data
    await page.getByLabel(/tipo/i).selectOption('OUT'); // Stock out
    await page.getByPlaceholder(/cantidad/i).fill('20');
    await page.getByPlaceholder(/motivo|descripción/i).fill('Venta E2E Test');
    
    // Save movement
    await page.getByRole('button', { name: /guardar|registrar/i }).click();
    
    // Verify movement appears in table
    await expect(page.getByText('Venta E2E Test')).toBeVisible();
    await expect(page.getByText('20')).toBeVisible();
    await expect(page.getByText(/salida|out/i)).toBeVisible();
    
    // Verify stock updated
    await page.getByRole('tab', { name: /inventario|productos/i }).click();
    await expect(page.getByText('80')).toBeVisible(); // 100 - 20 = 80
  });
});
