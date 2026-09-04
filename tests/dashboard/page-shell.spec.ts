/**
 * Analytics `/dashboard/analytics` shell — the GROWTH analytics surface.
 *
 * The nav redesign (2026-07-03) moved this surface off bare `/dashboard` back
 * onto its own route `/dashboard/analytics` (bare `/dashboard` now 307-redirects
 * to `/dashboard/learn`). The marker testids are UNCHANGED (`analytics-*` /
 * `hero-*` / `dashboard-*`); the visible heading reads "Analytics". This file
 * covers: the editorial HERO block (`analytics-hero`) whose net figure
 * (`hero-net`) and three hstat values (`hero-stat-income|-expenses|-savings`)
 * come from the day-precise `range_totals` (exact server sums), the four section
 * cards (cashflow / spending / rhythm / insights), and the shared period pill
 * (`dashboard-period-selector`).
 *
 * It also asserts the absence of the old dashboard-root cruft (Quick Actions
 * block + the two stat cards: Total Spaces / Transactions), plus the zero-space
 * empty state (`dashboard-empty-state`).
 */
import { test, expect } from '../../fixtures/index'
import { DashboardPage } from '../../pages/DashboardPage'
import { visibleNavLabels, navIsPhoneBar } from '../../helpers/nav'

const TODAY = new Date()

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** ISO for the current month at the given day. */
function thisMonth(day: number): string {
  return `${TODAY.getFullYear()}-${pad2(TODAY.getMonth() + 1)}-${pad2(day)}`
}

test.describe('Analytics shell (/dashboard/analytics)', () => {
  test('the analytics page renders the KPI hero + the four sections', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Hero Shell Home')

    // Seed one income + one expense in the current month so the hero shows
    // real, traceable numbers.
    await api.createExpense({
      space: hh.id,
      description: 'Salary',
      amount: 2000,
      type: 'income',
      expense_date: thisMonth(1),
    })
    await api.createExpense({
      space: hh.id,
      description: 'Rent',
      amount: 500,
      type: 'expense',
      expense_date: thisMonth(Math.min(TODAY.getDate(), 28)),
    })

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The page heading reads "Analytics".
    await expect(page.locator('.analytics-page h1')).toHaveText('Analytics')

    // HERO replaces the old KPI card row.
    await expect(page.getByTestId('analytics-hero')).toBeVisible()
    // Net figure = income − expenses = 2000 − 500 = 1,500 (compact, no decimals
    // ≥ 1000). The currency symbol prefixes it.
    await expect(page.getByTestId('hero-net')).toContainText('1,500')
    // The three hstat values.
    await expect(page.getByTestId('hero-stat-income')).toContainText('2,000')
    await expect(page.getByTestId('hero-stat-expenses')).toContainText('500')
    // Savings rate = (2000 − 500) / 2000 = 75%.
    await expect(page.getByTestId('hero-stat-savings')).toHaveText('75%')

    // The four sections: cashflow band + the three grid cards.
    await expect(page.getByTestId('analytics-section-cashflow')).toBeVisible()
    await expect(page.getByTestId('analytics-section-spending')).toBeVisible()
    await expect(page.getByTestId('analytics-section-rhythm')).toBeVisible()
    await expect(page.getByTestId('analytics-section-insights')).toBeVisible()

    // Context line + disabled Export survive on the analytics page.
    await expect(page.getByTestId('analytics-context-line')).toBeVisible()
    const exportBtn = page.getByTestId('export-report-btn')
    await expect(exportBtn).toBeVisible()
    await expect(exportBtn).toBeDisabled()
  })

  test('the analytics page header reads "Analytics"', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Analytics Header Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The visible header reads "Analytics".
    await expect(page.locator('.analytics-page h1')).toHaveText('Analytics')
  })

  test('hero delta pills appear with a prior period and are absent without one', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Hero Delta Home')

    // PREVIOUS month: income + expenses so previous_totals is non-zero.
    const prev = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 15)
    const prevIso = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}-${pad2(prev.getDate())}`
    await api.createExpense({
      space: hh.id,
      description: 'Prev salary',
      amount: 1000,
      type: 'income',
      expense_date: prevIso,
    })
    await api.createExpense({
      space: hh.id,
      description: 'Prev rent',
      amount: 700,
      type: 'expense',
      expense_date: prevIso,
    })
    // CURRENT month rows.
    await api.createExpense({
      space: hh.id,
      description: 'Cur salary',
      amount: 2000,
      type: 'income',
      expense_date: thisMonth(1),
    })
    await api.createExpense({
      space: hh.id,
      description: 'Cur rent',
      amount: 400,
      type: 'expense',
      expense_date: thisMonth(Math.min(TODAY.getDate(), 28)),
    })

    // "This month" preset → the prior calendar month feeds previous_totals, so
    // the hero shows delta pills next to the net figure and each hstat.
    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const hero = page.getByTestId('analytics-hero')
    await expect(hero).toBeVisible()
    await expect(hero.locator('.delta')).not.toHaveCount(0)
    const netPill = hero.locator('.hero-figure .delta')
    await expect(netPill).toBeVisible()

    // range=all has NO previous period → no delta pills anywhere in the hero.
    await page.goto(`/dashboard/analytics?space=${hh.id}&preset=all`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('analytics-hero')).toBeVisible()
    await expect(page.getByTestId('analytics-hero').locator('.delta')).toHaveCount(0)
  })

  test('the analytics page has no Quick Actions block and no stat-card grid', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('No Quick Actions Home')
    // Seed a couple of rows so the would-be Transactions stat card would have a
    // non-zero count to show, were it still present.
    await api.createExpense({ space: hh.id, description: 'QA-1', amount: 10, expense_date: thisMonth(1) })
    await api.createExpense({ space: hh.id, description: 'QA-2', amount: 20, expense_date: thisMonth(1) })

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The Quick Actions heading is gone (deleted, not relocated).
    await expect(page.getByText('Quick Actions', { exact: true })).toHaveCount(0)
    // The "Transactions count" stat card is gone.
    await expect(page.getByTestId('period-transactions-count')).toHaveCount(0)
    // The legacy `.stat-card` / `.stat-value` grid is gone from the page.
    await expect(page.locator('.stat-card')).toHaveCount(0)
  })

  test('a zero-space user sees the empty state with the two CTAs', async ({
    page,
    loggedInPage: _,
  }) => {
    // A fresh logged-in user has no spaces — they land on the empty state.
    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    const empty = page.getByTestId('dashboard-empty-state')
    await expect(empty).toBeVisible()

    // Create-a-space CTA → /dashboard/spaces.
    const createLink = empty.locator('a[href="/dashboard/spaces"]')
    await expect(createLink).toBeVisible()
    // Connect-a-bank CTA → /dashboard/settings/banking.
    const bankLink = empty.locator('a[href="/dashboard/settings/banking"]')
    await expect(bankLink).toBeVisible()

    // The KPI hero is NOT shown for a zero-space user.
    await expect(page.getByTestId('analytics-hero')).toHaveCount(0)
  })

  test('a user with a space sees the analytics surface, not the empty state', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Has Space Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('analytics-hero')).toBeVisible()
    await expect(page.getByTestId('dashboard-empty-state')).toHaveCount(0)
  })

  test('the shared period pill is mounted on the analytics page and drives ?preset', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Period Pill Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('dashboard-period-selector')).toBeVisible()
    // Default (no preset) → "this month".
    await expect(page.getByTestId('period-preset-month')).toHaveAttribute('aria-pressed', 'true')

    // Drive the 6M preset chip → URL gains ?preset=6m and the data reloads.
    await page.getByTestId('period-preset-6m').click()
    await page.waitForURL(/preset=6m/)
    expect(page.url()).toContain('preset=6m')
    // The active ?space= scope survives the preset switch — the pill must never
    // drop the scope.
    expect(page.url()).toContain(`space=${hh.id}`)
    await expect(page.getByTestId('period-preset-6m')).toHaveAttribute('aria-pressed', 'true')
  })

  test('empty space renders empty states without crashing', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Empty Home')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.analytics-page h1')).toHaveText('Analytics')
    // Hero still renders (no prior period, no delta pills, net "—" or 0).
    await expect(page.getByTestId('analytics-hero')).toBeVisible()
    // All four section cards render.
    await expect(page.getByTestId('analytics-section-cashflow')).toBeVisible()
    await expect(page.getByTestId('analytics-section-spending')).toBeVisible()
    await expect(page.getByTestId('analytics-section-rhythm')).toBeVisible()
    await expect(page.getByTestId('analytics-section-insights')).toBeVisible()

    expect(errors).toEqual([])
  })

  test('non-member space renders cleanly without crashing', async ({ page, twoActors, context }) => {
    const { userA, apiA, apiB } = twoActors

    // A owns a space too — so she has a valid viewer context.
    await apiA.createSpace('A Space')

    // B owns a space that A is not a member of.
    const hhB = await apiB.createSpace('B Space')

    // Log A into the browser context.
    const cookiesA = await apiA.cookies()
    await context.clearCookies()
    await context.addCookies(cookiesA)
    void userA // silence unused

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Force-feed B's space id while logged in as A. `resolveActiveSpaces`
    // strips the unknown id from the URL and 302s back to /dashboard/analytics,
    // where A's own spaces are used. The page renders normally — no crash.
    await page.goto(`/dashboard/analytics?space=${hhB.id}`)
    await page.waitForLoadState('networkidle')

    // Page heading still rendered.
    await expect(page.locator('.analytics-page h1')).toHaveText('Analytics')

    // Acceptable outcomes (any of):
    //   1. The unknown id was stripped from the URL (redirect path).
    //   2. The unknown id survived and each analytics section shows an error
    //      placeholder (legacy 403-pass-through path).
    const stillOnOther = page.url().includes(`space=${hhB.id}`)
    if (stillOnOther) {
      const errorPlaceholders = page.getByTestId('analytics-section-error')
      expect(await errorPlaceholders.count()).toBeGreaterThan(0)
    }

    expect(errors).toEqual([])
  })
})

test.describe('Sidebar nav', () => {
  // Both surfaces are asserted at EXPLICIT widths rather than at whatever the
  // project happens to run at. Branching on the project would have parked the
  // user's frozen-phone contract on `mobile-safari` alone — the one project a
  // known WebKit network-process wedge takes down as a block, which would leave
  // the constraint unverified while two green projects reported success.
  test('the rail shows one world at a time; the phone bar keeps all five tabs', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createSpace('Nav Home')

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/dashboard/learn')
    await page.waitForLoadState('networkidle')

    const nav = page.locator('.nav-menu')
    // No "Today" or "Dashboard" nav link exists anymore, in any world.
    await expect(nav.locator('a', { hasText: 'Today' })).toHaveCount(0)
    await expect(nav.locator('a', { hasText: 'Dashboard' })).toHaveCount(0)
    // All five rows are rendered in every state; only their visibility differs.
    await expect(nav.locator('li')).toHaveCount(5)

    // Desktop, Learn world: the map row (printed "Map") and Settings, nothing else.
    expect(await navIsPhoneBar(page)).toBe(false)
    await expect(page.getByTestId('world-switch')).toBeVisible()
    expect(await visibleNavLabels(page)).toEqual(['Map', 'Settings'])

    // Desktop, Money world: the three money rows and Settings, no Learn row.
    await page.goto('/dashboard/transactions')
    await page.waitForLoadState('networkidle')
    expect(await visibleNavLabels(page)).toEqual([
      'Analytics',
      'Spaces',
      'Transactions',
      'Settings',
    ])

    // FROZEN (user 2026-09-04, verbatim: "mobile version must stay as it is we
    // dont change it and work only with desktop now"): the phone shows the same
    // five tabs it always did, Learn first and under its own name, never the
    // world switch, and never the world filter.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard/learn')
    await page.waitForLoadState('networkidle')

    expect(await navIsPhoneBar(page)).toBe(true)
    await expect(page.getByTestId('world-switch')).toBeHidden()
    expect(await visibleNavLabels(page)).toEqual([
      'Learn',
      'Analytics',
      'Spaces',
      'Transactions',
      'Settings',
    ])

    // …on ONE row. Five equal cells that WRAP still pass the equal-width and
    // full-bleed checks in no-horizontal-overflow.spec.ts, so a four-column
    // grid would only fail collaterally, in a spec about something else.
    const tabTops = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.nav-menu .nav-link')).map((a) =>
        Math.round(a.getBoundingClientRect().top),
      ),
    )
    expect(new Set(tabTops).size, `tab bar wrapped onto more than one row: ${tabTops}`).toBe(1)
  })

  test('the Analytics nav link preserves ?space after a client-side switch', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const a = await api.createSpace('Switch A')
    const b = await api.createSpace('Switch B')

    // One full load, then ONLY client-side navigations: SvelteKit intercepts
    // same-origin <a> clicks, so the sidebar hrefs stay correct only if
    // `$: navHref` is reactive (gotcha #34). A plain-function `navHref` would
    // keep serving the stale closed-over ?space= — which full-page `goto()`s
    // (fresh component init every time) can never catch.
    await page.goto('/dashboard/spaces')
    await page.waitForLoadState('networkidle')

    const analyticsLink = page.locator('.nav-menu a', { hasText: 'Analytics' })

    // Client-side drill into space A (card title → /dashboard/analytics?space=A).
    await page.locator(`.space-card[data-space-id="${a.id}"] a.space-title`).click()
    await page.waitForURL(new RegExp(`/dashboard/analytics\\?space=${a.id}`))
    await expect(analyticsLink).toHaveAttribute('href', new RegExp(`space=${a.id}`))

    // Client-side back to Spaces, then drill into space B — the link must
    // re-point to B, not keep A's stale value.
    await page.locator('.nav-menu a', { hasText: 'Spaces' }).click()
    await page.waitForURL(/\/dashboard\/spaces/)
    await page.locator(`.space-card[data-space-id="${b.id}"] a.space-title`).click()
    await page.waitForURL(new RegExp(`/dashboard/analytics\\?space=${b.id}`))
    await expect(analyticsLink).toHaveAttribute('href', new RegExp(`space=${b.id}`))
  })
})

test.describe('World switch (Money / Learn)', () => {
  test('the switch marks the world the route is in and moves the rail both ways', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage // the fixture authenticates; this test needs no seeded data

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/dashboard/analytics')
    await page.waitForLoadState('networkidle')

    const money = page.getByTestId('world-money')
    const learn = page.getByTestId('world-learn')

    // The world is derived from the path, so both halves are plain links. The
    // marked one is `aria-current="true"` — current within this set — and NOT
    // `page`, which would claim the href IS the page you are on. It is not:
    // Money points at /dashboard/analytics from every money route.
    await expect(money).toHaveAttribute('href', /\/dashboard\/analytics/)
    await expect(learn).toHaveAttribute('href', /\/dashboard\/learn/)
    await expect(money).toHaveAttribute('aria-current', 'true')
    await expect(learn).not.toHaveAttribute('aria-current', 'true')

    // Client-side into Learn — the marked half and the rail follow together.
    await learn.click()
    await page.waitForURL(/\/dashboard\/learn/)
    await expect(learn).toHaveAttribute('aria-current', 'true')
    await expect(money).not.toHaveAttribute('aria-current', 'true')
    expect(await visibleNavLabels(page)).toEqual(['Map', 'Settings'])

    // …and back, client-side again: a rail stuck in the world it just left
    // would survive a test that only ever travels one way.
    await money.click()
    await page.waitForURL(/\/dashboard\/analytics/)
    await expect(money).toHaveAttribute('aria-current', 'true')
    expect(await visibleNavLabels(page)).toEqual([
      'Analytics',
      'Spaces',
      'Transactions',
      'Settings',
    ])

    // The phone never renders the switch; its tab bar is the navigation there.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByTestId('world-switch')).toBeHidden()
  })
})
