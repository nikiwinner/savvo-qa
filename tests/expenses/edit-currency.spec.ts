/**
 * Expenses — editable currency on manual expenses (Phase 10, Story 10.5)
 *
 * Verifies:
 *   1. Persist path — saving a currency change on a manual expense submits
 *                    immediately (no confirmation dialog) and the new currency
 *                    lands server-side.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TARGET_DATE = '2026-05-15' // matches the seed pattern from per-row tests

test.describe('Editable currency on /dashboard/transactions (Story 10.5)', () => {
  test('currency change on a manual expense submits immediately and persists', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Currency Persist Home')

    const description = `currency-persist-${Date.now()}`
    const created = await api.createExpense({
      space: space.id,
      description,
      amount: 12.5,
      type: 'expense',
      expense_date: TARGET_DATE,
    })
    const createdId = Number(created.id)

    const expenses = new ExpensesPage(page)
    // Feed defaults to "this month" (shared dashboard period model); the seed
    // row is dated 2026-05-15, so pin ?preset=all to keep this currency test
    // period-agnostic.
    await page.goto(`/dashboard/transactions?space=${space.id}&preset=all`)
    await page.waitForLoadState('networkidle')

    await expenses.openEditModal(description)
    const editModal = expenses.editModal()
    const currencySelect = editModal.locator('#edit-currency')
    await expect(currencySelect).toBeVisible()
    await expect(currencySelect).toBeEnabled()

    await currencySelect.evaluate((el) => {
      const select = el as HTMLSelectElement
      select.value = 'USD'
      select.dispatchEvent(new Event('input', { bubbles: true }))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(currencySelect).toHaveValue('USD')

    // Save submits immediately — no confirmation dialog.
    const responsePromise = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('?/update'),
    )
    await editModal.locator('.edit-modal-actions button', { hasText: 'Save' }).click()
    const submitRes = await responsePromise
    expect(submitRes.status()).toBe(200)

    // Authoritative check via API.
    await expect
      .poll(
        async () => {
          const status = await api.getExpenseStatus(createdId)
          if (status !== 200) return null
          const all = await api.listExpenses()
          const updated = all.find((e) => Number(e.id) === createdId)
          return (updated as unknown as { currency?: string } | undefined)?.currency ?? null
        },
        { timeout: 5000 },
      )
      .toBe('USD')
  })
})
