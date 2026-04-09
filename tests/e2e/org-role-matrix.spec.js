const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { signIn } = require('../helpers/auth');
const { createMinimalEpub } = require('../helpers/epub');

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function inviteUrlFromToken(baseUrl, token) {
  return `${baseUrl}/books/auth/?invite=${encodeURIComponent(token)}`;
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

async function acceptInvite(page, { inviteUrl, email, password, displayName }) {
  await page.goto(inviteUrl);
  await expect(page.locator('#auth-heading')).toHaveText('Confirm Invitation');
  await expect(page.locator('#signup-email')).toHaveValue(email);
  await page.fill('#signup-name', displayName);
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
    return match?.value || '';
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
  await expect(page.locator('#bookList')).not.toContainText('Loading...', { timeout: 20_000 });
  await page.click('#uploadBtn');
  await expect(page.locator('#fileInput')).toBeAttached();
  await selectPublishingDestination(page, '#uploadTenantSelect', details.destinationText);
  await page.setInputFiles('#fileInput', epubPath);

  await expect(page.locator('#bookStatus .status-badge')).toHaveText(/ready|published/, { timeout: 90_000 });
  await expect(page.locator('#publishBtn')).toBeDisabled();

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

async function getUserMenuLinks(page) {
  return page.locator('user-menu').evaluate((el) => {
    const root = el.shadowRoot;
    return Array.from(root.querySelectorAll('a')).map((link) => ({
      text: (link.textContent || '').trim(),
      href: link.getAttribute('href') || '',
    }));
  });
}

test.describe('Organization publishing matrix and visibility', () => {
  test('verifies org role access, publish flows, visibility, and negative cases', async ({ browser }) => {
    test.setTimeout(600_000);

    const superuserEmail = process.env.SUPERUSER_EMAIL;
    const superuserPassword = process.env.SUPERUSER_PASSWORD;
    test.skip(!superuserEmail || !superuserPassword, 'SUPERUSER_EMAIL and SUPERUSER_PASSWORD must be set');

    const suffix = uniqueSuffix();
    const baseOrigin = 'https://books-staging.reader.pub';
    const tenantSlug = `pw-org-${suffix}`.slice(0, 40);
    const tenantName = `PW Org ${suffix}`;

    const admin = {
      email: `yarane+orgadmin-${suffix}@gmail.com`,
      password: `Sophi@35-${suffix.slice(-6)}`,
      displayName: `PW Org Admin ${suffix}`,
    };
    const publisher = {
      email: `yarane+publisher-${suffix}@gmail.com`,
      password: `Sophi@35-${suffix.slice(-6)}p`,
      displayName: `PW Publisher ${suffix}`,
    };
    const member = {
      email: `yarane+member-${suffix}@gmail.com`,
      password: `Sophi@35-${suffix.slice(-6)}m`,
      displayName: `PW Member ${suffix}`,
    };
    const outsider = {
      email: `yarane+outsider-${suffix}@gmail.com`,
      password: `Sophi@35-${suffix.slice(-6)}o`,
      displayName: `PW Outsider ${suffix}`,
    };
    const wrongInvite = {
      email: `yarane+wronginvite-${suffix}@gmail.com`,
    };

    const publicTitle = `Matrix Public ${suffix}`;
    const tenantOnlyTitle = `Matrix OrgOnly ${suffix}`;
    const publicEpub = path.join(os.tmpdir(), `matrix-public-${suffix}.epub`);
    const tenantOnlyEpub = path.join(os.tmpdir(), `matrix-orgonly-${suffix}.epub`);

    await createMinimalEpub(publicEpub, {
      title: publicTitle,
      author: admin.displayName,
      chapterText: `Public organization visibility ${suffix}`,
    });
    await createMinimalEpub(tenantOnlyEpub, {
      title: tenantOnlyTitle,
      author: admin.displayName,
      chapterText: `Tenant-only organization visibility ${suffix}`,
    });

    const superuserContext = await browser.newContext();
    const adminContext = await browser.newContext();
    const publisherContext = await browser.newContext();
    const memberContext = await browser.newContext();
    const outsiderContext = await browser.newContext();
    const anonymousContext = await browser.newContext();

    const superuserPage = await superuserContext.newPage();
    const adminPage = await adminContext.newPage();
    const publisherPage = await publisherContext.newPage();
    const memberPage = await memberContext.newPage();
    const outsiderPage = await outsiderContext.newPage();
    const anonymousPage = await anonymousContext.newPage();

    try {
      await signIn(superuserPage, superuserEmail, superuserPassword);

      const createTenantResponse = await apiRequest(superuserPage, '/tenants', {
        method: 'POST',
        body: { name: tenantName, slug: tenantSlug, tenant_type: 'publisher' },
      });
      expect(createTenantResponse.ok).toBeTruthy();

      const adminInviteResponse = await apiRequest(superuserPage, `/tenants/${tenantSlug}/admin-invite`, {
        method: 'POST',
        body: { email: admin.email, role: 'admin' },
      });
      expect(adminInviteResponse.ok).toBeTruthy();

      const adminInvite = adminInviteResponse.data.invite || adminInviteResponse.data;
      const adminInviteUrl = adminInviteResponse.data.invite_url || inviteUrlFromToken(baseOrigin, adminInvite.token);

      await signUpPublicAccount(outsiderPage, outsider);
      await acceptInvite(adminPage, {
        inviteUrl: adminInviteUrl,
        email: admin.email,
        password: admin.password,
        displayName: admin.displayName,
      });

      let rosterResponse = await apiRequest(superuserPage, `/tenants/${tenantSlug}/roster`);
      expect(rosterResponse.ok).toBeTruthy();
      expect(rosterResponse.data.pending_invites.some((invite) => invite.email === admin.email)).toBeFalsy();
      expect(rosterResponse.data.members.some((row) => row.user_id && row.role === 'admin')).toBeTruthy();
      expect(rosterResponse.data.members.some((row) => row.created_at)).toBeTruthy();

      await adminPage.goto('/books/account/#tenants');
      await expect(adminPage.locator('body')).toContainText(tenantSlug, { timeout: 20_000 });
      await expect.soft(adminPage.locator('body')).not.toContainText('Create Organization');
      await expect.soft(adminPage.locator('body')).not.toContainText('Self-Publisher Invite');
      await expect.soft(adminPage.locator('body')).not.toContainText('Invite Superuser');
      const hasModalInviteUi = (await adminPage.locator('#tenantInviteModal').count()) > 0;
      if (hasModalInviteUi) {
        await expect.soft(adminPage.locator(`h3.tenant-title:has-text("${tenantName}")`)).toBeVisible();
        await expect.soft(adminPage.locator(`text=Type: Publisher`)).toBeVisible();
        await expect.soft(adminPage.getByRole('button', { name: 'Invite New Members' }).first()).toBeVisible();
        await expect.soft(adminPage.locator('th', { hasText: 'Name' }).first()).toBeVisible();
        await expect.soft(adminPage.locator('th', { hasText: 'Action' }).first()).toBeVisible();
        await expect.soft(adminPage.locator('tr', { hasText: admin.displayName }).getByText('Disable Member')).toHaveCount(0);

        await adminPage.getByRole('button', { name: 'Invite New Members' }).first().click();
        await expect(adminPage.locator('#tenantInviteModal')).toHaveClass(/open/);
        await adminPage.fill('#tenantInviteEmail', publisher.email);
        await adminPage.selectOption('#tenantInviteRole', 'publisher');
        await adminPage.click('#tenantInviteSubmitBtn');
        await expect(adminPage.locator('#tenantInviteModal')).not.toHaveClass(/open/, { timeout: 20_000 });
      } else {
        await expect.soft(adminPage.locator(`[data-tenant-email="${tenantSlug}"]`)).toBeVisible();
        await expect.soft(adminPage.locator(`[data-tenant-role="${tenantSlug}"]`)).toBeVisible();
        await expect.soft(adminPage.locator(`button[data-tenant-slug="${tenantSlug}"]`)).toBeVisible();
        const publisherInviteResponse = await apiRequest(adminPage, `/tenants/${tenantSlug}/invite`, {
          method: 'POST',
          body: { email: publisher.email, role: 'publisher' },
        });
        expect(publisherInviteResponse.ok).toBeTruthy();
      }

      const publisherRosterSnapshot = await apiRequest(adminPage, `/tenants/${tenantSlug}/roster`);
      const publisherPendingInvite = publisherRosterSnapshot.data.pending_invites.find((invite) => invite.email === publisher.email);
      expect(publisherPendingInvite).toBeTruthy();
      const publisherInviteUrl = inviteUrlFromToken(baseOrigin, publisherPendingInvite.token);

      const memberInviteResponse = await apiRequest(adminPage, `/tenants/${tenantSlug}/invite`, {
        method: 'POST',
        body: { email: member.email, role: 'member' },
      });
      expect(memberInviteResponse.ok).toBeTruthy();
      const memberInviteUrl = memberInviteResponse.data.invite_url || inviteUrlFromToken(baseOrigin, memberInviteResponse.data.token);

      const memberRosterSnapshot = await apiRequest(adminPage, `/tenants/${tenantSlug}/roster`);
      const memberPendingInvite = memberRosterSnapshot.data.pending_invites.find((invite) => invite.email === member.email);
      expect(memberPendingInvite).toBeTruthy();

      const wrongInviteResponse = await apiRequest(adminPage, `/tenants/${tenantSlug}/invite`, {
        method: 'POST',
        body: { email: wrongInvite.email, role: 'member' },
      });
      expect(wrongInviteResponse.ok).toBeTruthy();
      const wrongInviteRoster = await apiRequest(adminPage, `/tenants/${tenantSlug}/roster`);
      const wrongInvitePending = wrongInviteRoster.data.pending_invites.find((invite) => invite.email === wrongInvite.email);
      expect(wrongInvitePending).toBeTruthy();

      await acceptInvite(publisherPage, {
        inviteUrl: publisherInviteUrl,
        email: publisher.email,
        password: publisher.password,
        displayName: publisher.displayName,
      });
      await acceptInvite(memberPage, {
        inviteUrl: memberInviteUrl,
        email: member.email,
        password: member.password,
        displayName: member.displayName,
      });

      rosterResponse = await apiRequest(superuserPage, `/tenants/${tenantSlug}/roster`);
      expect(rosterResponse.ok).toBeTruthy();
      expect(rosterResponse.data.pending_invites.some((invite) => invite.email === publisher.email)).toBeFalsy();
      expect(rosterResponse.data.pending_invites.some((invite) => invite.email === member.email)).toBeFalsy();
      expect(rosterResponse.data.members.some((row) => row.role === 'publisher')).toBeTruthy();
      expect(rosterResponse.data.members.some((row) => row.role === 'member')).toBeTruthy();

      await adminPage.goto('/books/account/#tenants');
      const disableButtonsVisible = (await adminPage.locator('.tenant-disable-btn').count()) > 0;
      if (disableButtonsVisible) {
        await expect.soft(adminPage.locator('tr', { hasText: publisher.displayName }).getByRole('button', { name: 'Disable Member' })).toBeVisible({ timeout: 20_000 });
        await expect.soft(adminPage.locator('tr', { hasText: member.displayName }).getByRole('button', { name: 'Disable Member' })).toBeVisible({ timeout: 20_000 });
      }

      const reuseAdminInviteResponse = await apiRequest(adminPage, '/invitations/accept', {
        method: 'POST',
        body: { token: adminInvite.token },
      });
      expect.soft(reuseAdminInviteResponse.ok).toBeFalsy();

      const deleteAcceptedMemberInviteResponse = await apiRequest(superuserPage, `/tenants/${tenantSlug}/invitations/${memberPendingInvite.id}`, {
        method: 'DELETE',
      });
      expect.soft(deleteAcceptedMemberInviteResponse.status).toBe(404);

      const wrongEmailAcceptResponse = await apiRequest(outsiderPage, '/invitations/accept', {
        method: 'POST',
        body: { token: wrongInvitePending.token },
      });
      expect.soft(wrongEmailAcceptResponse.ok).toBeFalsy();

      await superuserPage.goto('/books/publish/');
      await expect.soft(superuserPage.locator('#publishIntro')).toContainText('personal manual path', { timeout: 20_000 });
      await expect.soft(superuserPage.locator('#uploadTenantSelect')).toContainText('Personal publishing', { timeout: 20_000 });

      await adminPage.goto('/books/publish/');
      await expect.soft(adminPage.locator('#publishIntro')).toContainText('allowed organization or self-publisher destination', { timeout: 20_000 });
      await expect.soft(adminPage.locator('#uploadTenantSelect')).toContainText(tenantSlug, { timeout: 20_000 });
      await expect.soft(adminPage.locator('#uploadTenantSelect')).not.toContainText('Personal publishing');

      const publisherAccess = await apiRequest(publisherPage, '/me/platform-access');
      expect(publisherAccess.ok).toBeTruthy();
      expect.soft(publisherAccess.data.can_publish).toBeTruthy();
      expect.soft(publisherAccess.data.publishing_tenants.some((row) => row.role === 'publisher' && row.tenant && row.tenant.slug === tenantSlug)).toBeTruthy();
      await publisherPage.goto('/books/publish/');
      await expect.soft(publisherPage.locator('#uploadBtn')).toBeVisible({ timeout: 20_000 });
      await expect.soft(publisherPage.locator('#uploadTenantSelect')).toContainText(tenantSlug, { timeout: 20_000 });
      await expect.soft(publisherPage.locator('#uploadTenantSelect')).not.toContainText('Personal publishing');

      await memberPage.goto('/books/');
      const memberMenuLinks = await getUserMenuLinks(memberPage);
      expect.soft(memberMenuLinks.some((link) => link.text === 'Publish')).toBeFalsy();
      expect.soft(memberMenuLinks.some((link) => link.text === 'My Publications')).toBeFalsy();
      await memberPage.goto('/books/account/#publications');
      await expect.soft(memberPage).toHaveURL(/#library/, { timeout: 20_000 });
      await memberPage.goto('/books/publish/');
      await expect.soft(memberPage).toHaveURL(/\/books\/account\/#library/, { timeout: 20_000 });
      const memberPublishBooksResponse = await apiRequest(memberPage, '/publish/books');
      expect.soft(memberPublishBooksResponse.status).toBe(200);
      expect.soft(Array.isArray(memberPublishBooksResponse.data)).toBeTruthy();
      expect.soft(memberPublishBooksResponse.data.length).toBe(0);

      await adminPage.goto('/books/publish/');
      await adminPage.click('#uploadBtn');
      await adminPage.evaluate(() => {
        const select = document.getElementById('uploadTenantSelect');
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await adminPage.setInputFiles('#fileInput', publicEpub);
      await expect.soft(adminPage.locator('#alert')).toContainText('Choose a publishing destination first.', { timeout: 15_000 });

      const publicBook = await publishBook(adminPage, publicEpub, {
        title: publicTitle,
        author: admin.displayName,
        annotation: `Public organization book ${suffix}`,
        destinationText: tenantSlug,
        visibility: 'public',
        year: 2026,
      });

      await searchForTitle(anonymousPage, publicTitle);
      await expect.soft(anonymousPage.locator('#searchResults')).toContainText(publicTitle, { timeout: 20_000 });
      await searchForTitle(outsiderPage, publicTitle);
      await expect.soft(outsiderPage.locator('#searchResults')).toContainText(publicTitle, { timeout: 20_000 });
      await searchForTitle(memberPage, publicTitle);
      await expect.soft(memberPage.locator('#searchResults')).toContainText(publicTitle, { timeout: 20_000 });
      await searchForTitle(publisherPage, publicTitle);
      await expect.soft(publisherPage.locator('#searchResults')).toContainText(publicTitle, { timeout: 20_000 });
      await searchForTitle(adminPage, publicTitle);
      await expect.soft(adminPage.locator('#searchResults')).toContainText(publicTitle, { timeout: 20_000 });
      await searchForTitle(superuserPage, publicTitle);
      await expect.soft(superuserPage.locator('#searchResults')).toContainText(publicTitle, { timeout: 20_000 });

      const publicBookReaders = [
        ['anonymous', anonymousPage],
        ['outsider', outsiderPage],
        ['member', memberPage],
        ['publisher', publisherPage],
        ['admin', adminPage],
        ['superuser', superuserPage],
      ];
      for (const [, page] of publicBookReaders) {
        const response = await apiRequest(page, `/books/by-content/${publicBook.content_id}/location`);
        expect.soft(response.status).toBe(200);
      }

      const tenantOnlyBook = await publishBook(adminPage, tenantOnlyEpub, {
        title: tenantOnlyTitle,
        author: admin.displayName,
        annotation: `Tenant-only organization book ${suffix}`,
        destinationText: tenantSlug,
        visibility: 'tenant_only',
        year: 2026,
      });

      await adminPage.goto('/books/');
      await expect.soft(adminPage.locator('text=Your Organization Books')).toBeVisible({ timeout: 20_000 });
      await expect.soft(adminPage.locator('.cardTitle', { hasText: tenantOnlyTitle })).toBeVisible({ timeout: 20_000 });
      await publisherPage.goto('/books/');
      await expect.soft(publisherPage.locator('.cardTitle', { hasText: tenantOnlyTitle })).toBeVisible({ timeout: 20_000 });
      await memberPage.goto('/books/');
      await expect.soft(memberPage.locator('.cardTitle', { hasText: tenantOnlyTitle })).toBeVisible({ timeout: 20_000 });

      await outsiderPage.goto('/books/');
      await expect.soft(outsiderPage.locator('.cardTitle', { hasText: tenantOnlyTitle })).toHaveCount(0);
      await anonymousPage.goto('/books/');
      await expect.soft(anonymousPage.locator('.cardTitle', { hasText: tenantOnlyTitle })).toHaveCount(0);
      await superuserPage.goto('/books/');
      await expect.soft(superuserPage.locator('.cardTitle', { hasText: tenantOnlyTitle })).toBeVisible({ timeout: 20_000 });

      const tenantOnlyLocationExpectations = [
        ['admin', adminPage, 200],
        ['publisher', publisherPage, 200],
        ['member', memberPage, 200],
        ['outsider', outsiderPage, 403],
        ['anonymous', anonymousPage, 403],
        ['superuser', superuserPage, 200],
      ];
      for (const [, page, expectedStatus] of tenantOnlyLocationExpectations) {
        const response = await apiRequest(page, `/books/by-content/${tenantOnlyBook.content_id}/location`);
        expect.soft(response.status).toBe(expectedStatus);
      }

      if (disableButtonsVisible && (await adminPage.locator('#tenantDisableModal').count()) > 0) {
        await adminPage.goto('/books/account/#tenants');
        await adminPage.locator('tr', { hasText: publisher.displayName }).getByRole('button', { name: 'Disable Member' }).click();
        await expect(adminPage.locator('#tenantDisableModal')).toHaveClass(/open/);
        await expect.soft(adminPage.locator('#tenantDisableModalBody')).toContainText(publisher.displayName);
        await adminPage.click('#tenantDisableSubmitBtn');
        await expect(adminPage.locator('#tenantDisableModal')).not.toHaveClass(/open/, { timeout: 20_000 });
        await expect.soft(adminPage.locator('tr', { hasText: publisher.displayName })).toHaveCount(0, { timeout: 20_000 });

        rosterResponse = await apiRequest(superuserPage, `/tenants/${tenantSlug}/roster`);
        expect.soft(rosterResponse.data.members.some((row) => row.role === 'publisher')).toBeFalsy();

        const disabledPublisherAccess = await apiRequest(publisherPage, '/me/platform-access');
        expect.soft(disabledPublisherAccess.ok).toBeTruthy();
        expect.soft(disabledPublisherAccess.data.can_publish).toBeFalsy();
        await publisherPage.goto('/books/publish/');
        await expect.soft(publisherPage).toHaveURL(/\/books\/account\/#library/, { timeout: 20_000 });
        const disabledPublisherBookAccess = await apiRequest(publisherPage, `/books/by-content/${tenantOnlyBook.content_id}/location`);
        expect.soft(disabledPublisherBookAccess.status).toBe(403);
      }
    } finally {
      await Promise.allSettled([
        fs.rm(publicEpub, { force: true }),
        fs.rm(tenantOnlyEpub, { force: true }),
        superuserContext.close(),
        adminContext.close(),
        publisherContext.close(),
        memberContext.close(),
        outsiderContext.close(),
        anonymousContext.close(),
      ]);
    }
  });
});
