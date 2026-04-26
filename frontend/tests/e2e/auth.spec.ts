import { test, expect } from '@playwright/test';

test.describe('Authentication E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('login válido con usuario y contraseña correctos', async ({ page }) => {
    // Fill valid credentials
    await page.getByPlaceholder('tu@email.com').fill('test@test.com');
    await page.getByPlaceholder('********').fill('password123');
    
    // Click login button
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.getByText(/dashboard|bienvenido/i)).toBeVisible();
    
    // Verify user info is displayed
    await expect(page.getByText(/test|usuario/i)).toBeVisible();
  });

  test('login inválido muestra alerta', async ({ page }) => {
    // Fill invalid credentials
    await page.getByPlaceholder('tu@email.com').fill('test@test.com');
    await page.getByPlaceholder('********').fill('wrongpassword');
    
    // Click login button
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    
    // Should stay on login page
    await expect(page).toHaveURL(/.*login/);
    
    // Should show error alert
    await expect(page.getByText(/error|inválido|incorrecto|credenciales/i)).toBeVisible();
    
    // Form should still be visible
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible();
    await expect(page.getByPlaceholder('********')).toBeVisible();
  });

  test('logout limpia sesión y redirige a /login', async ({ page }) => {
    // First login
    await page.getByPlaceholder('tu@email.com').fill('test@test.com');
    await page.getByPlaceholder('********').fill('password123');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    
    // Wait for dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    
    // Click logout
    await page.getByText(/cerrar sesión|logout|salir/i).click();
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
    
    // Login form should be visible
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible();
    await expect(page.getByPlaceholder('********')).toBeVisible();
    
    // Try to access protected route
    await page.goto('/dashboard');
    
    // Should be redirected to login
    await expect(page).toHaveURL(/.*login/);
  });
});
