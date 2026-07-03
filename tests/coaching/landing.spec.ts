/**
 * Coaching — Landing + sidebar
 *
 * The post-auth landing contract: every post-auth entry lands on
 * `/dashboard/learn` (the Money Mastery unit-map). Bare `/dashboard` and the
 * legacy `/dashboard/today` both 307-redirect to `/dashboard/learn`. The sidebar
 * has Learn as its FIRST item (Analytics / Spaces / Transactions / Settings
 * follow). Unauth `/dashboard/learn` bounces to `/login`. The Learn nav link
 * preserves `?space=` after a client-side space selection (the `$: navHref`
 * reactive guard, gotcha #34).
 */
import { test, expect } from '@playwright/test'
import { test as appTest } from '../../fixtures/index'
import { uniqueUser, ApiHelper } from '../../helpers/api'
import { LoginPage } from '../../pages/LoginPage'
import { SignupPage } from '../../pages/SignupPage'

test.describe('Coaching — landing', () => {
  test('email login lands on /dashboard/learn', async ({ page, playwright }) => {
    const user = uniqueUser('coach-login')
    const reqCtx = await playwright.request.newContext()
    const api = new ApiHelper(reqCtx)
    await api.signup(user)
    await reqCtx.dispose()

    const login = new LoginPage(page)
    await login.goto()
    await login.login(user.email, user.password)

    // Cold-start + parallel-load latency on the single-threaded QA dev server —
    // the post-login redirect chain (login → me → learn loader) can take well
    // over 15s under the suite's parallel load. Generous ceiling.
    await expect(page).toHaveURL('/dashboard/learn', { timeout: 30_000 })
  })

  test('signup lands on /dashboard/learn', async ({ page }) => {
    const user = uniqueUser('coach-signup')

    const signup = new SignupPage(page)
    await signup.goto()
    await signup.signup(user.name, user.email, user.password, user.password)

    await expect(page).toHaveURL('/dashboard/learn', { timeout: 30_000 })
  })

  test('unauthenticated /dashboard/learn bounces to /login', async ({ page }) => {
    await page.goto('/dashboard/learn')
    await expect(page).toHaveURL('/login')
  })
})

appTest.describe('Coaching — authed marketing root', () => {
  // The 5th post-auth entry point: an already authenticated user hitting the
  // marketing root `/` must land on Learn like every other entry, not on the
  // analytics surface.
  appTest('an authenticated user on / is redirected to /dashboard/learn', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage // fixture authenticates the page's context via API
    await page.goto('/')
    await expect(page).toHaveURL('/dashboard/learn', { timeout: 30_000 })
  })
})

appTest.describe('Coaching — sidebar', () => {
  appTest("the sidebar's first item is Learn, then Analytics / Spaces / Transactions / Settings", async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createSpace('Nav Home')

    await page.goto('/dashboard/learn')
    await page.waitForLoadState('networkidle')

    const navLinks = page.locator('.nav-menu a')
    // First nav item is Learn → /dashboard/learn.
    const first = navLinks.first()
    await expect(first).toContainText('Learn')
    await expect(first).toHaveAttribute('href', /\/dashboard\/learn/)

    // Analytics is the SECOND item.
    const second = navLinks.nth(1)
    await expect(second).toContainText('Analytics')
    await expect(second).toHaveAttribute('href', /\/dashboard\/analytics/)

    // The full order is Learn / Analytics / Spaces / Transactions / Settings.
    await expect(navLinks.nth(2)).toContainText('Spaces')
    await expect(navLinks.nth(3)).toContainText('Transactions')
    await expect(navLinks.nth(4)).toContainText('Settings')
    await expect(navLinks).toHaveCount(5)
  })

  appTest('the Learn nav link preserves ?space after a client-side switch', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const a = await api.createSpace('Learn Switch A')
    const b = await api.createSpace('Learn Switch B')

    // One full load, then ONLY client-side navigations — the Learn href stays
    // correct only if `$: navHref` is reactive (gotcha #34); a plain-function
    // navHref would keep serving the stale closed-over ?space=.
    await page.goto('/dashboard/spaces')
    // Wait for the two seeded cards (deterministic) rather than `networkidle` —
    // the spaces page fires per-card summary fetches that keep the network busy
    // under parallel load, so networkidle can exceed the default timeout.
    await expect(page.locator(`.space-card[data-space-id="${a.id}"]`)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(`.space-card[data-space-id="${b.id}"]`)).toBeVisible()

    const learnLink = page.locator('.nav-menu a', { hasText: 'Learn' })

    // Client-side drill into space A (card title → /dashboard/analytics?space=A).
    await page.locator(`.space-card[data-space-id="${a.id}"] a.space-title`).click()
    await page.waitForURL(new RegExp(`/dashboard/analytics\\?space=${a.id}`))
    await expect(learnLink).toHaveAttribute('href', new RegExp(`space=${a.id}`))

    // Client-side back to Spaces, drill into B — the Learn link re-points to B.
    await page.locator('.nav-menu a', { hasText: 'Spaces' }).click()
    await page.waitForURL(/\/dashboard\/spaces/)
    await page.locator(`.space-card[data-space-id="${b.id}"] a.space-title`).click()
    await page.waitForURL(new RegExp(`/dashboard/analytics\\?space=${b.id}`))
    await expect(learnLink).toHaveAttribute('href', new RegExp(`space=${b.id}`))
  })
})
