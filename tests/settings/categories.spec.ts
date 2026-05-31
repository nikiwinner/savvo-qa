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
    // Create a space to seed default categories
    const space = await api.createSpace('Usage Count Home')

    // Create an expense using Groceries category to bump usage count
    const categories = await api.listCategories()
    const groceries = categories.find((c) => c.name === 'Groceries')
    if (groceries) {
      await api.createExpense({
        space: space.id,
        description: 'Usage Test Expense',
        amount: 10,
        expense_date: TODAY,
        category: groceries.id,
      })
    }

    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    // Scope to the FIRST `.paper table` — the categories table. A second
    // `.paper table` (the bank category-mappings table) is present whenever
    // sibling specs have seeded provider categories (they are global, gotcha
    // #9), so a bare `table` / `tbody tr` locator hits a strict-mode violation.
    const categoriesTable = page.locator('.paper table').first()
    await expect(categoriesTable).toBeVisible()
    // At least one row for Groceries. Use exact-word regex so parallel-test
    // categories like "Groceries-IM"/"Groceries-D1" (categories are global
    // per Gotcha #9) don't trigger a strict-mode multiple-match violation.
    const groceriesRowExact = /(?:^|\s)Groceries(?:\s|$)/
    await expect(categoriesTable.locator('tbody tr', { hasText: groceriesRowExact })).toBeVisible()

    // If we added an expense with Groceries, the usage column should be non-empty
    if (groceries) {
      const groceriesRow = categoriesTable.locator('tbody tr', { hasText: groceriesRowExact })
      const usageText = await groceriesRow.locator('.usage-text').textContent()
      // Should contain "1 expense" or "1 transaction" — just check it's not "—"
      expect(usageText).not.toBe('—')
    }
  })

  test('can create a new category', async ({ page, loggedInPage }) => {
    const uniqueName = `E2E Cat ${Date.now()}`

    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    // Click "New Expense Category" (default tab is Expenses; the button label
    // is now kind-specific: "New Expense Category" / "New Income Category").
    await page.locator('button.btn-create', { hasText: /New (Expense|Income) Category/ }).click()
    await expect(page.locator('.form-panel')).toBeVisible()

    // Fill in the form
    await page.locator('#create-name').fill(uniqueName)
    await page.locator('#create-icon').fill('🎯')

    // Submit
    await page.locator('.form-panel button.btn-create', { hasText: 'Create Category' }).click()

    // Success message
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.alert-success')).toContainText(uniqueName)

    // Category appears in the table. Scope to the FIRST `.paper table` — the
    // categories table. A second `.paper table` (the bank category-mappings
    // table) is present whenever sibling specs have seeded provider categories
    // (global, gotcha #9), and its <option>s contain the category name, so a
    // bare `tbody tr` locator hits a strict-mode violation.
    const categoriesTbody = page.locator('.paper table').first().locator('tbody')
    await expect(categoriesTbody.locator('tr', { hasText: uniqueName })).toBeVisible()
  })

  test('can edit a category', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const originalName = `Edit Me Cat ${Date.now()}`
    const updatedName = `Updated Cat ${Date.now()}`

    await api.createCategory(originalName, '✏️')

    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    // Scope to the FIRST `.paper table` — the categories table. The bank
    // category-mappings table (a second `.paper table` when provider categories
    // exist DB-wide) would otherwise widen the `tbody tr` matches below.
    const categoriesTbody = page.locator('.paper table').first().locator('tbody')

    // Click on the category row to open edit form
    const catRow = categoriesTbody.locator('tr.clickable-row', { hasText: originalName })
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

    // Table updates (scoped to the categories table, not the mappings table)
    await expect(categoriesTbody.locator('tr', { hasText: updatedName })).toBeVisible()
    await expect(categoriesTbody.locator('tr', { hasText: originalName })).not.toBeVisible()
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
    const space = await api.createSpace('Delete Warning Home')
    const catName = `In Use Cat ${Date.now()}`

    // Create a category and attach an expense to it
    const cat = await api.createCategory(catName)
    await api.createExpense({
      space: space.id,
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
