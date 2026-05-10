/**
 * Budgets — FX rendering (Phase 10, Story 10.7)
 *
 * Verifies:
 *   1. Mixed-currency budget spent renders in the household's primary
 *      currency (default EUR for newly created households) with the matching
 *      symbol, and the value equals the FX-converted sum.
 *   2. When at least one contributing FX conversion fails, the budget card
 *      surfaces the fx_stale icon with the GENERIC tooltip — no specific
 *      date (per Implementation Rule #17 — a budget aggregates many rows
 *      from many dates; one date would lie).
 *
 * The QA backend points FX_PROVIDER_BASE_URL at an unreachable host, so any
 * pair without a pre-seeded ExchangeRate row triggers the fx_stale=True path
 * deterministically.
 */
import { test, expect } from '../../fixtures/index'

const TARGET_DATE = '2026-05-15'
const TARGET_YEAR = 2026
const TARGET_MONTH = 5

test.describe('Budgets FX rendering (Story 10.7)', () => {
  test('mixed-currency budget spent renders in primary currency', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    // Seed USD->EUR rate for both today (insurance) and the expense date so
    // the budget's row-level conversion finds it.
    await api.seedExchangeRate('USD', 'EUR', '0.50', TARGET_DATE)
    await api.seedExchangeRate('USD', 'EUR', '0.50')

    // Default-created household has primary_currency=EUR (Phase 10 backfill).
    const hh = await api.createHousehold('Mixed Budget Home')
    const categories = await api.listCategories()
    expect(categories.length).toBeGreaterThan(0)
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '500.00',
      year: TARGET_YEAR,
      month: TARGET_MONTH,
    })

    // 60 EUR + 200 USD * 0.50 = 60 + 100 = 160 EUR total spent.
    await api.createExpense({
      household: hh.id,
      description: 'eur-leg',
      amount: 60,
      expense_date: TARGET_DATE,
      currency: 'EUR',
      category: cat.id,
    })
    await api.createExpense({
      household: hh.id,
      description: 'usd-leg',
      amount: 200,
      expense_date: TARGET_DATE,
      currency: 'USD',
      category: cat.id,
    })

    await page.goto(
      `/dashboard/budgets?household=${hh.id}&year=${TARGET_YEAR}&month=${TARGET_MONTH}`,
    )
    await page.waitForLoadState('networkidle')

    const card = page.locator('.budget-card').first()
    await expect(card).toBeVisible({ timeout: 5000 })

    const progress = card.locator('.progress-label')
    await expect(progress).toBeVisible()
    const progressText = await progress.innerText()
    // Primary-currency symbol present; USD symbol must NOT appear in the
    // aggregate (FX-converted to EUR).
    expect(progressText).toContain('€')
    expect(progressText).not.toContain('$')
    // 60 + 100 = 160.00 EUR.
    expect(progressText).toMatch(/160\.00/)

    // No fx_stale icon — every contributing row converted cleanly.
    await expect(card.locator('[data-testid="budget-fx-stale-icon"]')).toHaveCount(0)
  })

  test('fx-stale tooltip is generic on budgets', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    // No rate seeded for DKK->EUR — the FX provider is unreachable, so the
    // budget's row conversion will raise FXRateUnavailableError and the
    // serializer flips fx_stale=true.
    const hh = await api.createHousehold('Stale Budget Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '500.00',
      year: TARGET_YEAR,
      month: TARGET_MONTH,
    })

    await api.createExpense({
      household: hh.id,
      description: 'dkk-untranslated',
      amount: 100,
      expense_date: TARGET_DATE,
      currency: 'DKK',
      category: cat.id,
    })

    await page.goto(
      `/dashboard/budgets?household=${hh.id}&year=${TARGET_YEAR}&month=${TARGET_MONTH}`,
    )
    await page.waitForLoadState('networkidle')

    const card = page.locator('.budget-card').first()
    await expect(card).toBeVisible({ timeout: 5000 })

    const icon = card.locator('[data-testid="budget-fx-stale-icon"]')
    await expect(icon).toBeVisible()

    // Tooltip is exactly the generic phrase from the phase doc — no specific
    // date (Implementation Rule #17). The tooltip is exposed via the title
    // attribute on the icon's wrapper.
    const tooltip = await icon.getAttribute('title')
    expect(tooltip).toBe(
      'Some FX rates are stale or unavailable. Spent values are best-effort approximations.',
    )
  })
})
