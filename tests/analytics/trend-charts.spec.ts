/**
 * Cashflow band — ONE visual language for every period (GROWTH redesign):
 * a coin-shine running-balance THREAD (`cashflow-thread` path, stroke only) +
 * an event lane of per-bucket in/out bars (`cashflow-bar-in` sprout above the
 * baseline, `cashflow-bar-out` rose below). chart.js is gone — the band is
 * pure Svelte SVG, so we DOM-assert the thread + bars directly instead of
 * probing a canvas via `Chart.getChart`.
 *
 * Backend endpoint `GET /api/analytics/monthly-trend/` drives the data; the
 * trend window is driven by the shared period pill, NOT the old `?months=N`
 * param. Finite windows ≤ 62 days request `granularity=day` — the band runs
 * over day buckets clipped at today (`cashflow-trend-day-count` mirror,
 * `data-granularity="day"`). Longer windows run month buckets and keep the
 * `cashflow-trend-month-count` mirror:
 *   • the 6M preset (`period-preset-6m`) → 6 entries;
 *   • a custom range spanning 12 calendar months → 12 entries.
 * (There is no 12M preset — hence the custom range for the 12-month case.)
 *
 * What we validate (mirror/granularity/clip semantics are unchanged):
 *   • This month → daily mode, day-count == TODAY.getDate(), month-count absent.
 *   • The running-balance thread path renders; in/out bars render for seeded
 *     active days.
 *   • 6M preset → 6 month buckets; a 12-calendar-month custom range → 12.
 *   • Empty space surfaces the empty placeholder.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date()

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoDaysAgo(daysBack: number): string {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - daysBack, 15)
  return d.toISOString().split('T')[0]
}

/** First day of the calendar month `monthsBack` before the current month. */
function firstOfMonthsAgo(monthsBack: number): string {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - monthsBack, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
}

/** Last day of the current month, ISO. */
function lastOfThisMonth(): string {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

test.describe('Analytics cashflow band', () => {
  test('a one-month window renders the thread + in/out bars, clipped at today', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Daily Trend Home')

    // Two days of real activity inside the current month (day 1 is never in
    // the future; the second row lands on today).
    const firstOfMonth = `${TODAY.getFullYear()}-${pad2(TODAY.getMonth() + 1)}-01`
    const todayIso = `${TODAY.getFullYear()}-${pad2(TODAY.getMonth() + 1)}-${pad2(TODAY.getDate())}`
    await api.createExpense({
      space: hh.id,
      description: 'Salary day',
      amount: 1000,
      type: 'income',
      expense_date: firstOfMonth,
    })
    await api.createExpense({
      space: hh.id,
      description: 'Rent day',
      amount: 400,
      type: 'expense',
      expense_date: todayIso,
    })

    // Default window = This month (≤ 62 days) → granularity=day.
    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const band = page.getByTestId('cashflow-trend')
    await expect(band).toBeVisible()
    await expect(band).toHaveAttribute('data-granularity', 'day')

    // Day-count mirror = one bucket per day from the 1st THROUGH TODAY (the
    // band clips future days); the month-count mirror must NOT exist in daily
    // mode.
    await expect(page.getByTestId('cashflow-trend-day-count')).toHaveText(String(TODAY.getDate()))
    await expect(page.getByTestId('cashflow-trend-month-count')).toHaveCount(0)

    // Real DOM assertions replace the old Chart.getChart canvas probe:
    // the running-balance thread (a single coin-shine path) is present...
    const thread = band.getByTestId('cashflow-thread')
    await expect(thread).toHaveCount(1)
    // ...and it has a non-empty `d` (a real polyline, not an empty stub).
    const d = await thread.getAttribute('d')
    expect(d?.length ?? 0).toBeGreaterThan(0)

    // The income day (Jun 1) draws an in-bar; the expense day (today) draws an
    // out-bar. Exactly two active days → at least one of each.
    await expect(band.getByTestId('cashflow-bar-in')).not.toHaveCount(0)
    await expect(band.getByTestId('cashflow-bar-out')).not.toHaveCount(0)
  })

  test('renders 6 buckets under the 6M preset', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Trend Home')

    for (let i = 0; i < 6; i++) {
      await api.createExpense({
        space: hh.id,
        description: `M-${i}`,
        amount: 100 + i * 10,
        expense_date: isoDaysAgo(i),
      })
    }

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const band = page.getByTestId('cashflow-trend')
    await expect(band).toBeVisible()

    // Drive the 6M preset → the cashflow window spans six calendar months.
    // Click + URL-commit retried as ONE unit: under full-matrix load the click
    // can land on the SSR DOM before hydration attaches the handler, so the
    // client-side goto never starts and a bare waitForURL eats the whole test
    // budget (diagnosed 2026-06-11 — infra-load tail, not an app bug).
    await expect(async () => {
      await page.getByTestId('period-preset-6m').click()
      await page.waitForURL(/preset=6m/, { timeout: 2_000 })
    }).toPass({ timeout: 20_000 })
    await page.waitForLoadState('networkidle')

    // Hidden count mirror = number of month buckets rendered.
    await expect(page.getByTestId('cashflow-trend')).toHaveAttribute('data-granularity', 'month')
    await expect(page.getByTestId('cashflow-trend-month-count')).toHaveText('6')
  })

  test('thread + bars render on monthly buckets with income and expenses', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('IvE Home')

    // Seed both income and expense rows so both bar directions carry real values.
    await api.createExpense({
      space: hh.id,
      description: 'Salary 1',
      amount: 2000,
      type: 'income',
      expense_date: isoDaysAgo(0),
    })
    await api.createExpense({
      space: hh.id,
      description: 'Salary 2',
      amount: 2000,
      type: 'income',
      expense_date: isoDaysAgo(1),
    })
    await api.createExpense({
      space: hh.id,
      description: 'Rent 1',
      amount: 800,
      type: 'expense',
      expense_date: isoDaysAgo(0),
    })
    await api.createExpense({
      space: hh.id,
      description: 'Rent 2',
      amount: 800,
      type: 'expense',
      expense_date: isoDaysAgo(1),
    })

    // 6M preset → six month buckets (the window context for both bar lanes).
    await page.goto(`/dashboard?space=${hh.id}&preset=6m`)
    await page.waitForLoadState('networkidle')

    const band = page.getByTestId('cashflow-trend')
    await expect(band).toBeVisible()
    await expect(band).toHaveAttribute('data-granularity', 'month')
    await expect(page.getByTestId('cashflow-trend-month-count')).toHaveText('6')

    // Both lanes render real bars (income above the baseline, expenses below) —
    // the GROWTH band's one visual language, asserted from the DOM instead of a
    // chart.js canvas probe.
    await expect(band.getByTestId('cashflow-bar-in')).not.toHaveCount(0)
    await expect(band.getByTestId('cashflow-bar-out')).not.toHaveCount(0)
    // The running-balance thread is present too.
    await expect(band.getByTestId('cashflow-thread')).toHaveCount(1)
  })

  test('a 12-calendar-month custom range reloads the band to 12 buckets', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Months12 Home')

    for (let i = 0; i < 12; i++) {
      await api.createExpense({
        space: hh.id,
        description: `M12-${i}`,
        amount: 50 + i,
        expense_date: isoDaysAgo(i),
      })
    }

    // There is no 12M preset — span exactly 12 calendar months via a custom
    // range: date_from = first day 11 months before the current month,
    // date_to = last day of the current month. monthSpan(from, to) === 12.
    const dateFrom = firstOfMonthsAgo(11)
    const dateTo = lastOfThisMonth()
    await page.goto(
      `/dashboard?space=${hh.id}&preset=custom&date_from=${dateFrom}&date_to=${dateTo}`,
    )
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('cashflow-trend')).toBeVisible()
    await expect(page.getByTestId('cashflow-trend')).toHaveAttribute('data-granularity', 'month')
    await expect(page.getByTestId('cashflow-trend-month-count')).toHaveText('12')
  })

  test('empty data renders empty state', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Empty Trend Home')

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('cashflow-trend')).toBeVisible()
    await expect(page.getByTestId('cashflow-trend-empty')).toBeVisible()
    await expect(page.getByTestId('cashflow-trend-empty')).toContainText('No income or expenses')
  })
})
