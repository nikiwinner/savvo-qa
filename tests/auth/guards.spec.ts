/**
 * Auth — Route Guards (Phase 00)
 *
 * hooks.server.ts enforces:
 * - Unauthenticated → /dashboard/* redirects to /login
 * - Authenticated → /login and /signup redirect to /dashboard/today (Phase 18)
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

  test('/dashboard/transactions redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/dashboard/transactions')
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
    // Phase 18: the authed-bounce target moved /dashboard → /dashboard/today.
    await expect(page).toHaveURL('/dashboard/today')
  })

  appTest('authenticated user is redirected away from /signup', async ({ page, loggedInPage: _ }) => {
    await page.goto('/signup')
    // Phase 18: the authed-bounce target moved /dashboard → /dashboard/today.
    await expect(page).toHaveURL('/dashboard/today')
  })

  appTest('sidebar shows the logged-in user name', async ({ page, loggedInPage }) => {
    await page.goto('/dashboard')
    const { user } = loggedInPage
    await expect(page.locator('.user-name')).toContainText(user.name)
  })
})
