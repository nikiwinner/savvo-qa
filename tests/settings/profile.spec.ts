/**
 * Settings — Profile page (display name + password change).
 *
 * Verifies that:
 * 1. Display name saves through the profile form and lands in the sidebar.
 * 2. Password change works end-to-end (new password logs in afterwards).
 * 3. A wrong current password surfaces the API error, not a success.
 * 4. Mismatched new passwords are rejected WITHOUT calling the API — that
 *    branch lives only in the SvelteKit action, so no backend test sees it.
 * 5. A Google account has no password card at all — only the google-note.
 */
import { test, expect } from '../../fixtures/index'
import { ApiHelper } from '../../helpers/api'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'

/** Extract the `state` query param from a Google authorize URL. */
function extractState(location: string | null): string {
  if (!location) throw new Error('OAuth start did not return a Location header')
  const state = new URL(location).searchParams.get('state')
  if (!state) throw new Error(`No state in Location header: ${location}`)
  return state
}

test.describe('Profile — display name', () => {
  test('saving a display name updates the profile and the sidebar', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    await page.goto('/dashboard/settings/profile')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('profile-name-input').fill('QA Renamed')
    await page.getByRole('button', { name: /save/i }).click()
    await page.waitForURL(/success=1/, { timeout: 5000 })

    const me = await api.me()
    expect(me?.name).toBe('QA Renamed')
    // Viewport-agnostic persistence check (the sidebar hides the name on
    // narrow viewports): after the redirect the form re-renders server state.
    await expect(page.getByTestId('profile-name-input')).toHaveValue('QA Renamed')
  })
})

test.describe('Profile — password change', () => {
  test('user can change password and log in with the new one', async ({
    page,
    loggedInPage,
    playwright,
  }) => {
    const { user } = loggedInPage
    const newPassword = 'NewPass456!'

    await page.goto('/dashboard/settings/profile')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('password-current').fill(user.password)
    await page.getByTestId('password-new').fill(newPassword)
    await page.getByTestId('password-confirm').fill(newPassword)
    await page.getByTestId('password-save').click()

    await expect(page.getByTestId('password-success')).toBeVisible({ timeout: 5000 })

    // The action redirects on success, and SvelteKit resets a form only on a
    // `success` result — so the handler clears these by hand. Without that the
    // old AND the new password sit in the DOM after the change.
    await expect(page.getByTestId('password-current')).toHaveValue('')
    await expect(page.getByTestId('password-new')).toHaveValue('')
    await expect(page.getByTestId('password-confirm')).toHaveValue('')

    // The change is real: a fresh session logs in with the NEW password.
    const freshCtx = await playwright.request.newContext()
    const freshApi = new ApiHelper(freshCtx)
    await freshApi.login(user.email, newPassword)
    const me = await freshApi.me()
    expect(me?.email).toBe(user.email)
    await freshCtx.dispose()
  })

  test('wrong current password shows the API error', async ({ page, loggedInPage }) => {
    void loggedInPage

    await page.goto('/dashboard/settings/profile')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('password-current').fill('definitely-wrong-1!')
    await page.getByTestId('password-new').fill('NewPass456!')
    await page.getByTestId('password-confirm').fill('NewPass456!')
    await page.getByTestId('password-save').click()

    await expect(page.getByTestId('password-error')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('password-error')).toContainText('Current password is incorrect')
    await expect(page.getByTestId('password-success')).toHaveCount(0)

    // The other half of the clear-on-success rule: a FAILURE keeps what was
    // typed, so the user corrects one field instead of retyping all three.
    await expect(page.getByTestId('password-new')).toHaveValue('NewPass456!')
    await expect(page.getByTestId('password-confirm')).toHaveValue('NewPass456!')
  })
})

test.describe('Profile — password branches with no backend coverage', () => {
  test('mismatched new passwords are rejected without touching the API', async ({
    page,
    loggedInPage,
  }) => {
    const { user } = loggedInPage

    // This branch returns from `+page.server.ts` BEFORE any apiFetch, so the
    // backend never sees it and no pytest can catch a regression here.
    let apiCalled = false
    await page.route('**/api/auth/password/', (route) => {
      apiCalled = true
      return route.continue()
    })

    await page.goto('/dashboard/settings/profile')

    await page.getByTestId('password-current').fill(user.password)
    await page.getByTestId('password-new').fill('NewPass456!')
    await page.getByTestId('password-confirm').fill('DifferentPass789!')
    await page.getByTestId('password-save').click()

    await expect(page.getByTestId('password-error')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('password-error')).toContainText('do not match')
    await expect(page.getByTestId('password-success')).toHaveCount(0)
    expect(apiCalled).toBe(false)

    // The real password still works — the rejected attempt changed nothing.
    const me = await loggedInPage.api.me()
    expect(me?.email).toBe(user.email)
  })

  test('a Google account sees the google-note instead of the password card', async ({
    browser,
  }) => {
    // Drive the mocked OAuth flow on a BrowserContext: its `request` shares the
    // page cookie jar, so the page below is logged in as the Google user.
    // Same canned code + shared-DB caveat as tests/auth/google-signin.spec.ts —
    // on a re-run the fixture email simply logs the existing user back in.
    const ctx = await browser.newContext()
    const startRes = await ctx.request.get(`${BACKEND_URL}/api/auth/google/start/`, {
      maxRedirects: 0,
    })
    expect(startRes.status()).toBe(302)
    const state = extractState(startRes.headers()['location'] ?? null)

    const callbackRes = await ctx.request.get(
      `${BACKEND_URL}/api/auth/google/callback/?code=test-fresh-user-code&state=${encodeURIComponent(state)}`,
      { maxRedirects: 0 },
    )
    expect(callbackRes.status()).toBe(302)

    const page = await ctx.newPage()
    await page.goto('/dashboard/settings/profile')

    // The whole password card is gated on `has_password`; a Google user has none.
    await expect(page.getByText(/signs in with Google/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('password-current')).toHaveCount(0)
    await expect(page.getByTestId('password-new')).toHaveCount(0)
    await expect(page.getByTestId('password-save')).toHaveCount(0)
    // And the account block names the method rather than claiming a password.
    await expect(page.getByText('Google account')).toBeVisible()

    await ctx.close()
  })
})
