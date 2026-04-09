const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { signIn } = require('../helpers/auth');
const { createMinimalEpub } = require('../helpers/epub');

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

async function apiRequest(page, apiPath, { method = 'GET', body } = {}) {
  return page.evaluate(async ({ targetPath, targetMethod, requestBody }) => {
    function extractAccessTokenFromValue(value) {
      if (!value) return '';
      if (typeof value === 'string') {
        try {
          return extractAccessTokenFromValue(JSON.parse(value));
        } catch {
          return '';
        }
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const token = extractAccessTokenFromValue(item);
          if (token) return token;
        }
        return '';
      }
      if (typeof value !== 'object') return '';
      if (typeof value.access_token === 'string' && value.access_token) return value.access_token;
      if (value.currentSession) return extractAccessTokenFromValue(value.currentSession);
      if (value.session) return extractAccessTokenFromValue(value.session);
      if (value.data) return extractAccessTokenFromValue(value.data);
      return '';
    }

    function readAccessToken(storage) {
      if (!storage) return '';
      try {
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (!/^sb-.*-auth-token$/i.test(String(key || ''))) continue;
          const raw = storage.getItem(key);
          const token = extractAccessTokenFromValue(raw);
          if (token) return token;
        }
      } catch {
        return '';
      }
      return '';
    }

    const headers = {};
    const token = readAccessToken(window.localStorage) || readAccessToken(window.sessionStorage);
    if (token) headers.Authorization = `Bearer ${token}`;
    if (requestBody !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`/books/api/v1${targetPath}`, {
      method: targetMethod,
      headers,
      body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  }, { targetPath: apiPath, targetMethod: method, requestBody: body });
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

async function selectPublishingDestination(page, selector, optionText) {
  const select = page.locator(selector);
  await expect(select).toBeAttached();
  await expect.poll(async () => {
    return await select.locator('option').evaluateAll((options) => options.filter((option) => option.value).length);
  }, {
    timeout: 20_000,
    message: `Expected publishing destinations to load for ${selector}`,
  }).toBeGreaterThan(0);

  const normalizedTarget = String(optionText || '').trim().toLowerCase();
  const optionLocator = select.locator('option');
  const optionCount = await optionLocator.count();
  let matchedValue = '';

  for (let i = 0; i < optionCount; i += 1) {
    const option = optionLocator.nth(i);
    const value = String((await option.getAttribute('value')) || '').trim();
    if (!value) continue;
    const label = ((await option.textContent()) || '').trim().toLowerCase();
    if (!matchedValue && normalizedTarget && label.includes(normalizedTarget)) {
      matchedValue = value;
      break;
    }
  }

  const selectedValue = normalizedTarget ? matchedValue : '';
  if (!selectedValue) throw new Error(`No publishing destination was available for ${selector}`);
  await select.selectOption(selectedValue);
}

async function publishBook(page, epubPath, details) {
  await page.goto('/books/publish/');
  await expect(page.locator('#publishIntro')).toContainText('personal manual path', { timeout: 20_000 });
  await expect(page.locator('#uploadBtn')).toBeVisible();
  await expect(page.locator('#bookList')).not.toContainText('Loading...', { timeout: 20_000 });
  await page.click('#uploadBtn');
  await expect(page.locator('#view-upload')).toHaveClass(/active/, { timeout: 20_000 });
  await expect(page.locator('#fileInput')).toBeAttached();
  await selectPublishingDestination(page, '#uploadTenantSelect', details.destinationText);
  await page.setInputFiles('#fileInput', epubPath);

  await expect(page.locator('#bookStatus .status-badge')).toHaveText(/ready|published/, { timeout: 90_000 });

  await page.fill('#meta-title', details.title);
  await page.fill('#meta-author', details.author);
  await page.fill('#meta-year', String(details.year));
  await page.fill('#meta-annotation', details.annotation);
  await page.fill('#meta-language', 'en');
  await selectFirstGenre(page);
  await page.selectOption('#meta-visibility', details.visibility);
  await selectPublishingDestination(page, '#editTenantSelect', details.destinationText);

  await page.click('#saveMetaBtn');
  await expect(page.locator('#editAlert')).toContainText('Saved.', { timeout: 15_000 });
  await expect(page.locator('#publishBtn')).toBeEnabled({ timeout: 15_000 });

  await page.click('#publishBtn');
  await expect(page.locator('#bookStatus .status-badge')).toHaveText('published', { timeout: 90_000 });
}

test.describe('Private catalog browse and search', () => {
  test('shows org-only books in organization shelves and search only for authorized members', async ({ browser }) => {
    test.setTimeout(600_000);

    const superuserEmail = process.env.SUPERUSER_EMAIL;
    const superuserPassword = process.env.SUPERUSER_PASSWORD;
    test.skip(!superuserEmail || !superuserPassword, 'SUPERUSER_EMAIL and SUPERUSER_PASSWORD must be set');

    const suffix = uniqueSuffix();
    const tenantSlug = `pw-private-${suffix}`.slice(0, 40);
    const tenantName = `PW Private ${suffix}`;
    const authorName = `Zephyr, Preview ${suffix}`;
    const privateTitle = `Private Catalog ${suffix}`;
    const epubPath = path.join(os.tmpdir(), `private-catalog-${suffix}.epub`);
    await createMinimalEpub(epubPath, {
      title: privateTitle,
      author: authorName,
      chapterText: `Private catalog validation ${suffix}`,
    });

    const superuserContext = await browser.newContext();
    const anonymousContext = await browser.newContext();

    const superuserPage = await superuserContext.newPage();
    const anonymousPage = await anonymousContext.newPage();

    try {
      await signIn(superuserPage, superuserEmail, superuserPassword);

      const createTenantResponse = await apiRequest(superuserPage, '/tenants', {
        method: 'POST',
        body: { name: tenantName, slug: tenantSlug, tenant_type: 'publisher' },
      });
      expect(createTenantResponse.ok).toBeTruthy();

      await publishBook(superuserPage, epubPath, {
        title: privateTitle,
        author: authorName,
        annotation: `Private catalog annotation ${suffix}`,
        destinationText: tenantSlug,
        visibility: 'tenant_only',
        year: 2026,
      });

      await superuserPage.goto('/books/');
      await expect(superuserPage.locator('text=Your Organization Books')).toBeVisible({ timeout: 20_000 });
      await expect(superuserPage.locator('#content')).toContainText(privateTitle, { timeout: 20_000 });

      await superuserPage.fill('#searchInput', privateTitle);
      await superuserPage.press('#searchInput', 'Enter');
      await expect(superuserPage.locator('.srItem .srTitle')).toContainText(privateTitle, { timeout: 20_000 });

      await anonymousPage.goto('/books/');
      await anonymousPage.fill('#searchInput', privateTitle);
      await anonymousPage.press('#searchInput', 'Enter');
      await expect(anonymousPage.locator('.srItem .srTitle', { hasText: privateTitle })).toHaveCount(0, { timeout: 20_000 });

    } finally {
      await Promise.allSettled([
        fs.rm(epubPath, { force: true }),
        superuserContext.close(),
        anonymousContext.close(),
      ]);
    }
  });
});
