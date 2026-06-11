/**
 * Legacy `/dashboard/analytics` redirect (Phase 17, Story 17.2).
 *
 * After the merge the analytics surface IS the main `/dashboard`. The old
 * `/dashboard/analytics` route must not 404 — its `+page.server.ts` throws a
 * 307 to `/dashboard` with the query string byte-preserved, so bookmarks and the
 * old sidebar link keep working. Modeled on the `/dashboard/expenses` →
 * `/dashboard/transactions` redirect test (expenses/crud.spec.ts).
 *
 * The redirect runs server-side AFTER the auth hook, so an unauthenticated hit
 * still bounces to /login first.
 */
import { test, expect } from '../../fixtures/index'

test.describe('Legacy /dashboard/analytics redirect', () => {
  test('redirects to /dashboard preserving the query string', async ({
    page,
    loggedInPage: _,
  }) => {
    await page.goto('/dashboard/analytics?preset=3m&source=bank')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/dashboard?preset=3m&source=bank')
  })

  test('bare /dashboard/analytics redirects to /dashboard', async ({
    page,
    loggedInPage: _,
  }) => {
    await page.goto('/dashboard/analytics')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/dashboard')
  })

  test('unauthenticated /dashboard/analytics still bounces to /login', async ({ page }) => {
    // No session — the auth hook precedes the route load, so the user lands on
    // /login, not /dashboard.
    await page.goto('/dashboard/analytics')
    await expect(page).toHaveURL('/login')
  })
})
