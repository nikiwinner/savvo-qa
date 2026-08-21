/**
 * Dashboard shell — the sidebar account block and its Log out action
 * (2026-08-20 redesign).
 *
 * Log out used to be an unlabelled 32px icon wedged beside the avatar, and it
 * was hidden entirely when the rail was collapsed. It is now a labelled row of
 * its own under the account block, present in every state.
 *
 * Verifies that:
 * 1. Expanded desktop: a labelled "Log out" row sits under the user's details,
 *    separated from them, and logging out works.
 * 2. Collapsed rail: the control is still there, compact, with an accessible
 *    name — and takes TWO clicks, because the first click on a collapsed rail
 *    only expands it. A stray click near this button must never end a session.
 * 3. The accessible name matches the visible text (WCAG 2.5.3).
 */
import { test, expect } from '../../fixtures/index'

const COLLAPSE_KEY = 'savvo:sidebar_collapsed:v1'
const DESKTOP = { width: 1280, height: 900 }

test.describe('Sidebar — Log out', () => {
  test('is a labelled row under the account block, and it logs out', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.setViewportSize(DESKTOP)
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    const logout = page.locator('button[aria-label="Log out"]')
    await expect(logout).toBeVisible()
    // The visible text is what makes it understandable — an icon alone was the
    // complaint. And the accessible name has to contain it (WCAG 2.5.3).
    await expect(logout).toHaveText(/log out/i)
    await expect(page.locator('.account-divider')).toBeVisible()

    // It sits BELOW the user's details, not inline with them.
    const account = await page.locator('.account-block').boundingBox()
    const button = await logout.boundingBox()
    expect(account).not.toBeNull()
    expect(button).not.toBeNull()
    expect(button!.y).toBeGreaterThan(account!.y + account!.height - 1)

    await logout.click()
    await expect(page).toHaveURL('/login')
  })

  test('the collapsed rail keeps it, compact and named, and takes two clicks', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.setViewportSize(DESKTOP)
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')
    await page.evaluate((key) => localStorage.setItem(key, '1'), COLLAPSE_KEY)
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.sidebar.collapsed')).toBeVisible()

    const logout = page.locator('button[aria-label="Log out"]')
    await expect(logout).toBeVisible()

    // First click: the collapsed rail swallows it and expands instead. The user
    // chose this over making the button an exception to that rule.
    await logout.click()
    await expect(page.locator('.sidebar.collapsed')).toHaveCount(0)
    await expect(page).toHaveURL(/\/dashboard\/settings$/)

    // Second click, now on the labelled row, actually ends the session.
    await logout.click()
    await expect(page).toHaveURL('/login')
  })

  test('the collapsed rail shows a tooltip that is not clipped by the panel', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.setViewportSize(DESKTOP)
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')
    await page.evaluate((key) => localStorage.setItem(key, '1'), COLLAPSE_KEY)
    await page.reload()
    await page.waitForLoadState('networkidle')

    await page.locator('button[aria-label="Log out"]').hover()

    const bubble = page.locator('.tt-bubble', { hasText: 'Log out' })
    await expect(bubble).toBeVisible({ timeout: 3000 })

    // `.sidebar` used to be `overflow-x: hidden`, which clipped every tooltip in
    // the collapsed rail at the panel edge (measured 2026-08-20: 55px of
    // "Log out" hidden). The bubble is anchored past the button's right edge,
    // so it necessarily spills out of the 72px panel; what this asserts is that
    // the panel no longer cuts it off. `overflow-x: visible` is the actual
    // guard — the geometry check only establishes that there IS a spill to
    // clip, so the guard is not vacuously true.
    const bubbleBox = await bubble.boundingBox()
    const sidebarBox = await page.locator('.sidebar').boundingBox()
    expect(bubbleBox).not.toBeNull()
    expect(sidebarBox).not.toBeNull()
    expect(bubbleBox!.x + bubbleBox!.width).toBeGreaterThan(sidebarBox!.x + sidebarBox!.width)
    expect(bubbleBox!.width).toBeGreaterThan(20)
    await expect(page.locator('.sidebar.collapsed')).toHaveCSS('overflow-x', 'visible')
    await expect(page.locator('.sidebar.collapsed')).toHaveCSS('overflow-y', 'visible')
  })
})
