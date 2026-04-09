const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { signIn } = require('../helpers/auth');
const { createMinimalEpub } = require('../helpers/epub');

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

async function selectFirstGenre(page) {
  await page.waitForFunction(() => {
    const select = document.getElementById('meta-genre');
    return !!select && Array.from(select.options).some((option) => option.value);
  });
  const value = await page.locator('#meta-genre option').evaluateAll((options) => {
    const match = options.find((option) => option.value);
    return match ? match.value : '';
  });
  if (!value) throw new Error('No publish genre options were available');
  await page.selectOption('#meta-genre', value);
}

test.describe('Superuser publishing flow', () => {
  test('superuser can publish through the personal publishing path', async ({ browser }) => {
    test.setTimeout(240_000);

    const email = process.env.SUPERUSER_EMAIL;
    const password = process.env.SUPERUSER_PASSWORD;
    test.skip(!email || !password, 'SUPERUSER_EMAIL and SUPERUSER_PASSWORD must be set');

    const suffix = uniqueSuffix();
    const title = `PW Superuser Publish ${suffix}`;
    const epubPath = path.join(os.tmpdir(), `pw-superuser-${suffix}.epub`);

    await createMinimalEpub(epubPath, {
      title,
      author: 'Playwright Superuser',
      chapterText: `Superuser publishing verification ${suffix}`,
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await signIn(page, email, password);
      await page.goto('/books/publish/');

      await expect(page.locator('#publishIntro')).toContainText('personal manual path', { timeout: 20_000 });
      await expect(page.locator('#uploadTenantSelect')).toContainText('Personal publishing', { timeout: 20_000 });

      await page.click('#uploadBtn');
      await page.setInputFiles('#fileInput', epubPath);

      const statusBadge = page.locator('#bookStatus .status-badge');
      await expect(statusBadge).toHaveText(/ready|published/, { timeout: 90_000 });
      await expect(page.locator('#publishBtn')).toBeDisabled();

      await page.fill('#meta-title', title);
      await page.fill('#meta-author', 'Playwright Superuser');
      await page.fill('#meta-year', '2026');
      await page.fill('#meta-annotation', `Public superuser publication ${suffix}`);
      await page.fill('#meta-language', 'en');
      await selectFirstGenre(page);
      await page.selectOption('#meta-visibility', 'public');

      await page.click('#saveMetaBtn');
      await expect(page.locator('#editAlert')).toContainText('Saved.', { timeout: 15_000 });
      await expect(page.locator('#publishBtn')).toBeEnabled({ timeout: 15_000 });

      await page.click('#publishBtn');
      await expect(page.locator('#bookStatus .status-badge')).toHaveText('published', { timeout: 90_000 });
      await expect(page.locator('#editAlert')).toContainText('Book published!', { timeout: 90_000 });
    } finally {
      await Promise.allSettled([
        fs.rm(epubPath, { force: true }),
        context.close(),
      ]);
    }
  });
});
