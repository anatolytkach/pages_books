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
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else {
      data = await response.text().catch(() => null);
    }
    return { ok: response.ok, status: response.status, data };
  }, { targetPath: apiPath, targetMethod: method, requestBody: body });
}

async function signUpPublicAccount(page, { email, password, displayName }) {
  await page.goto('/books/auth/');
  await page.waitForLoadState('networkidle');
  await page.click('[data-tab="signup"]');
  await page.fill('#signup-name', displayName);
  await page.fill('#signup-email', email);
  await page.fill('#signup-password', password);
  await page.click('#signup-btn');
  await expect(page).not.toHaveURL(/\/books\/auth\//, { timeout: 30_000 });
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
  await page.waitForFunction((targetSelector) => {
    const select = document.querySelector(targetSelector);
    return !!select && Array.from(select.options).some((option) => option.value);
  }, selector);
  const value = await page.locator(`${selector} option`).evaluateAll((options, expectedText) => {
    const normalized = String(expectedText || '').toLowerCase();
    const match = options.find((option) => option.value && option.textContent.toLowerCase().includes(normalized));
    const fallback = options.find((option) => option.value);
    return match?.value || fallback?.value || '';
  }, optionText);
  if (!value) throw new Error(`No publishing destination was available for ${selector}`);
  await page.evaluate(({ targetSelector, selectedValue }) => {
    const select = document.querySelector(targetSelector);
    if (!select) throw new Error(`Missing select ${targetSelector}`);
    select.value = selectedValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, { targetSelector: selector, selectedValue: value });
}

async function publishBook(page, epubPath, details) {
  await page.goto('/books/publish/');
  await expect(page.locator('#uploadBtn')).toBeVisible();
  await page.click('#uploadBtn');
  await expect(page.locator('#fileInput')).toBeAttached();
  await selectPublishingDestination(page, '#uploadTenantSelect', details.destinationText);
  await page.setInputFiles('#fileInput', epubPath);

  const statusBadge = page.locator('#bookStatus .status-badge');
  await expect(statusBadge).toHaveText(/ready|published/, { timeout: 90_000 });
  await expect(page.locator('#publishBtn')).toBeDisabled();

  await page.fill('#meta-title', details.title);
  await page.fill('#meta-author', details.author);
  await page.fill('#meta-year', String(details.year));
  await page.fill('#meta-annotation', details.annotation);
  await page.fill('#meta-language', 'en');
  await selectFirstGenre(page);
  await page.selectOption('#meta-visibility', details.visibility);

  await page.click('#saveMetaBtn');
  await expect(page.locator('#editAlert')).toContainText('Saved.', { timeout: 15_000 });
  await expect(page.locator('#publishBtn')).toBeEnabled({ timeout: 15_000 });

  await page.click('#publishBtn');
  await expect(page.locator('#bookStatus .status-badge')).toHaveText('published', { timeout: 90_000 });
  await expect(page.locator('#editAlert')).toContainText('Book published!', { timeout: 90_000 });

  const booksResponse = await apiRequest(page, '/publish/books');
  if (!booksResponse.ok || !Array.isArray(booksResponse.data)) {
    throw new Error(`Could not list published books: ${JSON.stringify(booksResponse.data)}`);
  }
  const publishedBook = booksResponse.data.find((book) => String(book.title || '') === details.title);
  if (!publishedBook) {
    throw new Error(`Published book ${details.title} not found in /publish/books`);
  }
  return publishedBook;
}

async function searchForTitle(page, title) {
  await page.goto('/books/');
  await page.fill('#searchInput', title);
  await page.press('#searchInput', 'Enter');
  await expect(page.locator('#searchResults')).toBeVisible({ timeout: 20_000 });
}

test.describe('Self-publisher invite and organization-only visibility', () => {
  test('self-publisher invite can be accepted and self-publisher visibility rules hold', async ({ browser }) => {
    test.setTimeout(420_000);

    const email = process.env.SUPERUSER_EMAIL;
    const password = process.env.SUPERUSER_PASSWORD;
    test.skip(!email || !password, 'SUPERUSER_EMAIL and SUPERUSER_PASSWORD must be set');

    const suffix = uniqueSuffix();
    const selfPublisherEmail = `yarane+selfpub-${suffix}@gmail.com`;
    const selfPublisherPassword = `Sophi@35-${suffix.slice(-6)}`;
    const selfPublisherName = `PW Self Publisher ${suffix}`;
    const tenantSlug = `pw-selfpub-${suffix}`.slice(0, 40);
    const tenantName = `PW Self Publisher ${suffix}`;
    const outsider = {
      email: `yarane+selfpub-outsider-${suffix}@gmail.com`,
      password: `Sophi@35-${suffix.slice(-6)}o`,
      displayName: `PW SelfPub Outsider ${suffix}`,
    };
    const publicTitle = `SP Public ${suffix}`;
    const tenantOnlyTitle = `SP OrgOnly ${suffix}`;
    const publicEpub = path.join(os.tmpdir(), `${tenantSlug}-public.epub`);
    const tenantOnlyEpub = path.join(os.tmpdir(), `${tenantSlug}-tenant.epub`);

    await createMinimalEpub(publicEpub, {
      title: publicTitle,
      author: selfPublisherName,
      chapterText: `Self-publisher public visibility ${suffix}`,
    });
    await createMinimalEpub(tenantOnlyEpub, {
      title: tenantOnlyTitle,
      author: selfPublisherName,
      chapterText: `Self-publisher tenant-only visibility ${suffix}`,
    });

    const superuserContext = await browser.newContext();
    const superuserPage = await superuserContext.newPage();
    const selfPublisherContext = await browser.newContext();
    const selfPublisherPage = await selfPublisherContext.newPage();
    const outsiderContext = await browser.newContext();
    const outsiderPage = await outsiderContext.newPage();
    const anonymousContext = await browser.newContext();
    const anonymousPage = await anonymousContext.newPage();

    try {
      await signIn(superuserPage, email, password);
      await superuserPage.goto('/books/account/#tenants');
      const invitePayload = await superuserPage.evaluate(async ({ inviteEmail, inviteName, inviteSlug }) => {
        const { createSelfPublisherInvite } = await import('/books/shared/api.js');
        return createSelfPublisherInvite({ email: inviteEmail, name: inviteName, slug: inviteSlug });
      }, {
        inviteEmail: selfPublisherEmail,
        inviteName: tenantName,
        inviteSlug: tenantSlug,
      });
      const inviteUrl = invitePayload.invite_url || `${superuserPage.url().split('/books/')[0]}/books/auth/?invite=${encodeURIComponent(invitePayload.invite.token)}`;
      if (!inviteUrl) throw new Error('Self-publisher invite link was not returned by the API');

      await expect(superuserPage.locator('body')).toContainText(tenantSlug, { timeout: 20_000 });

      await selfPublisherPage.goto(inviteUrl);
      await expect(selfPublisherPage.locator('#auth-heading')).toHaveText('Confirm Invitation');
      await selfPublisherPage.fill('#signup-name', selfPublisherName);
      await expect(selfPublisherPage.locator('#signup-email')).toHaveValue(selfPublisherEmail);
      await selfPublisherPage.fill('#signup-password', selfPublisherPassword);
      await selfPublisherPage.click('#signup-btn');

      await expect(selfPublisherPage).not.toHaveURL(/\/books\/auth\//, { timeout: 30_000 });
      await expect(selfPublisherPage).toHaveURL(/\/books\//, { timeout: 30_000 });

      await signUpPublicAccount(outsiderPage, outsider);

      await selfPublisherPage.goto('/books/account/#tenants');
      await expect(selfPublisherPage.locator('body')).toContainText(tenantSlug, { timeout: 20_000 });

      await selfPublisherPage.goto('/books/publish/');
      await expect(selfPublisherPage.locator('#publishIntro')).toContainText('allowed organization or self-publisher destination');
      await expect(selfPublisherPage.locator('#uploadTenantSelect')).toContainText(tenantSlug);

      const publicBook = await publishBook(selfPublisherPage, publicEpub, {
        title: publicTitle,
        author: selfPublisherName,
        annotation: `Self-publisher public publication ${suffix}`,
        destinationText: tenantSlug,
        visibility: 'public',
        year: 2026,
      });

      await searchForTitle(anonymousPage, publicTitle);
      await expect(anonymousPage.locator('#searchResults')).toContainText(publicTitle, { timeout: 20_000 });
      await searchForTitle(outsiderPage, publicTitle);
      await expect(outsiderPage.locator('#searchResults')).toContainText(publicTitle, { timeout: 20_000 });

      const publicAnonymousAccess = await apiRequest(anonymousPage, `/books/by-content/${publicBook.content_id}/location`);
      expect(publicAnonymousAccess.status).toBe(200);
      const publicOutsiderAccess = await apiRequest(outsiderPage, `/books/by-content/${publicBook.content_id}/location`);
      expect(publicOutsiderAccess.status).toBe(200);

      const tenantOnlyBook = await publishBook(selfPublisherPage, tenantOnlyEpub, {
        title: tenantOnlyTitle,
        author: selfPublisherName,
        annotation: `Tenant-only publication ${suffix}`,
        destinationText: tenantSlug,
        visibility: 'tenant_only',
        year: 2026,
      });

      await selfPublisherPage.goto('/books/');
      await expect(selfPublisherPage.locator('text=Your Organization Books')).toBeVisible({ timeout: 20_000 });
      await expect(selfPublisherPage.locator('.cardTitle', { hasText: tenantOnlyTitle })).toBeVisible({ timeout: 20_000 });

      await anonymousPage.goto('/books/');
      await expect(anonymousPage.locator('text=Your Organization Books')).toHaveCount(0);
      await expect(anonymousPage.locator('.cardTitle', { hasText: tenantOnlyTitle })).toHaveCount(0);
      await outsiderPage.goto('/books/');
      await expect(outsiderPage.locator('.cardTitle', { hasText: tenantOnlyTitle })).toHaveCount(0);

      const tenantOnlyOwnerAccess = await apiRequest(selfPublisherPage, `/books/by-content/${tenantOnlyBook.content_id}/location`);
      expect(tenantOnlyOwnerAccess.status).toBe(200);
      const tenantOnlyAnonymousAccess = await apiRequest(anonymousPage, `/books/by-content/${tenantOnlyBook.content_id}/location`);
      expect(tenantOnlyAnonymousAccess.status).toBe(403);
      const tenantOnlyOutsiderAccess = await apiRequest(outsiderPage, `/books/by-content/${tenantOnlyBook.content_id}/location`);
      expect(tenantOnlyOutsiderAccess.status).toBe(403);
    } finally {
      await Promise.allSettled([
        fs.rm(publicEpub, { force: true }),
        fs.rm(tenantOnlyEpub, { force: true }),
        superuserContext.close(),
        selfPublisherContext.close(),
        outsiderContext.close(),
        anonymousContext.close(),
      ]);
    }
  });
});
