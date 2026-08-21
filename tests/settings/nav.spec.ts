/**
 * Settings — navigation: the desktop section rail and the narrow-screen back
 * link (2026-08-20 redesign).
 *
 * Round 1 deleted the old always-on Settings submenu because a phone ended up
 * with two navigations. Round 2 brought a rail back for DESKTOP ONLY, as the
 * master half of a master-detail layout. The invariant this file guards is that
 * exactly ONE of the two ways back is on screen at any width:
 *
 *   narrow  → no rail, per-page "← Settings" link
 *   wide    → rail, no back link
 *
 * The crossover is derived from available width (sidebar + padding + rail + a
 * readable pane), which is why these tests set viewports explicitly instead of
 * inheriting whatever the browser project happens to use.
 */
import { test, expect } from '../../fixtures/index'

const WIDE = { width: 1280, height: 900 }
const PHONE = { width: 390, height: 844 }

test.describe('Settings rail — desktop', () => {
  test('the rail lists every section and never a Log out', async ({ page, loggedInPage }) => {
    void loggedInPage

    await page.setViewportSize(WIDE)
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    const rail = page.locator('.settings-rail')
    await expect(rail).toBeVisible()

    for (const id of [
      'settings',
      'profile',
      'security',
      'privacy',
      'banking',
      'categories',
      'routing-rules',
      'preferences',
      'support',
    ]) {
      await expect(page.getByTestId(`settings-rail-${id}`)).toBeVisible()
    }

    // Log out moved to the primary sidebar's account block. Leaving a copy here
    // is the duplicate the user asked to remove.
    await expect(rail.getByText('Log out')).toHaveCount(0)
    await expect(rail.locator('button')).toHaveCount(0)
  })

  test('the rail marks the open section and only that one', async ({ page, loggedInPage }) => {
    void loggedInPage
    await page.setViewportSize(WIDE)

    for (const [route, id] of [
      ['/dashboard/settings', 'settings'],
      ['/dashboard/settings/security', 'security'],
      ['/dashboard/settings/categories', 'categories'],
    ] as const) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')

      await expect(page.getByTestId(`settings-rail-${id}`)).toHaveAttribute('aria-current', 'page')
      // Overview must not light up on every child route, and a child must not
      // light up Overview — exactly one row is current.
      await expect(page.locator('.settings-rail [aria-current="page"]')).toHaveCount(1)
    }
  })

  test('clicking the rail swaps the detail pane without leaving Settings', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.setViewportSize(WIDE)
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('settings-rail-preferences').click()
    await expect(page).toHaveURL(/\/dashboard\/settings\/preferences$/)
    await expect(page.locator('.settings-rail')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Display & regional' })).toBeVisible()

    await page.getByTestId('settings-rail-settings').click()
    await expect(page).toHaveURL(/\/dashboard\/settings$/)
    await expect(page.getByTestId('settings-identity')).toBeVisible()
  })

  test('exactly one way back is on screen at each width', async ({ page, loggedInPage }) => {
    void loggedInPage

    await page.goto('/dashboard/settings/security')
    await page.waitForLoadState('networkidle')

    await page.setViewportSize(PHONE)
    await expect(page.locator('.settings-rail')).toBeHidden()
    await expect(page.locator('.settings-back')).toBeVisible()

    await page.setViewportSize(WIDE)
    await expect(page.locator('.settings-rail')).toBeVisible()
    await expect(page.locator('.settings-back')).toBeHidden()
  })

  test('the back link still returns to the hub on a phone', async ({ page, loggedInPage }) => {
    void loggedInPage

    await page.setViewportSize(PHONE)
    await page.goto('/dashboard/settings/privacy')
    await page.waitForLoadState('networkidle')

    await page.locator('.settings-back').click()
    await expect(page).toHaveURL(/\/dashboard\/settings$/)
    await expect(page.getByTestId('settings-identity')).toBeVisible()
  })
})
