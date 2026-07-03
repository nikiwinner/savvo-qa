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
  test('the sidebar has Learn / Analytics / Spaces / Transactions / Settings', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createSpace('Nav Home')

    await page.goto('/dashboard/learn')
    await page.waitForLoadState('networkidle')

    // The five nav items are present (match by visible label inside the menu).
    const nav = page.locator('.nav-menu')
    await expect(nav.locator('a', { hasText: 'Learn' })).toBeVisible()
    await expect(nav.locator('a', { hasText: 'Analytics' })).toBeVisible()
    await expect(nav.locator('a', { hasText: 'Spaces' })).toBeVisible()
    await expect(nav.locator('a', { hasText: 'Transactions' })).toBeVisible()
    await expect(nav.locator('a', { hasText: 'Settings' })).toBeVisible()

    // No "Today" or "Dashboard" nav link exists anymore.
    await expect(nav.locator('a', { hasText: 'Today' })).toHaveCount(0)
    await expect(nav.locator('a', { hasText: 'Dashboard' })).toHaveCount(0)
    // Exactly five items in the menu (Learn first).
    await expect(nav.locator('a')).toHaveCount(5)
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
