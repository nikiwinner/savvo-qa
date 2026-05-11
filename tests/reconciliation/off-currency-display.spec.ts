/**
 * Reconciliation — off-currency `AmountWithFx` rendering (Phase 10 fix-up)
 *
 * The reconciliation page wires `AmountWithFx` in 5 places (suggestion list,
 * alternatives drawer, confirmed-pair list, both sides). The existing specs
 * exercise the EUR-only happy path; this spec adds the missing off-currency
 * coverage so any regression in `converted_amount` plumbing on the
 * `ExpenseSerializer` / `BankTransactionSerializer` / `ExpenseBankLinkSerializer`
 * surfaces as a UI failure.
 *
 * Phase 07 invariant: a reconciliation pair must share a currency. So both
 * sides are seeded in USD; the viewing user is EUR. Both should render the
 * canonical $X.XX line plus a (≈ €Y.YY) hint via `AmountWithFx`.
 *
 * The QA backend points FX_PROVIDER_BASE_URL at an unreachable host, so the
 * USD->EUR rate is pre-seeded explicitly via `POST /api/seed/exchange-rate/`.
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const TODAY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-15`

test.describe('Reconciliation off-currency display (Phase 10 fix-up)', () => {
  test('off-currency suggestion pair renders the (≈ ...) hint on both sides', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.setUserCurrency('EUR')
    // Predictable USD->EUR rate so the hint value is deterministic.
    await api.seedExchangeRate('USD', 'EUR', '0.50', TODAY)

    const hh = await api.createHousehold('Off-Currency Recon')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Both rows in USD, matching by (amount, date) — the v1 algorithm matches
    // on equal (amount, currency) so both sides MUST share a currency
    // (Phase 07 invariant).
    const description = `recon-usd-${Date.now()}`
    await api.createExpense({
      household: hh.id,
      description,
      amount: 200,
      category: cat.id,
      type: 'expense',
      expense_date: TODAY,
      currency: 'USD',
    })

    await api.createBankTransaction({
      description: 'USD MERCHANT',
      merchant_display_name: 'USD MERCHANT',
      amount: '200.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: hh.id,
      category_id: cat.id,
      currency: 'USD',
    })

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const card = page.locator('.suggestion-card').first()
    await expect(card).toBeVisible({ timeout: 5000 })

    // Canonical USD line on both sides.
    await expect(card).toContainText('$')
    await expect(card).toContainText('200.00')

    // Two `[data-testid="amount-converted"]` lines should render — one per
    // side — each carrying the (≈ €100.00) hint (200 USD * 0.50 = 100 EUR).
    const converted = card.locator('[data-testid="amount-converted"]')
    await expect(converted).toHaveCount(2)

    for (const i of [0, 1]) {
      const text = await converted.nth(i).innerText()
      expect(text).toContain('€')
      expect(text).toMatch(/100\.00/)
      expect(text).toMatch(/≈/)
    }

    // No "rate unavailable" hint should appear — the rate IS available.
    await expect(card.locator('[data-testid="amount-rate-unavailable"]')).toHaveCount(0)
  })
})
