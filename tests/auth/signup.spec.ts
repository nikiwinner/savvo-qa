/**
 * Auth — Signup (Phase 00, Story 0.2)
 *
 * Tests the /signup page. Login is client-side (apiFetch), so all assertions
 * are against the rendered UI or final URL after redirect.
 */
import { test, expect } from '@playwright/test'
import { SignupPage } from '../../pages/SignupPage'
import { uniqueUser } from '../../helpers/api'

test.describe('Signup', () => {
  test('signs up with valid credentials and lands on dashboard', async ({ page }) => {
    const signup = new SignupPage(page)
    const user = uniqueUser()

    await signup.goto()
    await signup.signup(user.name, user.email, user.password, user.password)

    await expect(page).toHaveURL('/dashboard')
  })

  test('shows error when passwords do not match (client-side check)', async ({ page }) => {
    const signup = new SignupPage(page)
    const user = uniqueUser()

    await signup.goto()
    await signup.signup(user.name, user.email, 'Password1!', 'Password2!')

    await expect(signup.errorMessage).toBeVisible()
    await expect(signup.errorMessage).toContainText('Passwords do not match')
    await expect(page).toHaveURL('/signup')
  })

  test('shows error when required fields are missing', async ({ page }) => {
    const signup = new SignupPage(page)

    await signup.goto()
    // Disable HTML5 required validation AND submit in one atomic evaluate so there
    // is no gap between setting noValidate and the submit event firing.
    // A separate click() after evaluate() can race with Svelte hydration re-inserting
    // the form element, which resets noValidate back to false.
    await page.evaluate(() => {
      const form = document.querySelector('form') as HTMLFormElement
      form.noValidate = true
      form.requestSubmit()
    })

    await expect(signup.errorMessage).toBeVisible()
    await expect(signup.errorMessage).toContainText('required')
    await expect(page).toHaveURL('/signup')
  })

  test('shows error when email is already registered', async ({ page, playwright }) => {
    // Create the user first via API
    const reqCtx = await playwright.request.newContext()
    const user = uniqueUser()
    await reqCtx.post('http://localhost:8000/api/auth/signup/', {
      data: {
        username: user.email,
        email: user.email,
        password: user.password,
        password_confirm: user.password,
        name: user.name,
      },
    })
    await reqCtx.dispose()

    // Now try to sign up again with the same email in the browser
    const signup = new SignupPage(page)
    await signup.goto()
    await signup.signup(user.name, user.email, user.password, user.password)

    await expect(signup.errorMessage).toBeVisible()
    await expect(page).toHaveURL('/signup')
  })

  test('has a link to the login page', async ({ page }) => {
    const signup = new SignupPage(page)
    await signup.goto()

    await signup.loginLink.click()
    await expect(page).toHaveURL('/login')
  })
})
