/**
 * Coaching — Landing + sidebar
 *
 * The post-auth landing contract: every post-auth entry lands on
 * `/dashboard/learn` (the Money Mastery unit-map). Bare `/dashboard` and the
 * legacy `/dashboard/today` both 307-redirect to `/dashboard/learn`. The sidebar
 * carries two worlds behind a `Money · Learn` switch, so its FIRST item depends
 * on where you are: on the desktop rail the Learn world shows the map row and
 * Settings, the Money world the three money rows and Settings, while the phone
 * tab bar keeps all five with Learn first. Unauth `/dashboard/learn` bounces to
 * `/login`. The switch's Learn link preserves `?space=` after a client-side
 * space selection (the `$: navHref` reactive guard, gotcha #34).
 */
import { test, expect } from '@playwright/test'
import { test as appTest } from '../../fixtures/index'
import { uniqueUser, ApiHelper } from '../../helpers/api'
import { LoginPage } from '../../pages/LoginPage'
import { SignupPage } from '../../pages/SignupPage'
import { visibleNavLabels, navIsPhoneBar } from '../../helpers/nav'

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
  appTest('the rail leads with the world you are in, and the phone bar leads with Learn', async ({
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
    // fast, and doesn't weaken the assertions below. Playwright counts an
    // `opacity: 0` element as visible, so the rail's staggered entrance cannot
    // race this.
    const navLinks = page.locator('.nav-menu a')
    await expect(navLinks.first()).toBeVisible({ timeout: 30_000 })

    // The DOM order never changes — it is the phone's order, and the desktop
    // filter only hides rows. Learn / Analytics / Spaces / Transactions / Settings.
    await expect(navLinks).toHaveCount(5)
    await expect(navLinks.first()).toHaveAttribute('href', /\/dashboard\/learn/)
    await expect(navLinks.nth(1)).toHaveAttribute('href', /\/dashboard\/analytics/)
    await expect(navLinks.nth(2)).toHaveAttribute('href', /\/dashboard\/spaces/)
    await expect(navLinks.nth(3)).toHaveAttribute('href', /\/dashboard\/transactions/)
    await expect(navLinks.nth(4)).toHaveAttribute('href', /\/dashboard\/settings/)

    // What is SHOWN depends on which nav the CSS built, read off the component's
    // own `position: fixed` rather than a re-typed breakpoint.
    expect(await visibleNavLabels(page)).toEqual(
      (await navIsPhoneBar(page))
        ? ['Learn', 'Analytics', 'Spaces', 'Transactions', 'Settings']
        : ['Map', 'Settings'],
    )
  })

  appTest('the world switch Learn link preserves ?space after a client-side switch', async ({
    page,
    loggedInPage,
  }) => {
    appTest.slow() // cold-start latency headroom (see the email-login test)
    const { api } = loggedInPage
    const a = await api.createSpace('Learn Switch A')
    const b = await api.createSpace('Learn Switch B')

    // One full load, then ONLY client-side navigations — the Learn href stays
    // correct only if `$: navHref` is reactive (gotcha #34); a plain-function
    // navHref would keep serving the stale closed-over ?space=. The link moved
    // into the world switch, and the trap moved with it. Asserted on the
    // attribute, not on a click, so the phone (where the switch is hidden but
    // the same reactive href feeds the tab bar) is covered by the same test.
    await page.goto('/dashboard/spaces')
    // Wait for the two seeded cards (deterministic) rather than `networkidle` —
    // the spaces page fires per-card summary fetches that keep the network busy
    // under parallel load, so networkidle can exceed the default timeout.
    await expect(page.locator(`.space-card[data-space-id="${a.id}"]`)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(`.space-card[data-space-id="${b.id}"]`)).toBeVisible()

    // All three reactive call sites, not just the new one: the switch's Learn
    // half, the switch's Money half, and the nav ROW — which is the ONLY Learn
    // navigation on a phone, where the switch is `display: none`.
    const learnLink = page.getByTestId('world-learn')
    const moneyLink = page.getByTestId('world-money')
    const learnRow = page.locator('.nav-menu li[data-world="learn"] a')

    // Client-side drill into space A (card title → /dashboard/analytics?space=A).
    await page.locator(`.space-card[data-space-id="${a.id}"] a.space-title`).click()
    await page.waitForURL(new RegExp(`/dashboard/analytics\\?space=${a.id}`))
    await expect(learnLink).toHaveAttribute('href', new RegExp(`space=${a.id}`))
    await expect(moneyLink).toHaveAttribute('href', new RegExp(`space=${a.id}`))
    await expect(learnRow).toHaveAttribute('href', new RegExp(`space=${a.id}`))

    // Client-side back to Spaces, drill into B — every one of them re-points to B.
    await page.locator('.nav-menu a', { hasText: 'Spaces' }).click()
    await page.waitForURL(/\/dashboard\/spaces/)
    await page.locator(`.space-card[data-space-id="${b.id}"] a.space-title`).click()
    await page.waitForURL(new RegExp(`/dashboard/analytics\\?space=${b.id}`))
    await expect(learnLink).toHaveAttribute('href', new RegExp(`space=${b.id}`))
    await expect(moneyLink).toHaveAttribute('href', new RegExp(`space=${b.id}`))
    await expect(learnRow).toHaveAttribute('href', new RegExp(`space=${b.id}`))
  })
})
