/**
 * Expenses — editable currency on unlinked manual expenses (Phase 10, Story 10.5)
 *
 * Verifies:
 *   1. Modal path  — saving a currency change on an expense whose month
 *                    HAS a budget shows the confirmation dialog and only
 *                    PATCHes after the user confirms.
 *   2. No-modal path — saving a currency change on an expense whose month
 *                    has NO budget proceeds without the dialog.
 *   3. Cancel path — clicking Cancel on the modal aborts the save (no PATCH
 *                    is dispatched, the row keeps its original currency).
 *   4. Disabled state — the currency control is disabled and exposes the
 *                    documented tooltip when the expense is linked to a
 *                    bank transaction (the reconciliation currency-equality
 *                    invariant must not be broken via the UI).
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TARGET_DATE = '2026-05-15' // matches the seed pattern from per-row tests
const TARGET_YEAR = 2026
const TARGET_MONTH = 5
const OTHER_YEAR = 2026
const OTHER_MONTH = 7 // a month that has no budget for the no-modal path

test.describe('Editable currency on /dashboard/expenses (Story 10.5)', () => {
  test('modal path — currency change in a budgeted month shows confirm dialog and persists on Continue', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Modal Path Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Seed a budget for the same (year, month) as the expense so the
    // expense_date.slice(0,7) lookup hits the budgeted-months set.
    await api.createBudget({
      household: household.id,
      category: cat.id,
      amount: '500.00',
      year: TARGET_YEAR,
      month: TARGET_MONTH,
    })

    const description = `modal-currency-${Date.now()}`
    const created = await api.createExpense({
      household: household.id,
      description,
      amount: 12.5,
      type: 'expense',
      expense_date: TARGET_DATE,
    })
    const createdId = Number(created.id)

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?household=${household.id}`)
    await page.waitForLoadState('networkidle')

    await expenses.row(description).locator('.action-btn[title="Edit"]').click()
    const editRow = page.locator('tr.edit-row')
    const currencySelect = editRow.locator('select[name="currency"]')
    await expect(currencySelect).toBeVisible()
    await expect(currencySelect).toBeEnabled()

    await currencySelect.evaluate((el) => {
      const select = el as HTMLSelectElement
      select.value = 'USD'
      select.dispatchEvent(new Event('input', { bubbles: true }))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(currencySelect).toHaveValue('USD')

    // Click Save — the modal should appear instead of the form submitting.
    await editRow.locator('button', { hasText: 'Save' }).click()

    // Locate the recompute-warning dialog (NOT the delete one — there is no
    // pending delete in this test). We match by the exact title text to
    // avoid colliding with any other dialog shape.
    const dialog = page.locator('[role="dialog"]', { hasText: 'Recalculate budget?' })
    await expect(dialog).toBeVisible()
    // Message includes the expanded month label — verifies monthLabelFromYyyyMm.
    await expect(dialog).toContainText('May 2026')

    // Confirm — the form should now submit and the PATCH should land.
    const responsePromise = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('?/update'),
    )
    await dialog.locator('button', { hasText: 'Continue' }).click()
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

  test('no-modal path — currency change in a non-budgeted month proceeds without the dialog', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('No Modal Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Seed a budget in a DIFFERENT month from the expense → no overlap.
    await api.createBudget({
      household: household.id,
      category: cat.id,
      amount: '500.00',
      year: OTHER_YEAR,
      month: OTHER_MONTH,
    })

    const description = `nomodal-currency-${Date.now()}`
    const created = await api.createExpense({
      household: household.id,
      description,
      amount: 12.5,
      type: 'expense',
      expense_date: TARGET_DATE,
    })
    const createdId = Number(created.id)

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?household=${household.id}`)
    await page.waitForLoadState('networkidle')

    await expenses.row(description).locator('.action-btn[title="Edit"]').click()
    const editRow = page.locator('tr.edit-row')
    const currencySelect = editRow.locator('select[name="currency"]')

    await currencySelect.evaluate((el) => {
      const select = el as HTMLSelectElement
      select.value = 'USD'
      select.dispatchEvent(new Event('input', { bubbles: true }))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const responsePromise = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('?/update'),
    )
    await editRow.locator('button', { hasText: 'Save' }).click()
    const submitRes = await responsePromise
    expect(submitRes.status()).toBe(200)

    // The recompute dialog must NOT appear at any point.
    await expect(
      page.locator('[role="dialog"]', { hasText: 'Recalculate budget?' }),
    ).toHaveCount(0)

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

  test('cancel path — clicking Cancel on the modal aborts the save and currency stays unchanged', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Cancel Path Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: household.id,
      category: cat.id,
      amount: '500.00',
      year: TARGET_YEAR,
      month: TARGET_MONTH,
    })

    const description = `cancel-currency-${Date.now()}`
    const created = await api.createExpense({
      household: household.id,
      description,
      amount: 12.5,
      type: 'expense',
      expense_date: TARGET_DATE,
    })
    const createdId = Number(created.id)

    // Start watching for any update PATCH; we will assert that it never fired.
    let updateRequestSeen = false
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('?/update')) {
        updateRequestSeen = true
      }
    })

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?household=${household.id}`)
    await page.waitForLoadState('networkidle')

    await expenses.row(description).locator('.action-btn[title="Edit"]').click()
    const editRow = page.locator('tr.edit-row')
    const currencySelect = editRow.locator('select[name="currency"]')

    await currencySelect.evaluate((el) => {
      const select = el as HTMLSelectElement
      select.value = 'USD'
      select.dispatchEvent(new Event('input', { bubbles: true }))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await editRow.locator('button', { hasText: 'Save' }).click()

    const dialog = page.locator('[role="dialog"]', { hasText: 'Recalculate budget?' })
    await expect(dialog).toBeVisible()
    await dialog.locator('button', { hasText: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    // Give the page a beat; nothing should have been dispatched.
    await page.waitForTimeout(300)
    expect(updateRequestSeen).toBe(false)

    // Server-side currency unchanged.
    const all = await api.listExpenses()
    const row = all.find((e) => Number(e.id) === createdId) as
      | (typeof all[number] & { currency?: string })
      | undefined
    expect(row?.currency ?? null).toBe('EUR')
  })

  test('disabled state — currency picker is disabled with documented tooltip on a linked expense', async ({
    page,
    loggedInPage,
  }) => {
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

    // Documented tooltip text from Implementation Rule #3 / Story 10.5 fix #3.
    const titleAttr = await currencySelect.getAttribute('title')
    expect(titleAttr).toBe('Unlink first to change currency.')
  })
})
