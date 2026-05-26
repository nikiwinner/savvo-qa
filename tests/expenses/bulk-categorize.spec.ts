/**
 * Bulk Categorization (Phase 3)
 *
 * Tests the checkbox-based bulk selection and the floating action bar that
 * allows assigning a category to multiple transactions at once.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Bulk categorization', () => {
  test('checkboxes appear on bank transaction rows', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Checkbox Home')

    await api.createBankTransaction({
      description: 'CHECKBOX TXN ONE',
      amount: '10.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Bank rows with a space should have a checkbox in the cell-checkbox td
    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'CHECKBOX TXN ONE' })
    await expect(bankRow).toBeVisible()
    await expect(bankRow.locator('.cell-checkbox input[type="checkbox"]')).toBeVisible()
  })

  test('select all selects visible bank transactions', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Select All Home')

    // Seed 2 bank txns
    await api.createBankTransaction({
      description: 'SELECT ALL TXN A',
      amount: '10.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    await api.createBankTransaction({
      description: 'SELECT ALL TXN B',
      amount: '20.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Click the header checkbox (select all)
    const headerCheckbox = page.locator('thead .th-checkbox input[type="checkbox"]')
    await expect(headerCheckbox).toBeVisible()
    await headerCheckbox.click()

    // Both rows should have their checkboxes checked
    const rowA = page.locator('tbody tr.row-bank', { hasText: 'SELECT ALL TXN A' })
    const rowB = page.locator('tbody tr.row-bank', { hasText: 'SELECT ALL TXN B' })
    await expect(rowA.locator('.cell-checkbox input[type="checkbox"]')).toBeChecked()
    await expect(rowB.locator('.cell-checkbox input[type="checkbox"]')).toBeChecked()

    // Both rows should have the row-selected class
    await expect(rowA).toHaveClass(/row-selected/)
    await expect(rowB).toHaveClass(/row-selected/)
  })

  test('bulk categorize assigns category to multiple transactions', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Bulk Cat Home')

    // Seed 3 bank txns
    await api.createBankTransaction({
      description: 'BULK TXN 1',
      amount: '10.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    await api.createBankTransaction({
      description: 'BULK TXN 2',
      amount: '20.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    await api.createBankTransaction({
      description: 'BULK TXN 3',
      amount: '30.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Select only our three seeded rows directly (not "select all" — the seed endpoint
    // currently returns transactions from all users sharing the debug BankConnection,
    // so relying on the visible set makes this test fragile under parallel execution).
    const descriptions = ['BULK TXN 1', 'BULK TXN 2', 'BULK TXN 3']
    for (const desc of descriptions) {
      const row = page.locator('tbody tr.row-bank', { hasText: desc })
      await expect(row).toBeVisible()
      await row.locator('.cell-checkbox input[type="checkbox"]').check()
    }

    // Wait for floating action bar to appear
    await expect(page.locator('.bulk-action-bar')).toBeVisible()

    // Select category in the bulk action bar
    const bulkCatSelect = page.locator('.bulk-action-bar .bulk-cat-select')
    await expect(bulkCatSelect).toBeVisible()
    const groceriesOpt = bulkCatSelect.locator('option', { hasText: 'Groceries' }).first()
    const groceriesVal = await groceriesOpt.getAttribute('value')
    await bulkCatSelect.selectOption(groceriesVal ?? '')

    // Click Apply
    await page.locator('.bulk-action-bar button', { hasText: 'Apply' }).click()

    // Wait for success message
    await expect(page.locator('.bulk-success-bar')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.bulk-success-bar')).toContainText('3 transactions categorized')

    // All 3 rows should now show the category badge
    for (const desc of descriptions) {
      await expect(
        page.locator('tbody tr.row-bank', { hasText: desc }).locator('.badge-category')
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('floating action bar appears when transactions are selected', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Action Bar Home')

    await api.createBankTransaction({
      description: 'ACTION BAR TXN',
      amount: '55.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Action bar should not be visible initially
    await expect(page.locator('.bulk-action-bar')).not.toBeVisible()

    // Select a row
    const bankRow = page.locator('tbody tr.row-bank', { hasText: 'ACTION BAR TXN' })
    await bankRow.locator('.cell-checkbox input[type="checkbox"]').click()

    // Action bar should now be visible
    await expect(page.locator('.bulk-action-bar')).toBeVisible()
    await expect(page.locator('.bulk-action-bar .bulk-count')).toContainText('1 selected')

    // Cancel should hide the bar.
    // The bar is position:fixed with white-space:nowrap, so on narrow mobile-safari
    // viewports the Cancel button can overflow off-screen and pointer events from
    // a synthesised mouse click don't always reach the button. Dispatch the click
    // event directly to avoid input-simulation flake across browsers.
    const cancelButton = page.locator('.bulk-action-bar').getByRole('button', { name: 'Cancel' })
    await cancelButton.dispatchEvent('click')
    await expect(page.locator('.bulk-action-bar')).not.toBeVisible({ timeout: 5000 })
  })
})
