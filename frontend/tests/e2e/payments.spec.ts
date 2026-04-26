import { test, expect } from '@playwright/test';

test.describe('Payments E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByPlaceholder('tu@email.com').fill('test@test.com');
    await page.getByPlaceholder('********').fill('password123');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
    
    // Navigate to payments
    await page.goto('/payments');
    await expect(page.getByText(/pagos|payment/i)).toBeVisible();
  });

  test('procesar pago con Mercado Pago → estado "Pagado"', async ({ page }) => {
    // Click new payment button
    await page.getByRole('button', { name: /nuevo pago|procesar pago/i }).click();
    
    // Select invoice to pay
    await page.getByLabel(/factura|invoice/i).selectOption({ index: 0 });
    
    // Fill payment amount
    await page.getByPlaceholder(/monto|amount/i).fill('500');
    
    // Select Mercado Pago as payment method
    await page.getByLabel(/método de pago|payment method/i).selectOption('mercado_pago');
    
    // Process payment
    await page.getByRole('button', { name: /procesar|pagar/i }).click();
    
    // Wait for payment processing (mock)
    await page.waitForTimeout(2000);
    
    // Verify success message
    await expect(page.getByText(/pago procesado|éxito|completado/i)).toBeVisible();
    
    // Verify payment appears with "Pagado" status
    await expect(page.getByText(/pagado|completed|exitoso/i).first()).toBeVisible();
    
    // Verify Mercado Pago method is shown
    await expect(page.getByText(/mercado pago/i)).toBeVisible();
  });

  test('procesar pago con Stripe → estado "Pagado"', async ({ page }) => {
    // Click new payment button
    await page.getByRole('button', { name: /nuevo pago/i }).click();
    
    // Select invoice to pay
    await page.getByLabel(/factura/i).selectOption({ index: 1 });
    
    // Fill payment amount
    await page.getByPlaceholder(/monto/i).fill('750');
    
    // Select Stripe as payment method
    await page.getByLabel(/método de pago/i).selectOption('stripe');
    
    // Fill Stripe test card details (in modal)
    await page.getByPlaceholder(/número de tarjeta/i).fill('4242424242424242');
    await page.getByPlaceholder(/mm\/aa|exp/i).fill('12/30');
    await page.getByPlaceholder(/cvc|cvv/i).fill('123');
    
    // Process payment
    await page.getByRole('button', { name: /procesar|pagar/i }).click();
    
    // Wait for processing
    await expect(page.getByText(/procesando|procesar/i)).toBeVisible();
    
    // Verify success
    await expect(page.getByText(/pago procesado|pagado|exitoso/i)).toBeVisible();
    
    // Verify payment status is "Pagado"
    await expect(page.getByText(/pagado|completed/i).first()).toBeVisible();
  });

  test('reembolso → estado actualizado', async ({ page }) => {
    // First create a payment to refund
    await page.getByRole('button', { name: /nuevo pago/i }).click();
    await page.getByLabel(/factura/i).selectOption({ index: 0 });
    await page.getByPlaceholder(/monto/i).fill('300');
    await page.getByLabel(/método de pago/i).selectOption('cash');
    await page.getByRole('button', { name: /procesar/i }).click();
    
    // Wait for payment to appear
    await expect(page.getByText(/pagado|completado/i).first()).toBeVisible();
    
    // Find the payment and click refund
    const paymentRow = page.locator('tr', { hasText: '300' }).first();
    await paymentRow.getByRole('button', { name: /reembolsar|refund|devolver/i }).click();
    
    // Confirm refund
    await page.getByRole('dialog').getByRole('button', { name: /confirmar|sí|reembolsar/i }).click();
    
    // Verify refund success message
    await expect(page.getByText(/reembolsado|reembolso exitoso|refunded/i)).toBeVisible();
    
    // Verify status changed to "Reembolsado"
    await expect(page.getByText(/reembolsado|refunded|devuelto/i)).toBeVisible();
    
    // Verify the amount is shown as negative or with refund indicator
    await expect(page.locator('text=-300, text=Reembolsado').first()).toBeVisible();
  });
});
