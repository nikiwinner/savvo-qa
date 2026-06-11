/**
 * Main `/dashboard` shell — the GROWTH analytics surface, merged in as the
 * application's main dashboard (Phase 17, Stories 17.1 / 17.4 / 17.5 / 17.6).
 *
 * This file FOLDS IN the old `analytics/page-shell.spec.ts` coverage, re-pointed
 * to `/dashboard`: the editorial HERO block (`analytics-hero`) whose net figure
 * (`hero-net`) and three hstat values (`hero-stat-income|-expenses|-savings`)
 * come from the day-precise `range_totals` (exact server sums), the four section
 * cards (cashflow / spending / rhythm / insights), and the shared period pill
 * (`dashboard-period-selector`). The marker testids stay `analytics-*` (Phase 17
 * kept them to avoid a needless QA-contract churn); only the visible copy reads
 * "Dashboard".
 *
 * Phase 17 also DELETED the old dashboard root (Quick Actions block + the two
 * stat cards: Total Spaces / Transactions) and DROPPED the sidebar "Analytics"
 * nav item, so this file asserts their absence too, plus the zero-space empty
 * state (`dashboard-empty-state`).
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

test.describe('Dashboard shell (merged analytics surface)', () => {
  test('the main /dashboard renders the KPI hero + the four sections', async ({
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

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The page heading reads "Dashboard" (was "Analytics" pre-merge).
    await expect(page.locator('.analytics-page h1')).toHaveText('Dashboard')

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

    // Context line + disabled Export survive the merge (ported from the old
    // analytics/page-shell coverage — both still ship on the merged page).
    await expect(page.getByTestId('analytics-context-line')).toBeVisible()
    const exportBtn = page.getByTestId('export-report-btn')
    await expect(exportBtn).toBeVisible()
    await expect(exportBtn).toBeDisabled()
  })

  test('the dashboard shows no "Analytics" copy', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('No Analytics Copy Home')

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The visible header reads "Dashboard" — not "Analytics".
    await expect(page.locator('.analytics-page h1')).toHaveText('Dashboard')
    // No element text equals "Analytics" anywhere on the page.
    await expect(page.getByText('Analytics', { exact: true })).toHaveCount(0)
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
    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const hero = page.getByTestId('analytics-hero')
    await expect(hero).toBeVisible()
    await expect(hero.locator('.delta')).not.toHaveCount(0)
    const netPill = hero.locator('.hero-figure .delta')
    await expect(netPill).toBeVisible()

    // range=all has NO previous period → no delta pills anywhere in the hero.
    await page.goto(`/dashboard?space=${hh.id}&preset=all`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('analytics-hero')).toBeVisible()
    await expect(page.getByTestId('analytics-hero').locator('.delta')).toHaveCount(0)
  })

  test('the dashboard has no Quick Actions block and no stat-card grid', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('No Quick Actions Home')
    // Seed a couple of rows so the would-be Transactions stat card would have a
    // non-zero count to show, were it still present.
    await api.createExpense({ space: hh.id, description: 'QA-1', amount: 10, expense_date: thisMonth(1) })
    await api.createExpense({ space: hh.id, description: 'QA-2', amount: 20, expense_date: thisMonth(1) })

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The Quick Actions heading is gone (deleted, not relocated — Story 17.4).
    await expect(page.getByText('Quick Actions', { exact: true })).toHaveCount(0)
    // The "Transactions count" stat card is gone.
    await expect(page.getByTestId('period-transactions-count')).toHaveCount(0)
    // The legacy `.stat-card` / `.stat-value` grid is gone from the dashboard.
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

  test('a user with a space sees the dashboard, not the empty state', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Has Space Home')

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('analytics-hero')).toBeVisible()
    await expect(page.getByTestId('dashboard-empty-state')).toHaveCount(0)
  })

  test('the shared period pill is mounted on the dashboard and drives ?preset', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Period Pill Home')

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('dashboard-period-selector')).toBeVisible()
    // Default (no preset) → "this month".
    await expect(page.getByTestId('period-preset-month')).toHaveAttribute('aria-pressed', 'true')

    // Drive the 6M preset chip → URL gains ?preset=6m and the data reloads.
    await page.getByTestId('period-preset-6m').click()
    await page.waitForURL(/preset=6m/)
    expect(page.url()).toContain('preset=6m')
    // The active ?space= scope survives the preset switch (ported from the old
    // analytics/page-shell coverage — the pill must never drop the scope).
    expect(page.url()).toContain(`space=${hh.id}`)
    await expect(page.getByTestId('period-preset-6m')).toHaveAttribute('aria-pressed', 'true')
  })

  test('empty space renders empty states without crashing', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Empty Home')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.analytics-page h1')).toHaveText('Dashboard')
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
    // strips the unknown id from the URL and 302s back to /dashboard, where A's
    // own spaces are used. The page renders normally — no crash.
    await page.goto(`/dashboard?space=${hhB.id}`)
    await page.waitForLoadState('networkidle')

    // Page heading still rendered.
    await expect(page.locator('.analytics-page h1')).toHaveText('Dashboard')

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

test.describe('Dashboard sidebar (post-merge nav)', () => {
  test('the sidebar has Dashboard / Spaces / Transactions / Settings and no Analytics', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createSpace('Nav Home')

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // The four nav items are present (match by visible label inside the menu).
    const nav = page.locator('.nav-menu')
    await expect(nav.locator('a', { hasText: 'Dashboard' })).toBeVisible()
    await expect(nav.locator('a', { hasText: 'Spaces' })).toBeVisible()
    await expect(nav.locator('a', { hasText: 'Transactions' })).toBeVisible()
    await expect(nav.locator('a', { hasText: 'Settings' })).toBeVisible()

    // No "Analytics" nav link exists anymore (the surface IS the dashboard).
    await expect(nav.locator('a', { hasText: 'Analytics' })).toHaveCount(0)
    // Exactly four items in the menu.
    await expect(nav.locator('a')).toHaveCount(4)
  })

  test('the Dashboard nav link preserves ?space after a client-side switch', async ({
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

    const dashLink = page.locator('.nav-menu a', { hasText: 'Dashboard' })

    // Client-side drill-down into space A (card title → /dashboard?space=A).
    await page.locator(`.space-card[data-space-id="${a.id}"] a.space-title`).click()
    await page.waitForURL(new RegExp(`/dashboard\\?space=${a.id}`))
    await expect(dashLink).toHaveAttribute('href', new RegExp(`space=${a.id}`))

    // Client-side back to Spaces, then drill into space B — the link must
    // re-point to B, not keep A's stale value.
    await page.locator('.nav-menu a', { hasText: 'Spaces' }).click()
    await page.waitForURL(/\/dashboard\/spaces/)
    await page.locator(`.space-card[data-space-id="${b.id}"] a.space-title`).click()
    await page.waitForURL(new RegExp(`/dashboard\\?space=${b.id}`))
    await expect(dashLink).toHaveAttribute('href', new RegExp(`space=${b.id}`))
  })
})
