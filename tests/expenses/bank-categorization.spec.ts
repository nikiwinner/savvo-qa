/**
 * Bank Transaction Categorization (Phase 3)
 *
 * Tests that bank transactions show the correct category UI elements and that
 * the categorize flow works end-to-end.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Bank transaction categorization', () => {
  test('bank transaction shows a set-category control when uncategorized', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Cat Dropdown Home')

    // Seed an uncategorized bank transaction assigned to the space
    await api.createBankTransaction({
      description: 'UNCATEGORIZED MERCHANT',
      amount: '25.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // The bank row shows a .cat-map-btn (opens the category modal) and no
    // assigned category badge yet.
    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'UNCATEGORIZED MERCHANT' })
    await expect(bankRow).toBeVisible()
    await expect(bankRow.locator('.cat-map-btn')).toBeVisible()
    await expect(bankRow.locator('.badge-category')).not.toBeVisible()
  })

  test('selecting a category assigns it to the bank transaction', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Cat Assign Home')

    await api.createBankTransaction({
      description: 'MERCHANT TO CATEGORIZE',
      amount: '50.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const expenses = new ExpensesPage(page)
    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'MERCHANT TO CATEGORIZE' })
    await expect(bankRow).toBeVisible()

    // Set "Groceries" via the category modal.
    await expenses.categorizeRow(bankRow, 'Groceries')

    // The async categorize call finishes — the row should show a badge-category.
    await expect(bankRow.locator('.badge-category')).toBeVisible({ timeout: 5000 })
    await expect(bankRow.locator('.badge-category')).toContainText('Groceries')
  })

  test('merchant_display_name is shown when set', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Merchant Display Home')

    await api.createBankTransaction({
      description: 'RAW_MERCHANT_CODE_XYZ',
      amount: '12.99',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
      merchant_display_name: 'Friendly Merchant Name',
    })

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // The cell-desc should show the display name, not the raw description
    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'Friendly Merchant Name' })
    await expect(bankRow).toBeVisible()
    await expect(bankRow.locator('.cell-desc')).toContainText('Friendly Merchant Name')
    await expect(bankRow.locator('.cell-desc')).not.toContainText('RAW_MERCHANT_CODE_XYZ')
  })

  test('category fallback chain: shows provider category when no app category set', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Fallback Chain Home')

    // Create a txn with a provider_category but no app category
    await api.createBankTransaction({
      description: 'PROVIDER CAT MERCHANT',
      amount: '8.50',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
      provider_category_code: 'food-groceries',
    })

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'PROVIDER CAT MERCHANT' })
    await expect(bankRow).toBeVisible()

    // Should show badge-bank-cat (provider category), not badge-none
    await expect(bankRow.locator('.badge-bank-cat')).toBeVisible()
    await expect(bankRow.locator('.badge-none')).not.toBeVisible()
  })
})
