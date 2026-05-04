/**
 * Reconciliation — Linked Badge + Hidden Bank Rows on /dashboard/expenses
 * (Phase 08, Story 8.2)
 *
 * Verifies:
 *  - Linked manual expense renders the "🔗 Linked" badge.
 *  - Linked bank txn is hidden from the table by default.
 *  - The "Show linked bank txns" filter reveals the hidden bank-txn row.
 *  - Clicking the badge opens a popover with an Unlink button; unlinking
 *    removes the badge and both rows render normally on reload.
 *  - Unlinked rows render without a badge.
 */
import { test, expect } from '../../fixtures/index'

test.describe('Linked badge + hidden bank rows on /dashboard/expenses', () => {
  test('linked manual expense shows the linked badge', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Badge Linked Expense')
    const categories = await api.listCategories()
    const cat = categories[0]

    const expense = await api.createExpense({
      household: hh.id,
      description: 'Linked manual expense BADGE-A',
      amount: 12.34,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-05-01',
    })
    const bankTxn = await api.createBankTransaction({
      description: 'BADGE-A BANK SHOP',
      merchant_display_name: 'BADGE-A BANK SHOP',
      amount: '12.34',
      type: 'expense',
      transaction_date: '2026-05-01',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })
    await api.createReconciliationLink(expense.id, bankTxn.id)

    await page.goto(`/dashboard/expenses?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Find the manual-expense row by description, then assert the badge is inside it
    const expenseRow = page.locator('tbody tr', {
      hasText: 'Linked manual expense BADGE-A',
    }).first()
    await expect(expenseRow).toBeVisible({ timeout: 5000 })
    const badge = expenseRow.locator('.badge-linked')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('Linked')
  })

  test('linked bank txn is hidden by default', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Badge Hidden Bank')
    const categories = await api.listCategories()
    const cat = categories[0]

    const expense = await api.createExpense({
      household: hh.id,
      description: 'Linked manual expense BADGE-B',
      amount: 22.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-05-02',
    })
    const bankTxn = await api.createBankTransaction({
      description: 'BADGE-B BANK SHOP',
      merchant_display_name: 'BADGE-B BANK SHOP',
      amount: '22.00',
      type: 'expense',
      transaction_date: '2026-05-02',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })
    await api.createReconciliationLink(expense.id, bankTxn.id)

    await page.goto(`/dashboard/expenses?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The manual side is visible
    await expect(
      page.locator('tbody tr', { hasText: 'Linked manual expense BADGE-B' }).first(),
    ).toBeVisible({ timeout: 5000 })

    // The bank-txn row is NOT in the DOM by default
    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'BADGE-B BANK SHOP' })
    await expect(bankRow).toHaveCount(0)
  })

  test('Show linked bank txns filter reveals the hidden half', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Badge Reveal Toggle')
    const categories = await api.listCategories()
    const cat = categories[0]

    const expense = await api.createExpense({
      household: hh.id,
      description: 'Linked manual expense BADGE-C',
      amount: 33.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-05-03',
    })
    const bankTxn = await api.createBankTransaction({
      description: 'BADGE-C BANK SHOP',
      merchant_display_name: 'BADGE-C BANK SHOP',
      amount: '33.00',
      type: 'expense',
      transaction_date: '2026-05-03',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })
    await api.createReconciliationLink(expense.id, bankTxn.id)

    await page.goto(`/dashboard/expenses?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Hidden by default
    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'BADGE-C BANK SHOP' })
    await expect(bankRow).toHaveCount(0)

    // Toggle the filter
    const toggle = page.locator('input[aria-label="Show linked bank transactions"]')
    await expect(toggle).toBeVisible()
    await toggle.check()

    // Bank-txn row appears, with its own linked badge
    await expect(bankRow).toHaveCount(1, { timeout: 5000 })
    await expect(bankRow.locator('.badge-linked')).toBeVisible()
  })

  test('unlink from popover removes the link', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Badge Unlink Popover')
    const categories = await api.listCategories()
    const cat = categories[0]

    const expense = await api.createExpense({
      household: hh.id,
      description: 'Linked manual expense BADGE-D',
      amount: 44.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-05-04',
    })
    const bankTxn = await api.createBankTransaction({
      description: 'BADGE-D BANK SHOP',
      merchant_display_name: 'BADGE-D BANK SHOP',
      amount: '44.00',
      type: 'expense',
      transaction_date: '2026-05-04',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })
    await api.createReconciliationLink(expense.id, bankTxn.id)

    await page.goto(`/dashboard/expenses?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const expenseRow = page.locator('tbody tr', {
      hasText: 'Linked manual expense BADGE-D',
    }).first()
    const badge = expenseRow.locator('.badge-linked')
    await expect(badge).toBeVisible({ timeout: 5000 })

    // Open popover
    await badge.click()
    const popover = page.locator('.link-popover')
    await expect(popover).toBeVisible()

    const unlinkBtn = popover.locator('.btn-unlink')
    await expect(unlinkBtn).toBeVisible()
    await unlinkBtn.click()

    // Wait for popover to close (signal of completion) and links list to drain
    await expect(popover).toHaveCount(0, { timeout: 5000 })
    await expect.poll(async () => (await api.listReconciliationLinks(hh.id)).count, {
      timeout: 5000,
    }).toBe(0)

    // Reload to confirm persistence
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Manual expense row still present, no badge
    const reloadedExpense = page.locator('tbody tr', {
      hasText: 'Linked manual expense BADGE-D',
    }).first()
    await expect(reloadedExpense).toBeVisible()
    await expect(reloadedExpense.locator('.badge-linked')).toHaveCount(0)

    // Bank-txn row now visible by default (no longer linked, no longer hidden)
    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'BADGE-D BANK SHOP' })
    await expect(bankRow).toHaveCount(1)
    await expect(bankRow.locator('.badge-linked')).toHaveCount(0)
  })

  test('unlinked rows show no badge', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Badge Unlinked Control')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createExpense({
      household: hh.id,
      description: 'Plain unlinked expense BADGE-E',
      amount: 5.55,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-05-05',
    })

    await page.goto(`/dashboard/expenses?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const expenseRow = page.locator('tbody tr', {
      hasText: 'Plain unlinked expense BADGE-E',
    }).first()
    await expect(expenseRow).toBeVisible({ timeout: 5000 })
    await expect(expenseRow.locator('.badge-linked')).toHaveCount(0)
  })
})
