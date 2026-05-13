/**
 * Phase 11 Story 11.7 — Insights feed (with localStorage dismiss UX) +
 * balance summary card.
 *
 * Backend endpoints `/api/analytics/insights/` and `/api/analytics/balance-summary/`
 * are live from Stories 11.2 and 11.3. The frontend now renders both:
 *   • InsightsFeed.svelte: server-sorted Insight[] with per-card dismiss
 *     button. Dismissals persist via localStorage key
 *     `ledgerapp:dismissed_insights:v1`. Per-period scoping — dismissing
 *     in May does NOT silence June's same-type insight.
 *   • BalanceSummaryCard.svelte: per-account native balance + primary-currency
 *     total + Phase 10 fx_stale icon.
 *
 * Hash schema (frontend): `${type}|${title}|${data.period_yyyy_mm}`.
 *
 * The QA-stack backend points `FX_PROVIDER_BASE_URL` at an unreachable host
 * (see playwright.config.ts), so any currency pair we do NOT seed via
 * `seedExchangeRate` will surface `fx_stale=true`.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date()
const YEAR = TODAY.getFullYear()
const MONTH = TODAY.getMonth() + 1
const CURRENT_PERIOD = `${YEAR}-${String(MONTH).padStart(2, '0')}`
const TODAY_ISO = TODAY.toISOString().split('T')[0]

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoOffsetMonths(offset: number, day = 15): string {
  // offset = -1 → last month; +1 → next month.
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, day)
  return d.toISOString().split('T')[0]
}

function periodOffset(offset: number): string {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

test.describe('Analytics insights + balance summary (Story 11.7)', () => {
  test('multi-rule scenario surfaces three insight cards', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Insights MultiRule Home')

    // Trigger uncategorized_alert: >20% of THIS month's rows are uncategorised.
    // Seed 5 uncategorised + 2 categorised = 5/7 ≈ 71% uncategorised.
    const groceries = await api.findOrCreateCategory('Groceries-IM', 'shopping-cart')
    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        household: hh.id,
        description: `Uncat ${i}`,
        amount: 20,
        expense_date: TODAY_ISO,
      })
    }
    // Trigger top_merchant: highest-spend merchant this month.
    await api.createExpense({
      household: hh.id,
      description: 'ALDI Saturday',
      amount: 150,
      category: groceries.id,
      expense_date: TODAY_ISO,
    })
    // Trigger category_spike: groceries 50 last month → 150 this month (200% spike).
    await api.createExpense({
      household: hh.id,
      description: 'Groceries small last month',
      amount: 50,
      category: groceries.id,
      expense_date: isoOffsetMonths(-1),
    })

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${CURRENT_PERIOD}`)
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

  test('empty household renders insights placeholder', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Empty Insights Home')

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${CURRENT_PERIOD}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('insights-feed')).toBeVisible()
    await expect(page.getByTestId('insights-empty')).toBeVisible()
    await expect(page.getByTestId('insights-empty')).toContainText('No insights yet')
  })

  test('balance summary shows per-account native + primary total', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Balance Home')

    // Seed FX rates so USD->EUR is known (deterministic; cache-only render path).
    await api.seedExchangeRate('USD', 'EUR', '0.90', TODAY_ISO)

    const eur = await api.seedBankAccount({
      account_name: 'Checking',
      bank_name: 'ING',
      balance_amount: '1000.00',
      balance_currency: 'EUR',
      balance_updated_at: TODAY.toISOString(),
      household_id: hh.id,
    })
    const usd = await api.seedBankAccount({
      account_name: 'USD Savings',
      bank_name: 'Revolut',
      balance_amount: '500.00',
      balance_currency: 'USD',
      balance_updated_at: TODAY.toISOString(),
      household_id: hh.id,
    })

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${CURRENT_PERIOD}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('balance-summary')).toBeVisible()
    await expect(page.getByTestId(`balance-account-${eur.account_id}`)).toBeVisible()
    await expect(page.getByTestId(`balance-account-${usd.account_id}`)).toBeVisible()
    await expect(page.getByTestId('balance-total')).toBeVisible()

    // EUR row carries the € symbol on its native amount.
    const eurRow = page.getByTestId(`balance-account-${eur.account_id}`)
    await expect(eurRow).toContainText('€')
    // USD row carries $ on its native amount.
    const usdRow = page.getByTestId(`balance-account-${usd.account_id}`)
    await expect(usdRow).toContainText('$')

    // Total is in the household primary (EUR). 1000 + 500*0.90 = 1450.00.
    const total = page.getByTestId('balance-total')
    await expect(total).toContainText('€')
    await expect(total).toContainText('1,450.00')
  })

  test('fx_stale icon appears on balance when rate missing', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('FX Stale Home')

    // Deliberately do NOT seed any CHF->EUR rate. CHF is used here (not USD)
    // because earlier tests in the suite seed USD->EUR rates that persist in
    // the QA-stack ExchangeRate cache (FX is shared across test cases). CHF
    // is otherwise untouched. The QA backend's FX_PROVIDER_BASE_URL is
    // unreachable, so the missing rate falls back and surfaces fx_stale=true.
    await api.seedBankAccount({
      account_name: 'CHF Account',
      bank_name: 'NoRateBank',
      balance_amount: '500.00',
      balance_currency: 'CHF',
      balance_updated_at: TODAY.toISOString(),
      household_id: hh.id,
    })

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${CURRENT_PERIOD}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('balance-summary')).toBeVisible()
    await expect(page.getByTestId('balance-fx-stale')).toBeVisible()
    await expect(page.getByTestId('balance-summary')).toHaveAttribute('data-fx-stale', 'true')
  })

  test('null-balance account is listed but excluded from total', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Null Balance Home')

    const synced = await api.seedBankAccount({
      account_name: 'Synced Account',
      bank_name: 'BankA',
      balance_amount: '300.00',
      balance_currency: 'EUR',
      balance_updated_at: TODAY.toISOString(),
      household_id: hh.id,
    })
    const never = await api.seedBankAccount({
      account_name: 'Never Synced',
      bank_name: 'BankB',
      balance_amount: null,
      balance_currency: 'EUR',
      balance_updated_at: null,
      household_id: hh.id,
    })

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${CURRENT_PERIOD}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId(`balance-account-${synced.account_id}`)).toBeVisible()
    await expect(page.getByTestId(`balance-account-${never.account_id}`)).toBeVisible()

    // Null row reads "Not synced yet".
    const nullRow = page.getByTestId(`balance-account-${never.account_id}`)
    await expect(nullRow).toContainText('Not synced yet')

    // Total only reflects the synced balance (300.00 EUR).
    const total = page.getByTestId('balance-total')
    await expect(total).toContainText('300.00')
  })

  test('dismiss button hides a card and persists across reload', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Dismiss Home')

    // Seed enough rows to definitely trigger uncategorized_alert (>20%).
    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        household: hh.id,
        description: `D ${i}`,
        amount: 25,
        expense_date: TODAY_ISO,
      })
    }

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${CURRENT_PERIOD}`)
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
    const hh = await api.createHousehold('Period Scope Home')

    // Trigger uncategorized_alert in CURRENT month.
    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        household: hh.id,
        description: `Cur ${i}`,
        amount: 25,
        expense_date: TODAY_ISO,
      })
    }
    // Trigger uncategorized_alert in PREVIOUS month as well — independent
    // pile of rows so the rule fires for that period too.
    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        household: hh.id,
        description: `Prev ${i}`,
        amount: 25,
        expense_date: isoOffsetMonths(-1),
      })
    }

    // Dismiss for the CURRENT period.
    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${CURRENT_PERIOD}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('insight-card-uncategorized_alert')).toBeVisible()
    await page.getByTestId('insight-dismiss-uncategorized_alert').click()
    await expect(page.getByTestId('insight-card-uncategorized_alert')).toHaveCount(0)

    // Navigate to PREVIOUS month — the same-type insight has a different
    // period_yyyy_mm hash, so it must NOT be auto-dismissed.
    const prevPeriod = periodOffset(-1)
    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${prevPeriod}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('insight-card-uncategorized_alert')).toBeVisible()
  })

  test('"show all" link unfilters dismissed cards', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Show All Home')

    for (let i = 0; i < 5; i++) {
      await api.createExpense({
        household: hh.id,
        description: `S ${i}`,
        amount: 25,
        expense_date: TODAY_ISO,
      })
    }

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${CURRENT_PERIOD}`)
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
