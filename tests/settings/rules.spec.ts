/**
 * Category Rules Settings Page (Phase 3)
 *
 * Tests the rules CRUD page at /dashboard/settings/rules/
 */
import { test, expect } from '../../fixtures/index'

test.describe('Category Rules settings page', () => {
  test('rules page is accessible from settings', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Rules Nav Home')

    await page.goto(`/dashboard/settings/rules?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1', { hasText: 'Category Rules' })).toBeVisible()
  })

  test('shows empty state when no rules exist', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Empty Rules Home')

    await page.goto(`/dashboard/settings/rules?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Should show the empty state message
    await expect(page.locator('.empty-state')).toBeVisible()
    await expect(page.locator('.empty-state')).toContainText('No rules yet')
  })

  test('can create a new rule', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Create Rule Home')
    const categories = await api.listCategories()
    const groceries = categories.find((c) => c.name === 'Groceries')

    await page.goto(`/dashboard/settings/rules?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Click "New Rule"
    await page.locator('button.btn-create', { hasText: 'New Rule' }).click()
    await expect(page.locator('.rule-form-panel')).toBeVisible()

    // Fill in the form
    await page.locator('#create-name').fill('My Test Rule')
    await page.locator('#create-merchant-contains').fill('TESTMERCHANT')

    // Set category action
    if (groceries) {
      await page.locator('#create-set-category').selectOption(String(groceries.id))
    } else {
      // Pick any available category
      const options = await page.locator('#create-set-category option').all()
      if (options.length > 1) {
        const val = await options[1].getAttribute('value')
        if (val) await page.locator('#create-set-category').selectOption(val)
      }
    }

    await page.locator('.rule-form-panel button.btn-create', { hasText: 'Create Rule' }).click()

    // Alert success
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.alert-success')).toContainText('My Test Rule')

    // Rule appears in the table
    await expect(page.locator('tbody tr', { hasText: 'My Test Rule' })).toBeVisible()
  })

  test('can edit an existing rule', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Edit Rule Home')
    const categories = await api.listCategories()
    const groceries = categories.find((c) => c.name === 'Groceries')

    // Create a rule via API
    await api.createCategoryRule({
      space: space.id,
      name: 'Rule To Edit',
      merchant_contains: 'EDITME',
      set_category: groceries?.id ?? null,
    })

    await page.goto(`/dashboard/settings/rules?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Click on the rule row to open edit form
    const ruleRow = page.locator('tbody tr.clickable-row', { hasText: 'Rule To Edit' })
    await expect(ruleRow).toBeVisible()
    await ruleRow.click()

    // Edit form should appear
    await expect(page.locator('tr.edit-row')).toBeVisible()

    // Find the name input in edit row and change it.
    // RuleForm id pattern: `${idPrefix}-name` where idPrefix is `edit-{ruleId}`.
    const editNameInput = page.locator('tr.edit-row input[id^="edit-"][id$="-name"]')
    await editNameInput.fill('Updated Rule Name')

    // Save
    await page.locator('tr.edit-row button.btn-create', { hasText: 'Save Changes' }).click()

    // Success message
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.alert-success')).toContainText('Updated Rule Name')

    // Table updates
    await expect(page.locator('tbody tr', { hasText: 'Updated Rule Name' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Rule To Edit' })).not.toBeVisible()
  })

  test('can delete a rule', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Delete Rule Home')
    const categories = await api.listCategories()
    const groceries = categories.find((c) => c.name === 'Groceries')

    // Create a rule via API
    await api.createCategoryRule({
      space: space.id,
      name: 'Rule To Delete',
      merchant_contains: 'DELETEME',
      set_category: groceries?.id ?? null,
    })

    await page.goto(`/dashboard/settings/rules?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const ruleRow = page.locator('tbody tr.clickable-row', { hasText: 'Rule To Delete' })
    await expect(ruleRow).toBeVisible()

    // Click delete and confirm via the custom ConfirmDialog
    await ruleRow.locator('button.btn-icon-danger').click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await dialog.locator('button.btn-confirm-danger').click()

    // Success message
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.alert-success')).toContainText('Rule To Delete')

    // Rule is gone from table
    await expect(page.locator('tbody tr', { hasText: 'Rule To Delete' })).not.toBeVisible()
  })

  test('re-apply all rules button works', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Reapply Home')
    const categories = await api.listCategories()
    const groceries = categories.find((c) => c.name === 'Groceries')

    // Create at least one rule
    await api.createCategoryRule({
      space: space.id,
      name: 'Reapply Rule',
      merchant_contains: 'REAPPLY',
      set_category: groceries?.id ?? null,
    })

    await page.goto(`/dashboard/settings/rules?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Click "Re-apply All Rules"
    await page.locator('button', { hasText: 'Re-apply All Rules' }).click()

    // Should show success with a count
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.alert-success')).toContainText('Re-applied rules')
  })

  test('auto-rules show Auto badge', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Auto Badge Home')
    const categories = await api.listCategories()
    const groceries = categories.find((c) => c.name === 'Groceries')

    // Create a rule with is_auto=true directly via the API
    await api.createCategoryRule({
      space: space.id,
      name: 'Auto Generated Rule',
      merchant_contains: 'AUTO_MERCHANT',
      set_category: groceries?.id ?? null,
      is_auto: true,
    })

    await page.goto(`/dashboard/settings/rules?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Should see the "Auto" badge in at least one row
    await expect(page.locator('tbody .badge-auto')).toBeVisible()
    await expect(page.locator('tbody .badge-auto')).toContainText('Auto')
  })
})
