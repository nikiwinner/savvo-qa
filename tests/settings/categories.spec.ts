/**
 * Categories Settings Page (Phase 3)
 *
 * Tests the categories CRUD page at /dashboard/settings/categories/
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Categories settings page', () => {
  test('categories page is accessible from settings', async ({ page, loggedInPage }) => {
    // Just need to be logged in — categories are global
    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1', { hasText: 'Categories' })).toBeVisible()
  })

  test('lists all categories with usage counts', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    // Create a household to seed default categories
    const household = await api.createHousehold('Usage Count Home')

    // Create an expense using Groceries category to bump usage count
    const categories = await api.listCategories()
    const groceries = categories.find((c) => c.name === 'Groceries')
    if (groceries) {
      await api.createExpense({
        household: household.id,
        description: 'Usage Test Expense',
        amount: 10,
        expense_date: TODAY,
        category: groceries.id,
      })
    }

    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    // Table should be visible with rows
    await expect(page.locator('table')).toBeVisible()
    // At least one row for Groceries
    await expect(page.locator('tbody tr', { hasText: 'Groceries' })).toBeVisible()

    // If we added an expense with Groceries, the usage column should be non-empty
    if (groceries) {
      const groceriesRow = page.locator('tbody tr', { hasText: 'Groceries' })
      const usageText = await groceriesRow.locator('.usage-text').textContent()
      // Should contain "1 expense" or "1 transaction" — just check it's not "—"
      expect(usageText).not.toBe('—')
    }
  })

  test('can create a new category', async ({ page, loggedInPage }) => {
    const uniqueName = `E2E Cat ${Date.now()}`

    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    // Click "New Category"
    await page.locator('button.btn-create', { hasText: 'New Category' }).click()
    await expect(page.locator('.form-panel')).toBeVisible()

    // Fill in the form
    await page.locator('#create-name').fill(uniqueName)
    await page.locator('#create-icon').fill('🎯')

    // Submit
    await page.locator('.form-panel button.btn-create', { hasText: 'Create Category' }).click()

    // Success message
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.alert-success')).toContainText(uniqueName)

    // Category appears in the table
    await expect(page.locator('tbody tr', { hasText: uniqueName })).toBeVisible()
  })

  test('can edit a category', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const originalName = `Edit Me Cat ${Date.now()}`
    const updatedName = `Updated Cat ${Date.now()}`

    await api.createCategory(originalName, '✏️')

    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    // Click on the category row to open edit form
    const catRow = page.locator('tbody tr.clickable-row', { hasText: originalName })
    await expect(catRow).toBeVisible()
    await catRow.click()

    // Edit form should appear
    await expect(page.locator('tr.edit-row')).toBeVisible()

    // Change the name
    const editNameInput = page.locator('tr.edit-row input[id^="edit-name-"]')
    await editNameInput.fill(updatedName)

    // Save
    await page.locator('tr.edit-row button.btn-create', { hasText: 'Save Changes' }).click()

    // Success message
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.alert-success')).toContainText(updatedName)

    // Table updates
    await expect(page.locator('tbody tr', { hasText: updatedName })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: originalName })).not.toBeVisible()
  })

  test('can delete an unused category', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const catName = `Delete Me Cat ${Date.now()}`

    await api.createCategory(catName)

    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    const catRow = page.locator('tbody tr.clickable-row', { hasText: catName })
    await expect(catRow).toBeVisible()

    // Click delete and confirm via the custom ConfirmDialog
    await catRow.locator('button.btn-icon-danger').click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await dialog.locator('button.btn-confirm-danger').click()

    // Success message
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.alert-success')).toContainText(catName)

    // Category is gone from table
    await expect(page.locator('tbody tr', { hasText: catName })).not.toBeVisible()
  })

  test('delete warning for category with linked data', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Delete Warning Home')
    const catName = `In Use Cat ${Date.now()}`

    // Create a category and attach an expense to it
    const cat = await api.createCategory(catName)
    await api.createExpense({
      household: household.id,
      description: 'Expense using cat',
      amount: 15,
      expense_date: TODAY,
      category: cat.id,
    })

    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    const catRow = page.locator('tbody tr.clickable-row', { hasText: catName })
    await expect(catRow).toBeVisible()

    // Trigger the delete — app shows a custom ConfirmDialog, not the native one
    await catRow.locator('button.btn-icon-danger').click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Dialog message must explain which data is linked before asking to confirm
    const dialogMessage = (await dialog.locator('.dialog-message').textContent()) ?? ''
    expect(dialogMessage).toContain('used by')
    expect(dialogMessage).toContain('expense')

    // Dismiss — we don't want to actually delete the category
    await dialog.locator('button.btn-ghost').click()
  })
})
