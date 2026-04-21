/**
 * Uncategorized Filter (Phase 3)
 *
 * Tests that the category=none URL filter shows only uncategorized bank transactions,
 * and that categorizing a transaction causes it to disappear from the filtered view
 * on the next page load.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Uncategorized filter', () => {
  test('uncategorized filter shows only uncategorized bank transactions', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Uncat Filter Home')

    // Get a category to use for the pre-categorized txn
    const categories = await api.listCategories()
    const groceries = categories.find((c) => c.name === 'Groceries')

    // Seed one categorized and one uncategorized bank txn
    await api.createBankTransaction({
      description: 'HAS CATEGORY ALREADY',
      amount: '20.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: household.id,
      category_id: groceries?.id ?? null,
    })

    await api.createBankTransaction({
      description: 'NO CATEGORY SET',
      amount: '30.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: household.id,
    })

    // Navigate with ?category=none to filter to uncategorized only
    await page.goto(`/dashboard/expenses?household=${household.id}&category=none`)
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
    const household = await api.createHousehold('Uncat Remove Home')

    // Seed two uncategorized txns
    const txnA = await api.createBankTransaction({
      description: 'WILL BE CATEGORIZED',
      amount: '15.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: household.id,
    })

    await api.createBankTransaction({
      description: 'STAYS UNCATEGORIZED',
      amount: '25.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: household.id,
    })

    // Open expenses page with uncategorized filter active
    await page.goto(`/dashboard/expenses?household=${household.id}&category=none`)
    await page.waitForLoadState('networkidle')

    // Both rows should be visible
    const rowToBeCateg = page.locator('tbody tr.row-bank', { hasText: 'WILL BE CATEGORIZED' })
    await expect(rowToBeCateg).toBeVisible()
    await expect(page.locator('tbody tr.row-bank', { hasText: 'STAYS UNCATEGORIZED' })).toBeVisible()

    // Categorize the first txn via its dropdown — get the Groceries option value
    const catSelect = rowToBeCateg.locator('select.cat-select')
    await expect(catSelect).toBeVisible()
    const groceriesOpt = catSelect.locator('option', { hasText: 'Groceries' }).first()
    const groceriesVal = await groceriesOpt.getAttribute('value')
    await catSelect.selectOption(groceriesVal ?? '')

    // Wait for the network call to succeed — badge should appear
    await expect(rowToBeCateg.locator('.badge-category')).toBeVisible({ timeout: 5000 })

    // Reload the page with the same filter — the categorized txn should not appear
    await page.goto(`/dashboard/expenses?household=${household.id}&category=none`)
    await page.waitForLoadState('networkidle')

    // WILL BE CATEGORIZED is gone; STAYS UNCATEGORIZED remains
    await expect(page.locator('tbody tr.row-bank', { hasText: 'WILL BE CATEGORIZED' })).not.toBeVisible()
    await expect(page.locator('tbody tr.row-bank', { hasText: 'STAYS UNCATEGORIZED' })).toBeVisible()
  })
})
