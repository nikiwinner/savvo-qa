/**
 * Auth — Profile currency settings (Phase 06, Story 6.0)
 *
 * Verifies that:
 * 1. A logged-in user can change their currency from the settings/profile page.
 * 2. Unauthenticated users are redirected to /login.
 */
import { test, expect } from '../../fixtures/index'
import { test as baseTest } from '@playwright/test'

test.describe('Profile — currency settings', () => {
  test('user can change currency from settings/profile', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    // Confirm user starts with EUR (default)
    const meBefore = await api.me()
    expect(meBefore?.currency ?? 'EUR').toBe('EUR')

    await page.goto('/dashboard/settings/profile')
    await page.waitForLoadState('networkidle')

    // Change to GBP and save
    await page.selectOption('select[name="currency"]', 'GBP')
    await page.getByRole('button', { name: /save/i }).click()

    // Page should redirect/update with success indication
    await page.waitForURL(/success=1/, { timeout: 5000 })

    // Verify via API that currency updated
    const meAfter = await api.me()
    expect(meAfter?.currency).toBe('GBP')
  })
})

baseTest.describe('Profile — unauthenticated guard', () => {
  baseTest('unauthenticated user is redirected from settings/profile', async ({ page }) => {
    await page.goto('/dashboard/settings/profile')
    await expect(page).toHaveURL('/login')
  })
})
