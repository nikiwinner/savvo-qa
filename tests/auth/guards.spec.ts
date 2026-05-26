/**
 * Auth — Route Guards (Phase 00)
 *
 * hooks.server.ts enforces:
 * - Unauthenticated → /dashboard/* redirects to /login
 * - Authenticated → /login and /signup redirect to /dashboard
 */
import { test, expect } from '@playwright/test'
import { test as appTest } from '../../fixtures/index'

test.describe('Unauthenticated route protection', () => {
  test('/dashboard redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })

  test('/dashboard/spaces redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/dashboard/spaces')
    await expect(page).toHaveURL('/login')
  })

  test('/dashboard/expenses redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/dashboard/expenses')
    await expect(page).toHaveURL('/login')
  })
})

appTest.describe('Authenticated route access', () => {
  appTest('authenticated user can access /dashboard', async ({ page, loggedInPage: _ }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible()
  })

  appTest('authenticated user is redirected away from /login', async ({ page, loggedInPage: _ }) => {
    await page.goto('/login')
    await expect(page).toHaveURL('/dashboard')
  })

  appTest('authenticated user is redirected away from /signup', async ({ page, loggedInPage: _ }) => {
    await page.goto('/signup')
    await expect(page).toHaveURL('/dashboard')
  })

  appTest('sidebar shows the logged-in user name', async ({ page, loggedInPage }) => {
    await page.goto('/dashboard')
    const { user } = loggedInPage
    await expect(page.locator('.user-name')).toContainText(user.name)
  })
})
