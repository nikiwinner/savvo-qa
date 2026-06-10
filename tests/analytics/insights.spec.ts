/**
 * Smart insights feed (localStorage dismiss UX).
 *
 * Backend endpoint `/api/analytics/insights/` is unchanged (6 rules). The
 * GROWTH redesign restyled InsightsFeed.svelte (per-type icon tile + uppercase
 * tag) but KEPT every testid and the dismiss/hash logic: server-sorted
 * Insight[] with a per-card dismiss button, dismissals persisted via the
 * localStorage key `savvo:dismissed_insights:v1`. Per-period scoping —
 * dismissing in the current month does NOT silence the previous month's
 * same-type insight.
 *
 * Hash schema (frontend): `${type}|${title}|${data.period_yyyy_mm}`.
 *
 * These assertions run against the restyled DOM via the stable testids
 * (`insights-feed`, `insight-card-<type>`, `insight-dismiss-<type>`,
 * `insights-show-all`, `data-severity`).
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date()
const TODAY_ISO = TODAY.toISOString().split('T')[0]

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoOffsetMonths(offset: number, day = 15): string {
  // offset = -1 → last month; +1 → next month.
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, day)
  return d.toISOString().split('T')[0]
}

/**
 * Build the analytics period-pill query that anchors insights to the calendar
 * month `offset` away (0 = current). Insights are anchored to the LAST month of
 * the range (= the month of `date_to`), so a single-month custom range scopes
 * the insights feed (and its localStorage dismiss hash, which keys on
 * `period_yyyy_mm` = the anchor month) to exactly that month. This replaces the
 * old `?period=YYYY-MM` param.
 */
function monthRangeQuery(offset: number): string {
  const first = new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  const from = `${first.getFullYear()}-${pad2(first.getMonth() + 1)}-01`
  const to = `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`
  return `preset=custom&date_from=${from}&date_to=${to}`
}

const CURRENT_MONTH_RANGE = monthRangeQuery(0)

test.describe('Analytics smart insights', () => {
  test('multi-rule scenario surfaces three insight cards', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Insights MultiRule Home')

    // Trigger uncategorized_alert: >20% of THIS month's rows are uncategorised.
    // Seed 5 uncategorised + 2 categorised = 5/7 ≈ 71% uncategorised.
    const groceries = await api.findOrCreateCategory('Groceries-IM', 'shopping-cart')
    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        space: hh.id,
        description: `Uncat ${i}`,
        amount: 20,
        expense_date: TODAY_ISO,
      })
    }
    // Trigger top_merchant: highest-spend merchant this month.
    await api.createExpense({
      space: hh.id,
      description: 'ALDI Saturday',
      amount: 150,
      category: groceries.id,
      expense_date: TODAY_ISO,
    })
    // Trigger category_spike: groceries 50 last month → 150 this month (200% spike).
    await api.createExpense({
      space: hh.id,
      description: 'Groceries small last month',
      amount: 50,
      category: groceries.id,
      expense_date: isoOffsetMonths(-1),
    })

    await page.goto(`/dashboard/analytics?space=${hh.id}&${CURRENT_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    const feed = page.getByTestId('insights-feed')
    await expect(feed).toBeVisible()

    // At least three insight cards across the warning + info severities.
    const cards = page.locator('[data-testid^="insight-card-"]')
    expect(await cards.count()).toBeGreaterThanOrEqual(3)

    // Specific cards we expect by design.
    await expect(page.getByTestId('insight-card-uncategorized_alert')).toBeVisible()
    await expect(page.getByTestId('insight-card-top_merchant')).toBeVisible()
    await expect(page.getByTestId('insight-card-category_spike')).toBeVisible()

    // Severity colour is encoded as a data attribute — assert one warning + one info.
    const warning = page.getByTestId('insight-card-uncategorized_alert')
    await expect(warning).toHaveAttribute('data-severity', 'warning')
    const info = page.getByTestId('insight-card-top_merchant')
    await expect(info).toHaveAttribute('data-severity', 'info')
  })

  test('empty space renders insights placeholder', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Empty Insights Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}&${CURRENT_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('insights-feed')).toBeVisible()
    await expect(page.getByTestId('insights-empty')).toBeVisible()
    await expect(page.getByTestId('insights-empty')).toContainText('No insights yet')
  })

  test('dismiss button hides a card and persists across reload', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Dismiss Home')

    // Seed enough rows to definitely trigger uncategorized_alert (>20%).
    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        space: hh.id,
        description: `D ${i}`,
        amount: 25,
        expense_date: TODAY_ISO,
      })
    }

    await page.goto(`/dashboard/analytics?space=${hh.id}&${CURRENT_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    const card = page.getByTestId('insight-card-uncategorized_alert')
    await expect(card).toBeVisible()

    await page.getByTestId('insight-dismiss-uncategorized_alert').click()
    // Immediately disappears (filter is reactive on the dismissed Set).
    await expect(card).toHaveCount(0)

    // Reload — assert the localStorage entry survived.
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('insight-card-uncategorized_alert')).toHaveCount(0)
    // The "show all" link should be visible since one is dismissed for this period.
    await expect(page.getByTestId('insights-show-all')).toBeVisible()
  })

  test('per-period scoping: dismissing in current month does NOT affect previous month', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Period Scope Home')

    // Trigger uncategorized_alert in CURRENT month.
    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        space: hh.id,
        description: `Cur ${i}`,
        amount: 25,
        expense_date: TODAY_ISO,
      })
    }
    // Trigger uncategorized_alert in PREVIOUS month as well — independent
    // pile of rows so the rule fires for that period too.
    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        space: hh.id,
        description: `Prev ${i}`,
        amount: 25,
        expense_date: isoOffsetMonths(-1),
      })
    }

    // Dismiss for the CURRENT period.
    await page.goto(`/dashboard/analytics?space=${hh.id}&${CURRENT_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('insight-card-uncategorized_alert')).toBeVisible()
    await page.getByTestId('insight-dismiss-uncategorized_alert').click()
    await expect(page.getByTestId('insight-card-uncategorized_alert')).toHaveCount(0)

    // Navigate to PREVIOUS month (a single-month custom range anchored on last
    // month) — the same-type insight has a different period_yyyy_mm hash, so it
    // must NOT be auto-dismissed.
    await page.goto(`/dashboard/analytics?space=${hh.id}&${monthRangeQuery(-1)}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('insight-card-uncategorized_alert')).toBeVisible()
  })

  test('"show all" link unfilters dismissed cards', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Show All Home')

    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        space: hh.id,
        description: `S ${i}`,
        amount: 25,
        expense_date: TODAY_ISO,
      })
    }

    await page.goto(`/dashboard/analytics?space=${hh.id}&${CURRENT_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('insight-card-uncategorized_alert')).toBeVisible()
    await page.getByTestId('insight-dismiss-uncategorized_alert').click()
    await expect(page.getByTestId('insight-card-uncategorized_alert')).toHaveCount(0)

    // The toggle link should report "1 dismissed".
    const showAll = page.getByTestId('insights-show-all')
    await expect(showAll).toBeVisible()
    await expect(showAll).toContainText('1 dismissed')

    await showAll.click()
    // Card reappears (muted style, but still visible + has dismissed-muted class).
    await expect(page.getByTestId('insight-card-uncategorized_alert')).toBeVisible()
  })
})
