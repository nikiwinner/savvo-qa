/**
 * Auth — Signup currency preference (Phase 06, Story 6.0)
 *
 * Verifies that:
 * 1. Signing up without touching the currency dropdown stores EUR by default.
 * 2. Selecting an explicit currency persists it on the user.
 * 3. The currency <select> is rendered above the password <input> in the DOM.
 * 4. Posting an invalid currency code to the API is rejected with 400.
 */
import { test, expect } from '@playwright/test'
import { ApiHelper, uniqueUser } from '../../helpers/api'
import { SignupPage } from '../../pages/SignupPage'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'

test.describe('Signup — currency preference', () => {
  test('signup with default currency stores EUR on the user', async ({ page }) => {
    const user = uniqueUser('curr-default')

    const signup = new SignupPage(page)
    await signup.goto()

    // Fill name and email; leave currency at its default (EUR pre-selected)
    await signup.nameInput.fill(user.name)
    await signup.emailInput.fill(user.email)
    await signup.passwordInput.fill(user.password)
    await signup.confirmPasswordInput.fill(user.password)
    await signup.submitButton.click()

    // The post-signup landing is /dashboard/learn.
    await expect(page).toHaveURL('/dashboard/learn', { timeout: 15_000 })

    // Verify via API that currency is EUR
    const reqCtx = await page.context().request
    const meRes = await reqCtx.get(`${BACKEND_URL}/api/auth/me/`)
    const meData = await meRes.json()
    expect(meData.user?.currency).toBe('EUR')
  })

  test('signup with explicit currency stores the chosen code', async ({ page }) => {
    const user = uniqueUser('curr-usd')

    const signup = new SignupPage(page)
    await signup.goto()

    await signup.nameInput.fill(user.name)
    await signup.emailInput.fill(user.email)

    // Select USD before filling the password
    await page.selectOption('select[name="currency"]', 'USD')

    await signup.passwordInput.fill(user.password)
    await signup.confirmPasswordInput.fill(user.password)
    await signup.submitButton.click()

    // The post-signup landing is /dashboard/learn.
    await expect(page).toHaveURL('/dashboard/learn', { timeout: 15_000 })

    // Verify currency persisted
    const reqCtx = await page.context().request
    const meRes = await reqCtx.get(`${BACKEND_URL}/api/auth/me/`)
    const meData = await meRes.json()
    expect(meData.user?.currency).toBe('USD')
  })

  test('currency dropdown is rendered above the password field', async ({ page }) => {
    const signup = new SignupPage(page)
    await signup.goto()

    // Get the bounding box Y positions — select should appear higher (lower Y) than password input
    const currencySelect = page.locator('select[name="currency"]')
    const passwordInput = page.locator('input[name="password"]')

    await expect(currencySelect).toBeVisible()
    await expect(passwordInput).toBeVisible()

    // DOM order check: the select should come before the password input in source order
    const currencyBox = await currencySelect.boundingBox()
    const passwordBox = await passwordInput.boundingBox()

    expect(currencyBox).not.toBeNull()
    expect(passwordBox).not.toBeNull()
    // Currency select top edge must be above password input top edge
    expect(currencyBox!.y).toBeLessThan(passwordBox!.y)
  })

  test('invalid currency code is rejected by the API', async ({ playwright }) => {
    const user = uniqueUser('curr-invalid')
    const reqCtx = await playwright.request.newContext()

    const res = await reqCtx.post(`${BACKEND_URL}/api/auth/signup/`, {
      data: {
        username: user.email,
        email: user.email,
        password: user.password,
        password_confirm: user.password,
        name: user.name,
        currency: 'XYZ',
      },
    })

    expect(res.status()).toBe(400)

    await reqCtx.dispose()
  })
})
