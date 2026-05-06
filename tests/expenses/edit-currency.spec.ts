/**
 * Expenses — editable currency on unlinked manual expenses (Phase 08, Story 8.8)
 *
 * Verifies that the inline edit form on /dashboard/expenses exposes a currency
 * dropdown, that changing it persists across reload, and that the dropdown is
 * disabled when the expense is linked to a bank transaction (the reconciliation
 * currency-equality invariant must not be broken in the UI).
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

test.describe('Editable currency on /dashboard/expenses', () => {
  test('editing currency on unlinked manual expense persists across reload', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    // Default user.currency is 'EUR'; new expenses snapshot it at create-time.
    const household = await api.createHousehold('Edit Currency Home')
    const description = `edit-currency-${Date.now()}`
    const created = await api.createExpense({
      household: household.id,
      description,
      amount: 12.5,
      type: 'expense',
      expense_date: '2026-05-15',
    })
    const createdId = Number(created.id)

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?household=${household.id}`)
    await page.waitForLoadState('networkidle')

    // Open inline edit form for the row.
    await expenses.row(description).locator('.action-btn[title="Edit"]').click()
    const editRow = page.locator('tr.edit-row')
    const currencySelect = editRow.locator('select[name="currency"]')
    await expect(currencySelect).toBeVisible()
    await expect(currencySelect).toBeEnabled()

    // Change to USD and save. WebKit/mobile sometimes won't update a native
    // <select> via selectOption(), so set the value imperatively and fire
    // both 'input' and 'change' events for full compatibility.
    await currencySelect.evaluate((el) => {
      const select = el as HTMLSelectElement
      select.value = 'USD'
      select.dispatchEvent(new Event('input', { bubbles: true }))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(currencySelect).toHaveValue('USD')

    // Wait for the SvelteKit form action to complete (200 OK).
    const responsePromise = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('?/update'),
    )
    await editRow.locator('button', { hasText: 'Save' }).click()
    const submitRes = await responsePromise
    expect(submitRes.status()).toBe(200)

    // Authoritative check: hit the backend directly and read the snapshot.
    // Use a polling expect to ride out any commit-vs-read latency on slower
    // viewport projects (mobile-safari runs the same Django dev server but
    // sometimes wins the race against the action's PATCH).
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

    // Reload and verify the row renders with the USD symbol on viewports
    // where the table is fully visible.
    await page.reload()
    await page.waitForLoadState('networkidle')
    const row = expenses.row(description)
    await expect(row).toBeVisible({ timeout: 5000 })
    const amountCell = row.locator('td.cell-amount')
    const amountText = await amountCell.innerText()
    expect(amountText).toContain('$')
    expect(amountText).not.toContain('€')
  })

  test('currency dropdown is disabled on linked expense', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Linked Currency Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    const description = `linked-currency-${Date.now()}`
    const expense = await api.createExpense({
      household: household.id,
      description,
      amount: 42.5,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-04-12',
    })
    const bankTxn = await api.createBankTransaction({
      description: `linked-currency-bank-${Date.now()}`,
      merchant_display_name: 'BANK MERCHANT',
      amount: '42.50',
      type: 'expense',
      transaction_date: '2026-04-12',
      household_id: household.id,
      category_id: cat.id,
      currency: 'EUR',
    })
    await api.createReconciliationLink(Number(expense.id), bankTxn.id)

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?household=${household.id}`)
    await page.waitForLoadState('networkidle')

    await expenses.row(description).locator('.action-btn[title="Edit"]').click()
    const editRow = page.locator('tr.edit-row')
    const currencySelect = editRow.locator('select[name="currency"]')
    await expect(currencySelect).toBeVisible()
    await expect(currencySelect).toBeDisabled()
  })
})
