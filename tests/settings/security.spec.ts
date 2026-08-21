/**
 * Settings — Security (password change).
 *
 * Moved out of settings/profile.spec.ts in the 2026-08-20 redesign: the
 * password lives on its own route now, and the three fields open in an
 * EditSheet rather than sitting permanently expanded on the profile page.
 *
 * Verifies that:
 * 1. Password change works end-to-end (the new password logs in afterwards) and
 *    the sheet closes with nothing left in the DOM.
 * 2. A wrong current password surfaces the API error INSIDE the sheet, keeps
 *    the sheet open, and keeps what was typed.
 * 3. Mismatched new passwords are rejected WITHOUT calling the API — that
 *    branch lives only in the SvelteKit action, so no backend test sees it.
 * 4. A Google account gets no password row at all.
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

test.describe('Security — password change', () => {
  test('user can change password and log in with the new one', async ({
    page,
    loggedInPage,
    playwright,
  }) => {
    const { user } = loggedInPage
    const newPassword = 'NewPass456!'

    await page.goto('/dashboard/settings/security')
    await page.waitForLoadState('networkidle')

    // Nothing password-shaped is in the DOM until the row is opened.
    await expect(page.getByTestId('password-current')).toHaveCount(0)

    await page.getByTestId('password-row').click()
    await expect(page.getByTestId('sheet-password')).toBeVisible()

    await page.getByTestId('password-current').fill(user.password)
    await page.getByTestId('password-new').fill(newPassword)
    await page.getByTestId('password-confirm').fill(newPassword)
    await page.getByTestId('password-save').click()

    await expect(page.getByTestId('password-success')).toBeVisible({ timeout: 8000 })

    // The action redirects on success and the sheet closes, so the fields are
    // gone from the document entirely — the old AND the new password used to
    // sit in the DOM after a change.
    await expect(page.getByTestId('sheet-password')).toHaveCount(0)
    await expect(page.getByTestId('password-current')).toHaveCount(0)
    await expect(page.getByTestId('password-new')).toHaveCount(0)
    await expect(page.getByTestId('password-confirm')).toHaveCount(0)

    // Re-opening the sheet must not resurrect what was typed.
    await page.getByTestId('password-row').click()
    await expect(page.getByTestId('password-new')).toHaveValue('')
    await page.keyboard.press('Escape')

    // The change is real: a fresh session logs in with the NEW password.
    const freshCtx = await playwright.request.newContext()
    const freshApi = new ApiHelper(freshCtx)
    await freshApi.login(user.email, newPassword)
    const me = await freshApi.me()
    expect(me?.email).toBe(user.email)
    await freshCtx.dispose()
  })

  test('wrong current password shows the API error inside the sheet', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.goto('/dashboard/settings/security')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('password-row').click()
    await page.getByTestId('password-current').fill('definitely-wrong-1!')
    await page.getByTestId('password-new').fill('NewPass456!')
    await page.getByTestId('password-confirm').fill('NewPass456!')
    await page.getByTestId('password-save').click()

    await expect(page.getByTestId('password-error')).toBeVisible({ timeout: 8000 })
    await expect(page.getByTestId('password-error')).toContainText('Current password is incorrect')
    await expect(page.getByTestId('password-success')).toHaveCount(0)

    // A failure keeps the sheet open with what was typed, so the user corrects
    // one field instead of retyping all three.
    await expect(page.getByTestId('sheet-password')).toBeVisible()
    await expect(page.getByTestId('password-new')).toHaveValue('NewPass456!')
    await expect(page.getByTestId('password-confirm')).toHaveValue('NewPass456!')
  })

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

    await page.goto('/dashboard/settings/security')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('password-row').click()
    await page.getByTestId('password-current').fill(user.password)
    await page.getByTestId('password-new').fill('NewPass456!')
    await page.getByTestId('password-confirm').fill('DifferentPass789!')
    await page.getByTestId('password-save').click()

    await expect(page.getByTestId('password-error')).toBeVisible({ timeout: 8000 })
    await expect(page.getByTestId('password-error')).toContainText('do not match')
    await expect(page.getByTestId('password-success')).toHaveCount(0)
    expect(apiCalled).toBe(false)

    // The real password still works — the rejected attempt changed nothing.
    const me = await loggedInPage.api.me()
    expect(me?.email).toBe(user.email)
  })
})

test.describe('Security — the two disabled rows', () => {
  test('2FA and Active sessions are shown, labelled Coming soon, and inert', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.goto('/dashboard/settings/security')
    await page.waitForLoadState('networkidle')

    // Scoped to the rows: the aside card explains both by name, so an unscoped
    // text match is ambiguous.
    const rowLabels = page.locator('.srow.is-soon .srow-label')
    await expect(rowLabels.filter({ hasText: 'Two-factor authentication' })).toBeVisible()
    await expect(rowLabels.filter({ hasText: 'Active sessions' })).toBeVisible()
    // Two rows, two chips — and neither row is a link or a button, so nothing
    // here can look active while doing nothing (user 2026-08-20).
    await expect(page.locator('.srow.is-soon')).toHaveCount(2)
    await expect(page.locator('.srow.is-soon a, .srow.is-soon button')).toHaveCount(0)
    await expect(page.locator('.srow.is-soon .soon-chip')).toHaveCount(2)
  })
})

test.describe('Security — Google accounts', () => {
  test('a Google account sees the google note instead of a password row', async ({ browser }) => {
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
    await page.goto('/dashboard/settings/security')

    // The password row is gated on `has_password`; a Google user has none.
    await expect(page.getByText(/signs in with Google/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('password-row')).toHaveCount(0)
    await expect(page.getByTestId('password-save')).toHaveCount(0)

    // And Personal details names the method rather than claiming a password.
    await page.goto('/dashboard/settings/profile')
    await expect(page.getByText('Google account')).toBeVisible()

    await ctx.close()
  })
})
