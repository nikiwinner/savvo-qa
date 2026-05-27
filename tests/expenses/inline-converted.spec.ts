/**
 * Expenses — Display-currency-first amount (Phase 10 Story 10.7, revised).
 *
 * The viewer's display currency is the PRIMARY, prominent figure on every row.
 * When the row's native currency differs, the real native amount is kept as a
 * small muted reference line below (never lie about money — the native figure
 * is the real one, the primary is an FX conversion at today's rate).
 *
 *   1. row.currency !== userCurrency && rate seeded → primary shows the
 *      converted display-currency amount; a secondary line shows the native.
 *   2. row.currency === userCurrency → single line, no secondary.
 *   3. row.currency !== userCurrency && no rate available → primary shows the
 *      native amount; secondary reads "rate unavailable" (italic, muted).
 *
 * The QA backend points FX_PROVIDER_BASE_URL at an unreachable host, so any
 * pair without a pre-seeded ExchangeRate row triggers the failure path
 * deterministically.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Display-currency-first amount on /dashboard/expenses (Story 10.7)', () => {
  test('off-currency expense row shows converted primary + native secondary', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    // Seed a deterministic USD->EUR rate so the conversion is predictable.
    await api.seedExchangeRate('USD', 'EUR', '0.50', TODAY)

    const hh = await api.createSpace('Inline FX Home')
    const description = `usd-row-${Date.now()}`
    await api.createExpense({
      space: hh.id,
      description,
      amount: 200,
      expense_date: TODAY,
      currency: 'USD',
    })

    await page.goto(`/dashboard/expenses?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const row = page.locator('tbody tr', { hasText: description })
    await expect(row).toBeVisible({ timeout: 5000 })

    // Primary line is the converted display currency: 200 USD * 0.50 = 100 EUR.
    const primary = row.locator('[data-testid="amount-primary"]')
    await expect(primary).toBeVisible()
    const primaryText = await primary.innerText()
    expect(primaryText).toContain('€')
    expect(primaryText).toMatch(/100\.00/)

    // Secondary line keeps the real native amount: $200.00.
    const native = row.locator('[data-testid="amount-native"]')
    await expect(native).toBeVisible()
    const nativeText = await native.innerText()
    expect(nativeText).toContain('$')
    expect(nativeText).toMatch(/200\.00/)
  })

  test('same-currency rows render only the primary line', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    const hh = await api.createSpace('Same Currency Home')
    const description = `eur-row-${Date.now()}`
    await api.createExpense({
      space: hh.id,
      description,
      amount: 50,
      expense_date: TODAY,
      currency: 'EUR',
    })

    await page.goto(`/dashboard/expenses?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const row = page.locator('tbody tr', { hasText: description })
    await expect(row).toBeVisible({ timeout: 5000 })

    // Primary present; no native/unavailable secondary for same-currency rows.
    await expect(row.locator('[data-testid="amount-primary"]')).toBeVisible()
    await expect(row.locator('[data-testid="amount-native"]')).toHaveCount(0)
    await expect(row.locator('[data-testid="amount-rate-unavailable"]')).toHaveCount(0)
  })

  test('FX-failed row shows native primary + "rate unavailable" hint', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    // No rate seeded for NOK->EUR. The QA backend's FX provider is unreachable,
    // so the live fetch fails and the cache lookup finds nothing → the
    // serializer returns converted_amount: null while currency != userCurrency.
    const hh = await api.createSpace('FX Failed Home')
    const description = `nok-row-${Date.now()}`
    await api.createExpense({
      space: hh.id,
      description,
      amount: 99,
      expense_date: TODAY,
      currency: 'NOK',
    })

    await page.goto(`/dashboard/expenses?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const row = page.locator('tbody tr', { hasText: description })
    await expect(row).toBeVisible({ timeout: 5000 })

    // Primary falls back to the native amount (can't convert).
    const primary = row.locator('[data-testid="amount-primary"]')
    await expect(primary).toBeVisible()
    await expect(primary).toContainText(/99\.00/)

    const unavailable = row.locator('[data-testid="amount-rate-unavailable"]')
    await expect(unavailable).toBeVisible()
    await expect(unavailable).toContainText(/rate unavailable/i)

    // The success-flavour native line must NOT also render.
    await expect(row.locator('[data-testid="amount-native"]')).toHaveCount(0)
  })
})
