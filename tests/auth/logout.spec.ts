/**
 * Auth — Logout (Phase 00, Story 0.1)
 *
 * logout/+server.ts uses djangoFetch. After logout, the session is cleared
 * on the Django side; subsequent /dashboard visits redirect to /login.
 */
import { test, expect } from '../../fixtures/index'
import { DashboardPage } from '../../pages/DashboardPage'

test.describe('Logout', () => {
  test('redirects to /login after logout', async ({ page, loggedInPage: _ }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()
    await expect(page).toHaveURL('/dashboard')

    await dashboard.logout()

    await expect(page).toHaveURL('/login')
  })

  test('accessing /dashboard after logout redirects to /login', async ({ page, loggedInPage: _ }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await dashboard.logout()
    await expect(page).toHaveURL('/login')

    // Attempting to navigate back to dashboard should redirect to /login
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })

  test('accessing a sub-route after logout redirects to /login', async ({ page, loggedInPage: _ }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await dashboard.logout()

    await page.goto('/dashboard/spaces')
    await expect(page).toHaveURL('/login')

    await page.goto('/dashboard/expenses')
    await expect(page).toHaveURL('/login')
  })

  test('session is cleared — me returns null after logout', async ({ page, loggedInPage, playwright }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()
    await dashboard.logout()

    // Verify via API that session is gone
    const { api } = loggedInPage
    const user = await api.me()
    // After logout the session cookie was cleared on the backend;
    // the apiHelper context still has the old cookies but they're now invalid
    expect(user).toBeNull()
  })
})
