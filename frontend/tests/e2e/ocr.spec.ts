import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('OCR E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByPlaceholder('tu@email.com').fill('test@test.com');
    await page.getByPlaceholder('********').fill('password123');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
    
    // Navigate to OCR page
    await page.goto('/ocr');
    await expect(page.getByText(/ocr|documentos|escaneo/i)).toBeVisible();
  });

  test('subir documento PDF → aparece en grid', async ({ page }) => {
    // Click upload button
    await page.getByRole('button', { name: /subir|upload|cargar/i }).click();
    
    // Upload a test PDF file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-invoice.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content for testing'), // Mock PDF content
    });
    
    // Wait for upload to complete
    await page.waitForTimeout(2000);
    
    // Verify document appears in grid
    await expect(page.getByText(/test-invoice|documento/i)).toBeVisible();
    
    // Verify status is "Procesando" or "Pendiente"
    await expect(page.getByText(/procesando|pendiente|uploaded/i)).toBeVisible();
    
    // Wait for processing
    await page.waitForTimeout(5000);
    
    // Verify status updated
    await expect(page.getByText(/completado|procesado|completed/i).first()).toBeVisible();
  });

  test('buscar documento → filtro correcto', async ({ page }) => {
    // Upload a document first
    await page.getByRole('button', { name: /subir/i }).click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'invoice-search-test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content'),
    });
    
    await page.waitForTimeout(3000);
    
    // Search for the document
    await page.getByPlaceholder(/buscar|search/i).fill('invoice-search');
    
    // Wait for filter to apply
    await page.waitForTimeout(1000);
    
    // Verify the document appears in filtered results
    await expect(page.getByText('invoice-search-test')).toBeVisible();
    
    // Search for something that doesn't exist
    await page.getByPlaceholder(/buscar/i).fill('nonexistent-document-xyz');
    await page.waitForTimeout(1000);
    
    // Verify no results message
    await expect(page.getByText(/no se encontraron|sin resultados|empty/i)).toBeVisible();
    
    // Clear search and verify all documents appear
    await page.getByPlaceholder(/buscar/i).clear();
    await page.waitForTimeout(1000);
    
    // Verify documents are visible again
    await expect(page.getByText(/invoice-search-test|documento/i)).toBeVisible();
  });

  test('abrir modal detalle → datos extraídos visibles', async ({ page }) => {
    // Upload and process a document first
    await page.getByRole('button', { name: /subir/i }).click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'detailed-invoice.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF with details'),
    });
    
    // Wait for upload and processing
    await page.waitForTimeout(6000);
    
    // Click on the document card to open detail modal
    await page.locator('[class*="document-card"], [class*="ocr-card"]').first().click();
    
    // Wait for modal to open
    await page.waitForTimeout(500);
    
    // Verify modal is visible
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/detalle|detail/i)).toBeVisible();
    
    // Verify extracted data sections are visible
    await expect(page.getByText(/datos extraídos|extracted data/i)).toBeVisible();
    
    // Verify extracted fields
    await expect(page.getByText(/número|number/i)).toBeVisible();
    await expect(page.getByText(/fecha|date/i)).toBeVisible();
    await expect(page.getByText(/total|amount/i)).toBeVisible();
    await expect(page.getByText(/cliente|customer/i)).toBeVisible();
    
    // Verify raw text section
    await expect(page.getByText(/texto completo|raw text/i)).toBeVisible();
    
    // Close modal
    await page.getByRole('button', { name: /cerrar|close|×/i }).click();
    
    // Verify modal is closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
