/**
 * Auth — Google Sign-In (Phase 09 Story 9.10)
 *
 * Covers the user-observable behaviour of the Google OAuth flow:
 *   1. Login page exposes a "Sign in with Google" button that points at
 *      the backend's /api/auth/google/start/ endpoint, which 302s to
 *      Google's authorize URL with a CSRF `state`.
 *   2. The OAuth callback creates a brand-new user (and session) when the
 *      stub code maps to an unseen email.
 *   3. The OAuth callback logs in the existing user (no duplicate created)
 *      when the stub code maps to an email that already has an account.
 *
 * The QA backend is started with OAUTH_TEST_MODE=True (see
 * playwright.config.ts), which short-circuits the live Google call and
 * resolves test codes via authzone/oauth.py:_TEST_CODES.
 *
 * The state-validation path is exercised end-to-end:
 *   - we GET /api/auth/google/start/ first (capturing the cookie jar),
 *   - parse the `state` from the Location header,
 *   - then GET the callback with that same state in the query string.
 * The session cookie is preserved across both calls by the request context.
 */
import { test, expect } from '@playwright/test'
import { uniqueUser, ApiHelper } from '../../helpers/api'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5174'

/** Extract the `state` query param from a Google authorize URL. */
function extractState(location: string | null): string {
  if (!location) {
    throw new Error('OAuth start did not return a Location header')
  }
  // The URL constructor handles cross-origin URLs fine.
  const url = new URL(location)
  const state = url.searchParams.get('state')
  if (!state) {
    throw new Error(`No state in Location header: ${location}`)
  }
  return state
}

test.describe('Google Sign-In', () => {
  test('Sign in with Google button on /login redirects to backend OAuth start', async ({
    page,
    playwright,
  }) => {
    // Verify the button is on the login page and wired to the backend endpoint.
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const googleButton = page.getByRole('button', { name: 'Sign in with Google' })
    await expect(googleButton).toBeVisible()

    // Rather than clicking the button (which triggers a top-level navigation
    // to accounts.google.com that Playwright would either fail or hang on),
    // verify the backend endpoint produces the correct 302 to Google.
    // This is what the button's `window.location.href = ...` ultimately hits.
    const reqCtx = await playwright.request.newContext()
    const res = await reqCtx.get(`${BACKEND_URL}/api/auth/google/start/`, {
      maxRedirects: 0,
    })
    expect(res.status()).toBe(302)
    const location = res.headers()['location']
    expect(location).toBeTruthy()
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/)
    // The redirect URL must carry a state token so CSRF protection works.
    expect(location).toMatch(/[?&]state=[^&]+/)
    // And it must request the openid email profile scope. Python's urlencode
    // turns spaces into '+', not '%20', so match the literal wire format.
    expect(location).toContain('scope=openid+email+profile')
    await reqCtx.dispose()
  })

  test('mocked Google callback creates a new session and lands on /dashboard', async ({
    playwright,
    browser,
  }) => {
    // Use a fresh email that won't collide with anything else in the suite.
    // The stub maps 'test-fresh-user-code' → newuser@example.com, but we
    // need a per-run unique email to keep parallel projects isolated.
    // Approach: hit the start, capture state + sessionid; then hit callback
    // with the canned 'test-fresh-user-code'. Because the test DB is flushed
    // at suite start, 'newuser@example.com' is fresh on the first run; on
    // re-runs across the 3 projects the same fixture email is reused, but
    // the OAuth flow still succeeds — it just logs the existing user in.
    // To assert the *creation* path cleanly we delete that user first
    // (idempotent) by signing up an unrelated user and using its session
    // is not necessary — instead we use the canned 'test-fresh-user-code'
    // and assert ONLY the user-observable outcome: sessionid set, redirected
    // to /dashboard, /me reports the expected email.
    //
    // For the "no duplicate" part of Test 3 we use 'test-existing-user-code'
    // after seeding 'existing@example.com' via the signup helper.

    const reqCtx = await playwright.request.newContext()

    // 1. Hit the start endpoint; capture the state from the Location URL.
    const startRes = await reqCtx.get(`${BACKEND_URL}/api/auth/google/start/`, {
      maxRedirects: 0,
    })
    expect(startRes.status()).toBe(302)
    const state = extractState(startRes.headers()['location'] ?? null)

    // 2. Hit the callback with the matching state + a fresh-user stub code.
    const callbackRes = await reqCtx.get(
      `${BACKEND_URL}/api/auth/google/callback/?code=test-fresh-user-code&state=${encodeURIComponent(state)}`,
      { maxRedirects: 0 },
    )
    expect(callbackRes.status()).toBe(302)
    const callbackLocation = callbackRes.headers()['location']
    expect(callbackLocation).toBe(`${FRONTEND_URL}/dashboard`)

    // 3. The session cookie must now be set on the context's cookie jar.
    const cookies = (await reqCtx.storageState()).cookies
    const sessionCookie = cookies.find((c) => c.name === 'sessionid')
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.value).toBeTruthy()

    // 4. /api/auth/me/ should now report the Google-resolved user.
    const meRes = await reqCtx.get(`${BACKEND_URL}/api/auth/me/`)
    expect(meRes.ok()).toBe(true)
    const meBody = await meRes.json()
    expect(meBody.user).toBeTruthy()
    expect(meBody.user.email.toLowerCase()).toBe('newuser@example.com')

    // 5. The session also works in a real browser: copy the cookies into a
    //    browser context and confirm /dashboard renders for this user.
    const browserCtx = await browser.newContext()
    await browserCtx.addCookies(cookies)
    const page = await browserCtx.newPage()
    await page.goto(`${FRONTEND_URL}/dashboard`)
    await expect(page).toHaveURL(/\/dashboard/)

    await browserCtx.close()
    await reqCtx.dispose()
  })

  test('mocked Google callback for an existing email logs that user in', async ({
    playwright,
  }) => {
    // 1. Pre-seed a user with the email the stub will return.
    //    The stub 'test-existing-user-code' resolves to existing@example.com.
    //    We can't know if a previous test in the same run already created
    //    that user (the global flush happens once per run, not per test),
    //    so we sign it up only if it's not already there. We do this by
    //    attempting signup and accepting either success or a "duplicate"
    //    400 response — both leave the DB in the state we want.
    const seedCtx = await playwright.request.newContext()
    const seedApi = new ApiHelper(seedCtx)
    const seedUser = {
      email: 'existing@example.com',
      password: 'TestPass123!',
      name: 'Existing User',
    }
    try {
      await seedApi.signup(seedUser)
    } catch (err) {
      // Already-exists is fine — we just need *some* user with that email.
      const message = err instanceof Error ? err.message : String(err)
      if (!/400/.test(message)) throw err
    }
    await seedCtx.dispose()

    // 2. Snapshot the user count for that email BEFORE the OAuth round-trip.
    //    Because we don't have admin API, fetch /api/auth/me/ via a logged-in
    //    session and assert the same id post-callback. The cleaner check is:
    //    log in as the seeded user, capture id; then run OAuth; then query
    //    /me on the OAuth context and expect the SAME id.
    const checkCtx = await playwright.request.newContext()
    const checkApi = new ApiHelper(checkCtx)
    await checkApi.login(seedUser.email, seedUser.password)
    const before = await checkApi.me()
    expect(before).toBeTruthy()
    const seededId = before!.id
    await checkCtx.dispose()

    // 3. Run the OAuth dance in a fresh context (no prior session).
    const oauthCtx = await playwright.request.newContext()
    const startRes = await oauthCtx.get(`${BACKEND_URL}/api/auth/google/start/`, {
      maxRedirects: 0,
    })
    expect(startRes.status()).toBe(302)
    const state = extractState(startRes.headers()['location'] ?? null)

    const callbackRes = await oauthCtx.get(
      `${BACKEND_URL}/api/auth/google/callback/?code=test-existing-user-code&state=${encodeURIComponent(state)}`,
      { maxRedirects: 0 },
    )
    expect(callbackRes.status()).toBe(302)
    expect(callbackRes.headers()['location']).toBe(`${FRONTEND_URL}/dashboard`)

    // 4. The OAuth-context's /me must return the SAME user id as the seeded
    //    login — proving no duplicate was created and the email match worked.
    const oauthApi = new ApiHelper(oauthCtx)
    const after = await oauthApi.me()
    expect(after).toBeTruthy()
    expect(after!.id).toBe(seededId)
    expect(after!.email.toLowerCase()).toBe('existing@example.com')

    await oauthCtx.dispose()
  })
})
