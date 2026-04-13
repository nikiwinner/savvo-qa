/**
 * Households — CRUD (Phase 00 + Phase 01)
 *
 * Covers create, edit, delete via the browser UI.
 * Requires a logged-in user (loggedInPage fixture).
 */
import { test, expect } from '../../fixtures/index'
import { HouseholdsPage } from '../../pages/HouseholdsPage'

test.describe('Households CRUD', () => {
  test('shows empty state when user has no households', async ({ page, loggedInPage: _ }) => {
    const households = new HouseholdsPage(page)
    await households.goto()

    await expect(households.emptyState).toBeVisible()
    await expect(households.emptyState).toContainText('No households yet')
  })

  test('creates a household — it appears in the grid', async ({ page, loggedInPage: _ }) => {
    const households = new HouseholdsPage(page)
    await households.goto()

    await households.createHousehold('Beach House', 'Summer vacation home')

    await expect(households.card('Beach House')).toBeVisible()
    // Empty state should be gone
    await expect(households.emptyState).not.toBeVisible()
  })

  test('create form toggles open and closed', async ({ page, loggedInPage: _ }) => {
    const households = new HouseholdsPage(page)
    await households.goto()

    await expect(households.createForm).not.toBeVisible()

    await households.newHouseholdButton.click()
    await expect(households.createForm).toBeVisible()

    // Clicking again (now shows "Cancel") should close the form
    await page.locator('button', { hasText: 'Cancel' }).first().click()
    await expect(households.createForm).not.toBeVisible()
  })

  test('edits a household name', async ({ page, loggedInPage: _ }) => {
    const households = new HouseholdsPage(page)
    await households.goto()
    await households.createHousehold('Old Name')

    await households.editHousehold('Old Name', 'New Name')

    await expect(households.card('New Name')).toBeVisible()
    await expect(households.card('Old Name')).not.toBeVisible()
  })

  test('edit form is pre-filled with the current name', async ({ page, loggedInPage: _ }) => {
    const households = new HouseholdsPage(page)
    await households.goto()
    await households.createHousehold('Pre-fill Test')

    // Open edit form
    await households.card('Pre-fill Test').locator('.btn-icon[title="Edit"]').click()

    const nameInput = households.card('Pre-fill Test').locator('input[name="name"]')
    await expect(nameInput).toHaveValue('Pre-fill Test')
  })

  test('cancel edit does not change the household name', async ({ page, loggedInPage: _ }) => {
    const households = new HouseholdsPage(page)
    await households.goto()
    await households.createHousehold('Original Name')

    // Open edit, type a new name, then cancel
    const card = households.card('Original Name')
    await card.locator('.btn-icon[title="Edit"]').click()
    await card.locator('input[name="name"]').fill('Changed Name')
    await card.locator('button', { hasText: 'Cancel' }).click()

    await expect(households.card('Original Name')).toBeVisible()
    await expect(households.card('Changed Name')).not.toBeVisible()
  })

  test('deletes a household — it disappears from the grid', async ({ page, loggedInPage: _ }) => {
    const households = new HouseholdsPage(page)
    await households.goto()
    await households.createHousehold('To Delete')

    await expect(households.card('To Delete')).toBeVisible()

    await households.deleteHousehold('To Delete')

    await expect(households.card('To Delete')).not.toBeVisible()
  })

  test('empty state appears after deleting the last household', async ({ page, loggedInPage: _ }) => {
    const households = new HouseholdsPage(page)
    await households.goto()
    await households.createHousehold('Last One')

    await households.deleteHousehold('Last One')

    await expect(households.emptyState).toBeVisible()
  })

  test('multiple households are all visible in the grid', async ({ page, loggedInPage: _ }) => {
    const households = new HouseholdsPage(page)
    await households.goto()

    await households.createHousehold('House Alpha')
    await households.createHousehold('House Beta')
    await households.createHousehold('House Gamma')

    await expect(households.cards()).toHaveCount(3)
    await expect(households.card('House Alpha')).toBeVisible()
    await expect(households.card('House Beta')).toBeVisible()
    await expect(households.card('House Gamma')).toBeVisible()
  })
})
