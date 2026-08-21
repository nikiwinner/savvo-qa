/**
 * Settings — Personal details.
 *
 * The 2026-08-20 redesign split this page up: the password moved to
 * `/dashboard/settings/security` (see security.spec.ts) and the currency to
 * `/dashboard/settings/preferences` (see tests/auth/profile-currency.spec.ts).
 * What is left here is the display name — and it is no longer an always-open
 * form but a ROW that opens a focused EditSheet (modal on desktop, bottom
 * sheet on a phone).
 *
 * Verifies that:
 * 1. The name field does not exist until the row is opened, and saving it lands
 *    in the profile and closes the sheet.
 * 2. Esc closes the sheet, restores focus to the row, and saves nothing.
 * 3. Email and sign-in method are shown but not editable here.
 */
import { test, expect } from '../../fixtures/index'

test.describe('Personal details — display name', () => {
  test('the name field only exists once the row is opened, and saving persists it', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    await page.goto('/dashboard/settings/profile')
    await page.waitForLoadState('networkidle')

    // The whole point of the sheet: one field at a time, nothing open by default.
    await expect(page.getByTestId('profile-name-input')).toHaveCount(0)

    await page.getByTestId('profile-name-row').click()
    await expect(page.getByTestId('sheet-display-name')).toBeVisible()

    await page.getByTestId('profile-name-input').fill('QA Renamed')
    await page.getByRole('button', { name: /^save$/i }).click()
    await page.waitForURL(/success=1/, { timeout: 8000 })

    const me = await api.me()
    expect(me?.name).toBe('QA Renamed')

    // Success is a redirect, so the sheet has done its job and closes itself.
    await expect(page.getByTestId('sheet-display-name')).toHaveCount(0)
    // Viewport-agnostic persistence check (the sidebar hides the name on narrow
    // viewports): the row itself re-renders from server state.
    await expect(page.getByTestId('profile-name-row')).toContainText('QA Renamed')
  })

  test('Esc closes the sheet, restores focus to the row and saves nothing', async ({
    page,
    loggedInPage,
  }) => {
    const { api, user } = loggedInPage
    const before = (await api.me())?.name ?? ''

    await page.goto('/dashboard/settings/profile')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('profile-name-row').click()
    await expect(page.getByTestId('sheet-display-name')).toBeVisible()
    await page.getByTestId('profile-name-input').fill('Discarded Name')

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('sheet-display-name')).toHaveCount(0)

    // Focus must land back on the control that opened the sheet, or a keyboard
    // user is dropped at the top of the document.
    await expect(page.getByTestId('profile-name-row')).toBeFocused()

    const after = await api.me()
    expect(after?.name ?? '').toBe(before)
    expect(after?.email).toBe(user.email)
  })
})

test.describe('Personal details — the read-only rows', () => {
  test('email and sign-in method are shown, and neither is editable here', async ({
    page,
    loggedInPage,
  }) => {
    const { user } = loggedInPage

    await page.goto('/dashboard/settings/profile')
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('profile-email')).toHaveText(user.email)
    await expect(page.getByText('Email & password')).toBeVisible()

    // An email input on this page would mean the guarded account-move flow got
    // smuggled in as a profile edit.
    await expect(page.locator('input[name="email"]')).toHaveCount(0)
  })
})
