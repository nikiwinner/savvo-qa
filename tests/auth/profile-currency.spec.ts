/**
 * Auth — Profile currency settings (Phase 06, Story 6.0)
 *
 * The field still lives on the user, but the 2026-08-20 settings redesign moved
 * its control off `/dashboard/settings/profile` (an identity page) onto
 * `/dashboard/settings/preferences` ("Display & regional"), where it opens in
 * an EditSheet instead of sitting in an always-open form.
 *
 * Verifies that:
 * 1. A logged-in user can change their currency from Display & regional.
 * 2. Unauthenticated users are redirected to /login.
 */
import { test, expect } from '../../fixtures/index'
import { test as baseTest } from '@playwright/test'

test.describe('Profile — currency settings', () => {
  test('user can change currency from settings/preferences', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    // Confirm user starts with EUR (default)
    const meBefore = await api.me()
    expect(meBefore?.currency ?? 'EUR').toBe('EUR')

    await page.goto('/dashboard/settings/preferences')
    await page.waitForLoadState('networkidle')

    // The row states the current value before anything is opened.
    await expect(page.getByTestId('preferences-currency-row')).toContainText('Euro (EUR)')
    await expect(page.getByTestId('preferences-currency')).toHaveCount(0)

    await page.getByTestId('preferences-currency-row').click()
    await expect(page.getByTestId('sheet-currency')).toBeVisible()

    await page.selectOption('[data-testid="preferences-currency"]', 'GBP')
    await page.getByTestId('preferences-save').click()

    // Page should redirect/update with success indication
    await page.waitForURL(/success=1/, { timeout: 8000 })

    // Verify via API that currency updated
    const meAfter = await api.me()
    expect(meAfter?.currency).toBe('GBP')

    // And the surface agrees with the server rather than with itself.
    await expect(page.getByTestId('sheet-currency')).toHaveCount(0)
    await expect(page.getByTestId('preferences-currency-row')).toContainText('GBP')
  })
})

baseTest.describe('Profile — unauthenticated guard', () => {
  baseTest('unauthenticated user is redirected from settings/preferences', async ({ page }) => {
    await page.goto('/dashboard/settings/preferences')
    await expect(page).toHaveURL('/login')
  })

  baseTest('unauthenticated user is redirected from settings/profile', async ({ page }) => {
    await page.goto('/dashboard/settings/profile')
    await expect(page).toHaveURL('/login')
  })
})
