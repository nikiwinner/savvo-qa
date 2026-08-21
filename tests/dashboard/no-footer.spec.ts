/**
 * The dashboard has no footer — and the public landing page still does.
 *
 * Removed 2026-08-21 on the user's call. It carried a hairline rule and one
 * line of copyright on every authenticated screen and nothing else. Verbatim:
 * "Please choose the first option and remove the footer completely from all
 * authenticated dashboard screens. Remove both the divider and the '© 2026
 * Savvo' text. The dashboard should behave like an application rather than a
 * public website. […] Keep the full footer on the public landing page,
 * including copyright and relevant legal links. Also, do not use a footer to
 * fill empty vertical space—the responsive page layout should handle different
 * screen sizes independently."
 *
 * Three things are guarded here, because the failure modes are different:
 *   1. no footer on any dashboard route,
 *   2. the content column does not stretch to the viewport — the earlier bug
 *      this whole thread started from was a footer pinned to the bottom with a
 *      measured 186-513px hole above it,
 *   3. `/` keeps its own real footer, so "delete the footer" can never be
 *      applied to the public page by mistake.
 */
import { test, expect } from '../../fixtures/index'

const DASHBOARD_ROUTES = [
  '/dashboard/learn',
  '/dashboard/analytics',
  '/dashboard/spaces',
  '/dashboard/transactions',
  '/dashboard/settings',
  '/dashboard/settings/security',
]

test.describe('Dashboard chrome — no footer', () => {
  test('no dashboard route renders a footer', async ({ page, loggedInPage }) => {
    void loggedInPage

    for (const route of DASHBOARD_ROUTES) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('.app-footer')).toHaveCount(0)
      await expect(page.locator('.main-content footer')).toHaveCount(0)
      await expect(page.getByText(/©\s*\d{4}\s*Savvo/)).toHaveCount(0)
    }
  })

  test('the content column ends at the content, not at the viewport', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    // Deliberately taller than the page needs — the shape that used to leave
    // hundreds of pixels of nothing above a footer rule.
    const VH = 1200
    await page.setViewportSize({ width: 1512, height: VH })
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    const main = await page.locator('.main-content').boundingBox()
    const last = await page.getByTestId('settings-group-support').boundingBox()
    expect(main).not.toBeNull()
    expect(last).not.toBeNull()

    // Stops just past the last group — its own 28px bottom padding, no more.
    const tail = main!.y + main!.height - (last!.y + last!.height)
    expect(tail).toBeGreaterThanOrEqual(0)
    expect(tail).toBeLessThan(60)

    // …and is therefore nowhere near the height of the window.
    expect(main!.height).toBeLessThan(VH - 150)
  })

  test('the public landing page keeps its own footer', async ({ browser }) => {
    // A fresh context on purpose: `/` 303-redirects an authenticated visitor to
    // Learn, so the logged-in fixture can never see this page.
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      const footer = page.locator('footer.footer')
      await expect(footer).toHaveCount(1)
      await expect(footer).toContainText(/Savvo/)
      // The legal/nav links the user asked to keep.
      await expect(footer.locator('a')).not.toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})
