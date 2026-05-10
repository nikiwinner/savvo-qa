/**
 * Expenses — Inline FX-converted display (Phase 10, Story 10.7)
 *
 * Verifies the per-row hybrid display contract from Implementation Rule #16:
 *   1. row.currency !== userCurrency && rate is seeded → secondary line
 *      shows `(≈ <userSymbol><value>)`.
 *   2. row.currency === userCurrency → no secondary line at all.
 *   3. row.currency !== userCurrency && no rate available → secondary line
 *      reads "rate unavailable" (italic, muted).
 *
 * The QA backend points FX_PROVIDER_BASE_URL at an unreachable host, so any
 * pair without a pre-seeded ExchangeRate row triggers the failure path
 * deterministically.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Inline-converted display on /dashboard/expenses (Story 10.7)', () => {
  test('off-currency expense row renders inline (≈ ...) line', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    // Seed a deterministic USD->EUR rate so the conversion is predictable.
    await api.seedExchangeRate('USD', 'EUR', '0.50', TODAY)

    const hh = await api.createHousehold('Inline FX Home')
    const description = `usd-row-${Date.now()}`
    await api.createExpense({
      household: hh.id,
      description,
      amount: 200,
      expense_date: TODAY,
      currency: 'USD',
    })

    await page.goto(`/dashboard/expenses?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const row = page.locator('tbody tr', { hasText: description })
    await expect(row).toBeVisible({ timeout: 5000 })
    const amountCell = row.locator('td.cell-amount')
    await expect(amountCell).toBeVisible()

    // Canonical USD line is present.
    const cellText = await amountCell.innerText()
    expect(cellText).toContain('$')
    expect(cellText).toMatch(/200\.00/)

    // Secondary FX-converted line: 200 USD * 0.50 = 100 EUR. The component
    // uses the data-testid="amount-converted" hook.
    const converted = row.locator('[data-testid="amount-converted"]')
    await expect(converted).toBeVisible()
    const convertedText = await converted.innerText()
    expect(convertedText).toContain('€')
    expect(convertedText).toMatch(/100\.00/)
    expect(convertedText).toMatch(/≈/)
  })

  test('same-currency rows do not render the secondary line', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    const hh = await api.createHousehold('Same Currency Home')
    const description = `eur-row-${Date.now()}`
    await api.createExpense({
      household: hh.id,
      description,
      amount: 50,
      expense_date: TODAY,
      currency: 'EUR',
    })

    await page.goto(`/dashboard/expenses?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const row = page.locator('tbody tr', { hasText: description })
    await expect(row).toBeVisible({ timeout: 5000 })

    // No FX hint of either flavour for same-currency rows.
    await expect(row.locator('[data-testid="amount-converted"]')).toHaveCount(0)
    await expect(row.locator('[data-testid="amount-rate-unavailable"]')).toHaveCount(0)
  })

  test('FX-failed row shows "rate unavailable" hint', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    // No rate seeded for NOK->EUR. The QA backend's FX provider is
    // unreachable, so the live fetch fails and the 14-day walk-back finds
    // nothing → the serializer returns converted_amount: null while
    // currency != userCurrency, which is the disambiguation rule for "FX
    // failed" (Implementation Rule #16, branch c).
    const hh = await api.createHousehold('FX Failed Home')
    const description = `nok-row-${Date.now()}`
    await api.createExpense({
      household: hh.id,
      description,
      amount: 99,
      expense_date: TODAY,
      currency: 'NOK',
    })

    await page.goto(`/dashboard/expenses?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const row = page.locator('tbody tr', { hasText: description })
    await expect(row).toBeVisible({ timeout: 5000 })

    const unavailable = row.locator('[data-testid="amount-rate-unavailable"]')
    await expect(unavailable).toBeVisible()
    await expect(unavailable).toContainText(/rate unavailable/i)

    // The success-flavour secondary line must NOT also render.
    await expect(row.locator('[data-testid="amount-converted"]')).toHaveCount(0)
  })
})
