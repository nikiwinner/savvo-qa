/**
 * Uncategorized Filter (Phase 3)
 *
 * Tests that the category=none URL filter shows only uncategorized bank transactions,
 * and that categorizing a transaction causes it to disappear from the filtered view
 * on the next page load.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Uncategorized filter', () => {
  test('uncategorized filter shows only uncategorized bank transactions', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Uncat Filter Home')

    // Get a category to use for the pre-categorized txn
    const categories = await api.listCategories()
    const groceries = categories.find((c) => c.name === 'Groceries')

    // Seed one categorized and one uncategorized bank txn
    await api.createBankTransaction({
      description: 'HAS CATEGORY ALREADY',
      amount: '20.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
      category_id: groceries?.id ?? null,
    })

    await api.createBankTransaction({
      description: 'NO CATEGORY SET',
      amount: '30.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    // Navigate with ?category=none to filter to uncategorized only
    await page.goto(`/dashboard/transactions?space=${space.id}&category=none`)
    await page.waitForLoadState('networkidle')

    // Only the uncategorized txn should be visible
    await expect(page.locator('tbody tr.row-bank', { hasText: 'NO CATEGORY SET' })).toBeVisible()
    await expect(page.locator('tbody tr.row-bank', { hasText: 'HAS CATEGORY ALREADY' })).not.toBeVisible()
  })

  test('categorizing a transaction removes it from uncategorized view', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Uncat Remove Home')

    // Seed two uncategorized txns
    const txnA = await api.createBankTransaction({
      description: 'WILL BE CATEGORIZED',
      amount: '15.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    await api.createBankTransaction({
      description: 'STAYS UNCATEGORIZED',
      amount: '25.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    // Both start uncategorized → both appear under the ?category=none filter.
    await page.goto(`/dashboard/transactions?space=${space.id}&category=none`)
    await page.waitForLoadState('networkidle')
    const expenses = new ExpensesPage(page)
    const rowToBeCateg = page.locator('tbody tr.row-bank', { hasText: 'WILL BE CATEGORIZED' })
    await expect(rowToBeCateg).toBeVisible()
    await expect(page.locator('tbody tr.row-bank', { hasText: 'STAYS UNCATEGORIZED' })).toBeVisible()

    // The ?category=none filter is server-side: categorizing the row under the
    // active filter makes invalidateAll re-query the filtered feed, so the
    // now-categorized row drops straight out of the uncategorized view — which is
    // exactly the behaviour this test asserts.
    await expenses.categorizeRow(rowToBeCateg, 'Groceries')

    // WILL BE CATEGORIZED is gone from the uncategorized view; STAYS remains.
    await expect(page.locator('tbody tr.row-bank', { hasText: 'WILL BE CATEGORIZED' })).not.toBeVisible()
    await expect(page.locator('tbody tr.row-bank', { hasText: 'STAYS UNCATEGORIZED' })).toBeVisible()
  })
})
