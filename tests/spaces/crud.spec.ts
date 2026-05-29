/**
 * Spaces — CRUD (Phase 00 + Phase 01)
 *
 * Covers create, edit, delete via the browser UI.
 * Requires a logged-in user (loggedInPage fixture).
 */
import { test, expect } from '../../fixtures/index'
import { SpacesPage } from '../../pages/SpacesPage'

test.describe('Spaces CRUD', () => {
  test('shows empty state when user has no spaces', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()

    await expect(spaces.emptyState).toBeVisible()
    await expect(spaces.emptyState).toContainText('No spaces yet')
  })

  test('creates a space — it appears in the grid', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()

    await spaces.createSpace('Beach House', 'Summer vacation home')

    await expect(spaces.card('Beach House')).toBeVisible()
    // Empty state should be gone
    await expect(spaces.emptyState).not.toBeVisible()
  })

  test('create form toggles open and closed', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()

    await expect(spaces.createForm).not.toBeVisible()

    await spaces.newSpaceButton.click()
    await expect(spaces.createForm).toBeVisible()

    // Clicking again (now shows "Cancel") should close the form
    await page.locator('button', { hasText: 'Cancel' }).first().click()
    await expect(spaces.createForm).not.toBeVisible()
  })

  test('edits a space name', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.createSpace('Old Name')

    await spaces.editSpace('Old Name', 'New Name')

    await expect(spaces.card('New Name')).toBeVisible()
    await expect(spaces.card('Old Name')).not.toBeVisible()
  })

  test('edit form is pre-filled with the current name', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.createSpace('Pre-fill Test')

    // Open edit form
    await spaces.card('Pre-fill Test').locator('.action-btn[aria-label="Edit"]').click()

    const nameInput = spaces.card('Pre-fill Test').locator('input[name="name"]')
    await expect(nameInput).toHaveValue('Pre-fill Test')
  })

  test('cancel edit does not change the space name', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.createSpace('Original Name')

    // Open edit, type a new name, then cancel
    const card = spaces.card('Original Name')
    await card.locator('.action-btn[aria-label="Edit"]').click()
    await card.locator('input[name="name"]').fill('Changed Name')
    await card.locator('button', { hasText: 'Cancel' }).click()

    await expect(spaces.card('Original Name')).toBeVisible()
    await expect(spaces.card('Changed Name')).not.toBeVisible()
  })

  test('deletes a space — it disappears from the grid', async ({ page, loggedInPage: _ }) => {
    // Phase 12: delete is a two-step flow (archive on active page, then
    // delete permanently from the dedicated archived view). The page-object
    // `archiveAndDelete` helper bundles both. The active-page single-confirm
    // delete no longer exists.
    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.createSpace('To Delete')

    await expect(spaces.card('To Delete')).toBeVisible()

    await spaces.archiveAndDelete('To Delete')

    // After delete, the +page.svelte navigates back to /dashboard/spaces.
    // The page-object already awaited that landing; just assert the card
    // is gone.
    await expect(spaces.card('To Delete')).not.toBeVisible()
  })

  test('empty state appears after deleting the last space', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.createSpace('Last One')

    await spaces.archiveAndDelete('Last One')

    // Archived view → after delete navigates to /dashboard/spaces. With zero
    // active spaces, the empty state should render. The page-object already
    // awaited the navigation; just check the resulting state.
    await expect(spaces.emptyState).toBeVisible()
  })

  test('multiple spaces are all visible in the grid', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()

    await spaces.createSpace('House Alpha')
    await spaces.createSpace('House Beta')
    await spaces.createSpace('House Gamma')

    await expect(spaces.cards()).toHaveCount(3)
    await expect(spaces.card('House Alpha')).toBeVisible()
    await expect(spaces.card('House Beta')).toBeVisible()
    await expect(spaces.card('House Gamma')).toBeVisible()
  })
})
