const { test, expect } = require('@playwright/test');
const { signIn } = require('../helpers/auth');

test.describe('Auth and Tenants smoke', () => {
  test('superuser can sign in and open tenants page', async ({ browser }) => {
    const email = process.env.SUPERUSER_EMAIL;
    const password = process.env.SUPERUSER_PASSWORD;

    test.skip(!email || !password, 'SUPERUSER_EMAIL and SUPERUSER_PASSWORD must be set');

    const context = await browser.newContext();
    const page = await context.newPage();

    await signIn(page, email, password);
    await expect(page).not.toHaveURL(/\/books\/auth\//);
    await expect(page).toHaveURL(/\/books\//);

    await page.goto('/books/account/#tenants');
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveURL(/\/books\/account\//);
    await expect(page.locator('text=Organizations').first()).toBeVisible({ timeout: 15_000 });

    await context.close();
  });
});
