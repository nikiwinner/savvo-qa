/**
 * Settings → Banking — account-card balance display (fx-honesty, 2026-08-24).
 *
 * Bank account cards follow the display-currency-first pattern: the primary
 * figure is the stored balance converted to the viewer's display currency at
 * TODAY's rate (balances answer "what is it worth now" — unlike transactions,
 * which convert at their row date), with the bank's real native balance kept
 * as the small line beneath. Same-currency accounts render a single line.
 *
 * The QA backend's FX provider is unreachable, so the seeded rate is the only
 * conversion source (deterministic).
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Banking settings — converted account balances', () => {
  test('off-currency account card shows converted primary + native beneath', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    // Same pair + value other specs seed (the ExchangeRate cache is GLOBAL
    // across parallel specs, so a different value here would race them).
    await api.seedExchangeRate('USD', 'EUR', '0.50', TODAY)

    const seeded = await api.seedBankAccount({
      account_name: 'USD Savings',
      bank_name: 'FX Demo Bank',
      balance_amount: '500.00',
      balance_currency: 'USD',
    })

    await page.goto('/dashboard/settings/banking')
    await page.waitForLoadState('networkidle')

    const card = page.locator('.account-card', { hasText: seeded.account_name })
    await expect(card).toBeVisible()

    // Primary: 500 USD * 0.50 = 250.00 EUR at today's rate.
    await expect(card.getByTestId('amount-primary')).toContainText('€')
    await expect(card.getByTestId('amount-primary')).toContainText('250.00')
    // The bank's real figure stays traceable beneath (never lie about money).
    const native = card.getByTestId('amount-native')
    await expect(native).toContainText('$500.00')

    // The tooltip is the BALANCE flavour ("Actual account balance", today's
    // rate) — guards the kind="balance" wiring on the banking page.
    await native.hover()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText('Actual account balance')
    await expect(tooltip).toContainText("today's rate")
  })

  test('substituted balance rate names its real date in the tooltip', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    // CHF->EUR exists ONLY 10 days back (no other spec uses CHF — the
    // ExchangeRate cache is global). Balances convert at TODAY, so the
    // walk-back lands on a >7-day-old rate: substituted, and the API ships
    // `converted_rate_date` so the tooltip names it instead of "today's rate".
    const rateDate = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0]
    await api.seedExchangeRate('CHF', 'EUR', '0.50', rateDate)

    const seeded = await api.seedBankAccount({
      account_name: 'CHF Vault',
      bank_name: 'FX Demo Bank',
      balance_amount: '400.00',
      balance_currency: 'CHF',
    })

    await page.goto('/dashboard/settings/banking')
    await page.waitForLoadState('networkidle')

    const card = page.locator('.account-card', { hasText: seeded.account_name })
    await expect(card).toBeVisible()

    // Still converts (best effort): 400 CHF * 0.50 = 200.00 EUR...
    await expect(card.getByTestId('amount-primary')).toContainText('200.00')
    const native = card.getByTestId('amount-native')
    await expect(native).toBeVisible()

    // ...but the tooltip names the REAL rate date — never "today's rate".
    await native.hover()
    const expectedDate = new Date(`${rateDate}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText('Actual account balance')
    await expect(tooltip).toContainText(`the rate of ${expectedDate}`)
  })

  test('same-currency account card renders a single line', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')

    const seeded = await api.seedBankAccount({
      account_name: 'EUR Checking',
      bank_name: 'FX Demo Bank',
      balance_amount: '1234.56',
      balance_currency: 'EUR',
    })

    await page.goto('/dashboard/settings/banking')
    await page.waitForLoadState('networkidle')

    const card = page.locator('.account-card', { hasText: seeded.account_name })
    await expect(card).toBeVisible()

    await expect(card.getByTestId('amount-primary')).toContainText('1,234.56')
    // No duplicate native line, no unavailable hint — one honest figure.
    await expect(card.getByTestId('amount-native')).toHaveCount(0)
    await expect(card.getByTestId('amount-rate-unavailable')).toHaveCount(0)
  })
})
