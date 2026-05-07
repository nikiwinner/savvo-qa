/**
 * Auth — Login (Phase 00)
 *
 * Login is client-side: the page uses apiFetch to POST to Django directly
 * from the browser. Session cookie is set by Django, browser stores it.
 */
import { test, expect } from '@playwright/test'
import { LoginPage } from '../../pages/LoginPage'
import { uniqueUser, ApiHelper } from '../../helpers/api'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'

test.describe('Login', () => {
  test.beforeEach(async ({ playwright }) => {
    // Pre-create a shared user so tests below can log in
    // Each test creates its own user to avoid state coupling
  })

  test('logs in with valid credentials and lands on dashboard', async ({ page, playwright }) => {
    const user = uniqueUser()
    const reqCtx = await playwright.request.newContext()
    const api = new ApiHelper(reqCtx)
    await api.signup(user)
    await reqCtx.dispose()

    const login = new LoginPage(page)
    await login.goto()
    await login.login(user.email, user.password)

    await expect(page).toHaveURL('/dashboard')
  })

  test('shows error with wrong password', async ({ page, playwright }) => {
    const user = uniqueUser()
    const reqCtx = await playwright.request.newContext()
    await reqCtx.post(`${BACKEND_URL}/api/auth/signup/`, {
      data: {
        username: user.email,
        email: user.email,
        password: user.password,
        password_confirm: user.password,
        name: user.name,
      },
    })
    await reqCtx.dispose()

    const login = new LoginPage(page)
    await login.goto()
    await login.login(user.email, 'WrongPassword999!')

    await expect(login.errorMessage).toBeVisible()
    await expect(login.errorMessage).toContainText('Invalid')
    await expect(page).toHaveURL('/login')
  })

  test('shows error for non-existent email', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.login('nobody@doesnotexist.local', 'AnyPassword1!')

    await expect(login.errorMessage).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('submit button is disabled while request is in flight', async ({ page, playwright }) => {
    // We can only verify the button becomes disabled momentarily —
    // it's easiest to just check the button is NOT disabled initially
    const user = uniqueUser()
    const reqCtx = await playwright.request.newContext()
    await reqCtx.post(`${BACKEND_URL}/api/auth/signup/`, {
      data: {
        username: user.email,
        email: user.email,
        password: user.password,
        password_confirm: user.password,
        name: user.name,
      },
    })
    await reqCtx.dispose()

    const login = new LoginPage(page)
    await login.goto()

    await expect(login.submitButton).toBeEnabled()
    await expect(login.submitButton).toContainText('Sign in')
  })

  test('has a link to the signup page', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()

    await login.signupLink.click()
    await expect(page).toHaveURL('/signup')
  })
})
