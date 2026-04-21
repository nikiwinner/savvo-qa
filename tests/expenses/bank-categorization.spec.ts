/**
 * Bank Transaction Categorization (Phase 3)
 *
 * Tests that bank transactions show the correct category UI elements and that
 * the categorize flow works end-to-end.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Bank transaction categorization', () => {
  test('bank transaction shows category dropdown when uncategorized', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Cat Dropdown Home')

    // Seed an uncategorized bank transaction assigned to the household
    await api.createBankTransaction({
      description: 'UNCATEGORIZED MERCHANT',
      amount: '25.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: household.id,
    })

    await page.goto(`/dashboard/expenses?household=${household.id}`)
    await page.waitForLoadState('networkidle')

    // The bank row should have a .cat-select dropdown (not a badge-category)
    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'UNCATEGORIZED MERCHANT' })
    await expect(bankRow).toBeVisible()
    await expect(bankRow.locator('select.cat-select')).toBeVisible()
  })

  test('selecting a category assigns it to the bank transaction', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Cat Assign Home')

    await api.createBankTransaction({
      description: 'MERCHANT TO CATEGORIZE',
      amount: '50.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: household.id,
    })

    await page.goto(`/dashboard/expenses?household=${household.id}`)
    await page.waitForLoadState('networkidle')

    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'MERCHANT TO CATEGORIZE' })
    await expect(bankRow).toBeVisible()

    // Select "Groceries" from the cat-select dropdown
    const catSelect = bankRow.locator('select.cat-select')
    await expect(catSelect).toBeVisible()
    // Find the Groceries option value and select by value to avoid regex label issue
    const groceriesOption = catSelect.locator('option', { hasText: 'Groceries' }).first()
    const groceriesValue = await groceriesOption.getAttribute('value')
    await catSelect.selectOption(groceriesValue ?? '')

    // Wait for the async call to finish — the row should now show a badge-category
    await expect(bankRow.locator('.badge-category')).toBeVisible({ timeout: 5000 })
    await expect(bankRow.locator('.badge-category')).toContainText('Groceries')

    // The dropdown should be gone (replaced by the badge + change button)
    await expect(bankRow.locator('select.cat-select')).not.toBeVisible()
  })

  test('merchant_display_name is shown when set', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Merchant Display Home')

    await api.createBankTransaction({
      description: 'RAW_MERCHANT_CODE_XYZ',
      amount: '12.99',
      type: 'expense',
      transaction_date: TODAY,
      household_id: household.id,
      merchant_display_name: 'Friendly Merchant Name',
    })

    await page.goto(`/dashboard/expenses?household=${household.id}`)
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
    const household = await api.createHousehold('Fallback Chain Home')

    // Create a txn with a provider_category but no app category
    await api.createBankTransaction({
      description: 'PROVIDER CAT MERCHANT',
      amount: '8.50',
      type: 'expense',
      transaction_date: TODAY,
      household_id: household.id,
      provider_category_code: 'food-groceries',
    })

    await page.goto(`/dashboard/expenses?household=${household.id}`)
    await page.waitForLoadState('networkidle')

    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'PROVIDER CAT MERCHANT' })
    await expect(bankRow).toBeVisible()

    // Should show badge-bank-cat (provider category), not badge-none
    await expect(bankRow.locator('.badge-bank-cat')).toBeVisible()
    await expect(bankRow.locator('.badge-none')).not.toBeVisible()
  })
})
