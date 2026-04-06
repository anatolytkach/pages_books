async function signIn(page, email, password) {
  await page.goto('/books/auth/');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => typeof window.supabase !== 'undefined' && !!document.getElementById('signin-form'));

  const signinForm = page.locator('#signin-form');
  const emailInput = page.locator('#signin-email, input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('#signin-password, input[type="password"], input[name="password"]').first();
  const authError = page.locator('#alert, .alert, [role="alert"]').first();

  await signinForm.waitFor({ state: 'visible' });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  const leftAuthPromise = page
    .waitForURL((url) => !url.pathname.startsWith('/books/auth/'), { timeout: 15_000 })
    .then(() => 'left-auth');
  const errorPromise = authError
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => 'auth-error');

  await signinForm.evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  let outcome;
  try {
    outcome = await Promise.race([leftAuthPromise, errorPromise]);
  } catch {
    throw new Error(`Sign-in did not establish an authenticated session. Still on: ${page.url()}`);
  }

  if (outcome === 'auth-error') {
    const message = (await authError.textContent()) || 'Unknown sign-in failure';
    throw new Error(`Sign-in failed: ${message.trim()}`);
  }
}

module.exports = {
  signIn
};
