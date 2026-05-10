/**
 * Dashboard — Totals FX (Phase 10, Story 10.6)
 *
 * Covers `/dashboard` rendering of the FX-aware summary cards backed by
 * `GET /api/dashboard/totals/`. The QA backend points `FX_PROVIDER_BASE_URL`
 * at an unreachable host (see playwright.config.ts), so FX behaviour is
 * deterministic — required rates are pre-seeded via `POST /api/seed/exchange-rate/`,
 * any pair without a seeded rate produces `fx_stale=true`.
 */
import { test, expect } from '../../fixtures/index'
import { DashboardPage } from '../../pages/DashboardPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Dashboard totals FX', () => {
  test('mixed-currency dashboard renders totals in user currency', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    // User is EUR by default; explicitly set to be safe.
    await api.setUserCurrency('EUR')

    // Seed a deterministic USD->EUR rate so the USD row converts cleanly.
    await api.seedExchangeRate('USD', 'EUR', '0.50', TODAY)

    const hh = await api.createHousehold('FX Mixed Home')
    // 100 EUR expense passes through unchanged.
    await api.createExpense({
      household: hh.id,
      description: 'EUR groceries',
      amount: 100,
      expense_date: TODAY,
      currency: 'EUR',
    })
    // 200 USD * 0.50 = 100 EUR
    await api.createExpense({
      household: hh.id,
      description: 'USD coffee',
      amount: 200,
      expense_date: TODAY,
      currency: 'USD',
    })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    // Total expenses: 100 EUR + 100 EUR (= USD 200 * 0.50) = 200.00 EUR
    await expect(dashboard.totalExpenseAmount()).toContainText('€')
    await expect(dashboard.totalExpenseAmount()).toContainText('200.00')

    // The fx-stale indicator must NOT appear when every rate is available.
    const indicator = page.getByTestId('fx-stale-indicator')
    await expect(indicator).toHaveCount(0)
  })

  test('fx-stale flag surfaces a soft indicator', async ({ page, loggedInPage }) => {
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
    const hh = await api.createHousehold('FX Stale Home')
    await api.createExpense({
      household: hh.id,
      description: 'SEK untranslated',
      amount: 50,
      expense_date: TODAY,
      currency: 'SEK',
    })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    const indicator = page.getByTestId('fx-stale-indicator')
    await expect(indicator).toBeVisible()
    await expect(indicator).toContainText(/stale|unavailable/i)
  })
})
