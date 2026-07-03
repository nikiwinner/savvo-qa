/**
 * Dashboard root + legacy `/dashboard/today` redirects (nav redesign 2026-07-03).
 *
 * The analytics surface now lives at its own `/dashboard/analytics` route (a real
 * page, no longer a redirect stub). Bare `/dashboard` and the legacy
 * `/dashboard/today` both throw a 307 to `/dashboard/learn` (the Money Mastery
 * unit-map = the post-auth landing), preserving the query string byte-for-byte,
 * so bookmarks and old links keep working. Modeled on the `/dashboard/expenses`
 * → `/dashboard/transactions` redirect test.
 *
 * The redirects run server-side AFTER the auth hook, so an unauthenticated hit
 * still bounces to /login first.
 */
import { test, expect } from '../../fixtures/index'

test.describe('Dashboard root redirect', () => {
  test('bare /dashboard redirects to /dashboard/learn', async ({
    page,
    loggedInPage: _,
  }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/dashboard/learn')
  })

  test('/dashboard redirects to /dashboard/learn preserving the query string', async ({
    page,
    loggedInPage: _,
  }) => {
    await page.goto('/dashboard?space=5&preset=3m')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/dashboard/learn?space=5&preset=3m')
  })

  test('unauthenticated /dashboard still bounces to /login', async ({ page }) => {
    // No session — the auth hook precedes the route load, so the user lands on
    // /login, not on the learn map.
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })
})

test.describe('Legacy /dashboard/today redirect', () => {
  test('bare /dashboard/today redirects to /dashboard/learn', async ({
    page,
    loggedInPage: _,
  }) => {
    await page.goto('/dashboard/today')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/dashboard/learn')
  })

  test('/dashboard/today redirects to /dashboard/learn preserving the query string', async ({
    page,
    loggedInPage: _,
  }) => {
    await page.goto('/dashboard/today?space=7&foo=bar')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/dashboard/learn?space=7&foo=bar')
  })

  test('unauthenticated /dashboard/today still bounces to /login', async ({ page }) => {
    await page.goto('/dashboard/today')
    await expect(page).toHaveURL('/login')
  })
})
