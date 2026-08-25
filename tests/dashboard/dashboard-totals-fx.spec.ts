/**
 * Per-space summary FX rendering (Phase 10 Story 10.6, re-homed by Phase 17).
 *
 * The FX-aware per-space figures used to live on the old `/dashboard` root
 * backed by `GET /api/dashboard/totals/`. Phase 17 REMOVED that endpoint and
 * moved the per-space Income/Expense/Net numbers onto the Spaces management page
 * (`/dashboard/spaces`), fed by the existing `GET /api/spaces/summary/`. FX
 * rendering + the FX-stale indicator survive — this spec re-points them.
 *
 * The QA backend points `FX_PROVIDER_BASE_URL` at an unreachable host (see
 * playwright.config.ts), so FX behaviour is deterministic — required rates are
 * pre-seeded via `POST /api/seed/exchange-rate/`, and any pair without a seeded
 * rate produces `fx_stale=true`.
 */
import { test, expect } from '../../fixtures/index'
import { DashboardPage } from '../../pages/DashboardPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Per-space summary FX', () => {
  test('mixed-currency space summary renders totals in the user currency', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    // User is EUR by default; explicitly set to be safe.
    await api.setUserCurrency('EUR')

    // Seed a deterministic USD->EUR rate so the USD row converts cleanly.
    await api.seedExchangeRate('USD', 'EUR', '0.50', TODAY)

    const hh = await api.createSpace('FX Mixed Home')
    // 100 EUR expense passes through unchanged.
    await api.createExpense({
      space: hh.id,
      description: 'EUR groceries',
      amount: 100,
      expense_date: TODAY,
      currency: 'EUR',
    })
    // 200 USD * 0.50 = 100 EUR
    await api.createExpense({
      space: hh.id,
      description: 'USD coffee',
      amount: 200,
      expense_date: TODAY,
      currency: 'USD',
    })

    const dashboard = new DashboardPage(page)
    await dashboard.gotoSpaces()

    // The per-space summary card (FX-aware, current-month default) now lives on
    // the Spaces page. Expense: 100 EUR + 100 EUR (= USD 200 * 0.50) = 200.00 EUR
    await expect(dashboard.summaryOutflow()).toContainText('€')
    await expect(dashboard.summaryOutflow()).toContainText('200.00')

    // The fx-stale indicator must NOT appear when every rate is available.
    const indicator = page.getByTestId('fx-stale-indicator')
    await expect(indicator).toHaveCount(0)
  })

  test('a missing FX rate surfaces the stale indicator', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    // Use SEK->EUR for this test. The other test in this file seeds USD->EUR
    // and the ExchangeRate cache is global (no user scoping), so picking a
    // currency pair no other spec touches keeps the failure path deterministic
    // even under fullyParallel:true.
    await api.setUserCurrency('EUR')

    // No rate seeded for SEK->EUR. The QA backend's FX_PROVIDER_BASE_URL is
    // unreachable, so the live fetch fails and the 14-day walk-back finds
    // nothing → FXRateUnavailableError → fx_stale=true. The failed-row raw
    // amount still folds in (best-effort).
    const hh = await api.createSpace('FX Stale Home')
    await api.createExpense({
      space: hh.id,
      description: 'SEK untranslated',
      amount: 50,
      expense_date: TODAY,
      currency: 'SEK',
    })

    const dashboard = new DashboardPage(page)
    await dashboard.gotoSpaces()

    const indicator = page.getByTestId('fx-stale-indicator')
    await expect(indicator).toBeVisible()
    await expect(indicator).toContainText(/stale|unavailable/i)

    // The affected card also carries the per-row "rate unavailable" chip
    // (per-row staleness display), so the user can tell WHICH
    // space's numbers are approximate.
    await expect(
      page.locator(`.space-card[data-space-id="${hh.id}"]`).getByTestId('summary-fx-stale'),
    ).toBeVisible()
  })

  test('a substituted (too-old) rate converts but still flips the stale indicator', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    // PLN->EUR exists ONLY 10 days back (global ExchangeRate cache — no other
    // spec uses PLN). The conversion SUCCEEDS via the 14-day walk-back, but a
    // rate more than 7 days behind the row's date is a SUBSTITUTED rate
    // (fx-honesty, 2026-08-24) — the totals must carry the staleness flag even
    // though every row converted to a number.
    const rateDate = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0]
    await api.seedExchangeRate('PLN', 'EUR', '0.25', rateDate)

    const hh = await api.createSpace('FX Substituted Home')
    await api.createExpense({
      space: hh.id,
      description: 'PLN old-rate row',
      amount: 100,
      expense_date: TODAY,
      currency: 'PLN',
    })

    const dashboard = new DashboardPage(page)
    await dashboard.gotoSpaces()

    // The number itself converts: 100 PLN * 0.25 = 25.00 EUR...
    await expect(dashboard.summaryOutflow()).toContainText('25.00')
    // ...and the honesty flag appears anyway: a substituted rate is not the
    // real rate of the row's date, so the total is marked approximate.
    await expect(page.getByTestId('fx-stale-indicator')).toBeVisible()
    // The per-card chip rides the same per-space fx_stale flag, so the user
    // can tell WHICH space's numbers are approximate. Its copy must hold for
    // BOTH causes of that flag: here a rate existed (just from the wrong
    // date), so the old "rate unavailable" wording would be a lie.
    const chip = page.locator(`.space-card[data-space-id="${hh.id}"]`).getByTestId('summary-fx-stale')
    await expect(chip).toBeVisible()
    await expect(chip).toContainText(/approximate/i)
    await expect(chip).not.toContainText(/unavailable/i)
  })
})
