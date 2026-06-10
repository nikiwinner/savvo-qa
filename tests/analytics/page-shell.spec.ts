/**
 * `/dashboard/analytics` page shell + period control (GROWTH redesign).
 *
 * The KPI card row was replaced by an editorial HERO block (testid
 * `analytics-hero`) whose net figure (`hero-net`) and three hstat values
 * (`hero-stat-income` / `-expenses` / `-savings`) come from the day-precise
 * `range_totals` (exact server sums). Delta pills appear only when a previous
 * period exists; with no prior data they're absent. The supporting columns are
 * three equal-height cards: "Where it went" (spending), "Six-month rhythm"
 * (`analytics-section-rhythm`), and "Smart insights".
 *
 * The page mounts the SAME shared period pill the dashboard/transactions use
 * (container `dashboard-period-selector`, preset chips `period-preset-*`,
 * custom range `period-custom-*`). The range is driven by `?preset=` or
 * `?preset=custom&date_from&date_to`. The context line + disabled Export are
 * unchanged from the prior shell.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date()

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** ISO for the current month at the given day. */
function thisMonth(day: number): string {
  return `${TODAY.getFullYear()}-${pad2(TODAY.getMonth() + 1)}-${pad2(day)}`
}

/** Last day of the current month, ISO. */
function lastOfThisMonth(): string {
  return iso(new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0))
}

test.describe('Analytics page shell (GROWTH)', () => {
  test('analytics link in sidebar navigates to the page', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Analytics Home')

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const analyticsLink = page.locator('.nav-menu a', { hasText: 'Analytics' })
    await expect(analyticsLink).toBeVisible()
    await analyticsLink.click()

    await page.waitForURL(/\/dashboard\/analytics(\?|$)/)
    // The redirect normalises ?space=<id> into the URL.
    expect(page.url()).toContain(`space=${hh.id}`)
    await expect(page.locator('.analytics-page h1')).toHaveText('Analytics')
    // The shared period pill is mounted.
    await expect(page.getByTestId('dashboard-period-selector')).toBeVisible()
  })

  test('hero + section cards render (hero replaces the KPI row)', async ({ page, loggedInPage }) => {
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

    // Context line + disabled export are unchanged.
    await expect(page.getByTestId('analytics-context-line')).toBeVisible()
    const exportBtn = page.getByTestId('export-report-btn')
    await expect(exportBtn).toBeVisible()
    await expect(exportBtn).toBeDisabled()
  })

  test('hero delta pills appear with a prior period and are absent without one', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Hero Delta Home')

    // PREVIOUS month: income + expenses so previous_totals is non-zero.
    const prev = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 15)
    await api.createExpense({
      space: hh.id,
      description: 'Prev salary',
      amount: 1000,
      type: 'income',
      expense_date: iso(prev),
    })
    await api.createExpense({
      space: hh.id,
      description: 'Prev rent',
      amount: 700,
      type: 'expense',
      expense_date: iso(prev),
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
    // At least one delta pill is present (net, income, expenses, savings).
    await expect(hero.locator('.delta')).not.toHaveCount(0)
    // The net delta pill sits next to the net figure inside the hero figure row.
    const netPill = hero.locator('.hero-figure .delta')
    await expect(netPill).toBeVisible()

    // range=all has NO previous period → no delta pills anywhere in the hero.
    await page.goto(`/dashboard/analytics?space=${hh.id}&preset=all`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('analytics-hero')).toBeVisible()
    await expect(page.getByTestId('analytics-hero').locator('.delta')).toHaveCount(0)
  })

  test('changing the period (preset chip) updates the URL and reloads the page data', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Period Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Default (no preset) → "this month" → a short window, so the cashflow band
    // renders DAY buckets (granularity=day), CLIPPED at today.
    await expect(page.getByTestId('period-preset-month')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('cashflow-trend')).toHaveAttribute('data-granularity', 'day')
    await expect(page.getByTestId('cashflow-trend-day-count')).toHaveText(String(TODAY.getDate()))

    // Drive the 6M preset chip → URL gains ?preset=6m AND the data reloads (the
    // cashflow band now spans six months).
    await page.getByTestId('period-preset-6m').click()
    await page.waitForURL(/preset=6m/)
    expect(page.url()).toContain('preset=6m')
    expect(page.url()).toContain(`space=${hh.id}`)

    // Page heading still rendered — server data round-trip completed cleanly.
    await expect(page.locator('.analytics-page h1')).toHaveText('Analytics')
    await expect(page.getByTestId('dashboard-period-selector')).toBeVisible()
    await expect(page.getByTestId('period-preset-6m')).toHaveAttribute('aria-pressed', 'true')
    // The reload widened the cashflow window from one month (daily buckets) to
    // 6 months (month buckets) — observable proof the period change re-fetched.
    await expect(page.getByTestId('cashflow-trend')).toHaveAttribute('data-granularity', 'month')
    await expect(page.getByTestId('cashflow-trend-month-count')).toHaveText('6')
  })

  test('the trend window is user-controllable via a custom range and reflected in the band', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Window Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // A 3-calendar-month custom range (the prior two months + this month) must
    // produce a 3-bucket band.
    const start = new Date(TODAY.getFullYear(), TODAY.getMonth() - 2, 1)
    const dateFrom = iso(start)
    const dateTo = lastOfThisMonth()

    await page.goto(
      `/dashboard/analytics?space=${hh.id}&preset=custom&date_from=${dateFrom}&date_to=${dateTo}`,
    )
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('preset=custom')
    expect(page.url()).toContain(`date_from=${dateFrom}`)
    expect(page.url()).toContain(`date_to=${dateTo}`)
    expect(page.url()).toContain(`space=${hh.id}`)
    await expect(page.getByTestId('period-preset-custom')).toHaveAttribute('aria-pressed', 'true')

    // The cashflow band spans exactly three calendar months.
    await expect(page.getByTestId('cashflow-trend-month-count')).toHaveText('3')

    // The four sections still render — no crash on rerender.
    await expect(page.getByTestId('analytics-section-cashflow')).toBeVisible()
    await expect(page.getByTestId('analytics-section-spending')).toBeVisible()
    await expect(page.getByTestId('analytics-section-rhythm')).toBeVisible()
    await expect(page.getByTestId('analytics-section-insights')).toBeVisible()
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
