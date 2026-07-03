/**
 * Auth — Route Guards (Phase 00)
 *
 * hooks.server.ts enforces:
 * - Unauthenticated → /dashboard/* redirects to /login
 * - Authenticated → /login and /signup redirect to /dashboard/learn
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
    // Bare /dashboard 307-redirects to the Learn unit-map (the post-auth landing).
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/dashboard/learn')
    await expect(page.getByTestId('learn-page')).toBeVisible()
  })

  appTest('authenticated user is redirected away from /login', async ({ page, loggedInPage: _ }) => {
    await page.goto('/login')
    // The authed-bounce target is /dashboard/learn.
    await expect(page).toHaveURL('/dashboard/learn')
  })

  appTest('authenticated user is redirected away from /signup', async ({ page, loggedInPage: _ }) => {
    await page.goto('/signup')
    // The authed-bounce target is /dashboard/learn.
    await expect(page).toHaveURL('/dashboard/learn')
  })

  appTest('sidebar shows the logged-in user name', async ({ page, loggedInPage }) => {
    await page.goto('/dashboard')
    const { user } = loggedInPage
    // The user name lives in the sidebar account block (bottom).
    await expect(page.locator('.account-name')).toContainText(user.name)
  })
})
