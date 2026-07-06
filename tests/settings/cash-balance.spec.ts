/**
 * Cash-balance entry — Banking settings (Phase 25, Story 25.5)
 *
 * The guarded cash-balance write surface (`PATCH /api/bank-accounts/<id>/balance/`)
 * is the ONLY way a user tells Savvo how much cash they hold — the number Net
 * Wealth folds in. It touches ONLY the user's own cash account; real bank
 * balances stay Tink-owned/read-only.
 *
 * These specs cover the settings-page control end-to-end:
 *   • a cash account's amount + currency Save persists (PATCH 200) and the value
 *     re-renders after `invalidateAll()` / reload;
 *   • a REAL bank account (seeded via `seedBankAccount`) shows NO editable balance
 *     control — its balance is read-only inside the connection card;
 *   • the server guard rejects a PATCH on a real bank account (400) — the write
 *     surface is minimal and guarded.
 *
 * Every user is auto-provisioned exactly ONE cash account at signup, so the cash
 * section renders for a fresh `loggedInPage` user with no seeding. URLs come from
 * `process.env.BACKEND_URL/FRONTEND_URL` (via the ApiHelper / baseURL) — never a
 * hard-coded :8000/:5173.
 */
import { test, expect } from '../../fixtures/index'

test.describe('Banking settings — cash-balance entry', () => {
  test('a cash account balance can be entered and persists', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage

    // Regression guard: the cash-balance control must not throw a client error
    // when edited. A draft-coercion bug (a `type="number"` binding coercing the
    // draft to a number, so a later `.trim()` blew up and the Save button never
    // enabled) was caught ONCE during Phase-25 development and fixed before ship —
    // this `pageerror` listener guards that whole class of bugs from regressing.
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await page.goto('/dashboard/settings/banking')

    // The auto-provisioned cash account renders its balance-entry control.
    const amountInput = page.getByTestId('cash-balance-input')
    await expect(amountInput.first()).toBeVisible({ timeout: 30_000 })

    // Enter an amount + currency and Save. The button unlocks only when the draft
    // differs from the loaded (empty) balance, so filling the input enables it.
    await amountInput.first().fill('1234.56')
    await page.getByTestId('cash-balance-currency').first().selectOption('EUR')
    expect(pageErrors, `cash-balance edit threw in the browser: ${pageErrors.join('; ')}`).toEqual([])

    const saveBtn = page.getByTestId('cash-balance-save').first()
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    // The PATCH persisted (assert on the real API — the value is a real
    // BankAccount.balance_amount now, not a client illusion).
    await expect
      .poll(async () => (await api.cashAccount()).balance_amount, { timeout: 30_000 })
      .toBe('1234.56')

    // No inline error rendered — asserted AFTER the persistence poll so the PATCH
    // has actually resolved (asserting mid-flight would pass before an error could
    // render). And no save-time exception threw in the browser.
    await expect(page.getByTestId('cash-balance-error')).toHaveCount(0)
    expect(pageErrors, `cash-balance save threw in the browser: ${pageErrors.join('; ')}`).toEqual([])

    // Reload → the saved value re-renders in the input (seeded from the load).
    await page.reload()
    await expect(page.getByTestId('cash-balance-input').first()).toHaveValue('1234.56', {
      timeout: 30_000,
    })
  })

  test('the entered balance drives the Net Wealth read endpoint', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage

    // Same regression guard as above — the draft-coercion class of bug (fixed
    // before ship) would throw in the browser, so this `pageerror` listener catches
    // any regression fast instead of timing out on a Save button that never enables.
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await page.goto('/dashboard/settings/banking')
    const amountInput = page.getByTestId('cash-balance-input').first()
    await expect(amountInput).toBeVisible({ timeout: 30_000 })
    await amountInput.fill('500.00')
    await page.getByTestId('cash-balance-currency').first().selectOption('EUR')
    expect(pageErrors, `cash-balance edit threw in the browser: ${pageErrors.join('; ')}`).toEqual([])

    const saveBtn = page.getByTestId('cash-balance-save').first()
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    // The entered cash balance is now the whole (traceable) Net Wealth total.
    await expect
      .poll(async () => (await api.getNetWealth()).total, { timeout: 30_000 })
      .toBe('500.00')
    const detail = await api.getNetWealth()
    expect(detail.accounts_known).toBe(1)
    expect(detail.accounts.some((a) => a.bank_name === 'Cash' && a.balance === '500.00')).toBe(true)

    // No save-time exception threw in the browser — re-assert at the END (after the
    // persistence poll) so an error raised during the in-flight PATCH is caught.
    expect(pageErrors, `cash-balance save threw in the browser: ${pageErrors.join('; ')}`).toEqual([])
  })

  test('a real bank account shows no editable balance control', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage

    // Seed a real bank account (has a connection → is_cash=false).
    const seeded = await api.seedBankAccount({
      account_name: 'QA Checking',
      bank_name: 'QA Bank',
      balance_amount: '999.00',
      balance_currency: 'EUR',
    })

    await page.goto('/dashboard/settings/banking')

    // The connection card renders the real account with a READ-ONLY balance —
    // no cash-balance input inside it.
    const bankAccountCard = page.locator('.account-card', { hasText: 'QA Checking' })
    await expect(bankAccountCard).toBeVisible({ timeout: 30_000 })
    await expect(bankAccountCard.getByTestId('cash-balance-input')).toHaveCount(0)
    await expect(bankAccountCard.getByTestId('cash-balance-save')).toHaveCount(0)

    // The ONLY cash-balance control on the page belongs to the cash account
    // (exactly one — the auto-provisioned cash account), never the bank account.
    await expect(page.getByTestId('cash-balance-input')).toHaveCount(1)

    // Server guard: the guarded PATCH rejects a real bank account (Tink-owned) —
    // 400, never a silent write.
    const res = await api.updateCashBalanceRaw(seeded.account_id, '1.00', 'EUR')
    expect(res.status()).toBe(400)
  })
})
