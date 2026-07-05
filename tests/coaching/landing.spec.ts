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
    // Cold-start of the single-threaded QA server + Vite SSR compile of the
    // /dashboard/learn route can push the login→me→learn redirect chain past the
    // default 30s TEST budget under concentrated parallel load. Triple it (→90s)
    // so the explicit 30s URL wait below can actually run to completion instead
    // of being cut short by the test wrapper. No assertion is weakened.
    test.slow()
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
    // Cold-start latency headroom (see the email-login test above).
    test.slow()
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
    appTest.slow() // cold-start latency headroom (see the email-login test)
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
    appTest.slow() // cold-start latency headroom (see the email-login test)
    const { api } = loggedInPage
    await api.createSpace('Nav Home')

    await page.goto('/dashboard/learn')

    // Wait on the actual element under assertion (the rendered sidebar), NOT
    // `networkidle`: the learn page runs SSR polling that can keep the network
    // busy indefinitely, so networkidle burns its full default timeout and
    // times out under cold-start load. A concrete visibility wait is honest and
    // fast, and doesn't weaken the assertions below.
    const navLinks = page.locator('.nav-menu a')
    const first = navLinks.first()
    await expect(first).toBeVisible({ timeout: 30_000 })
    // First nav item is Learn → /dashboard/learn.
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
    appTest.slow() // cold-start latency headroom (see the email-login test)
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
