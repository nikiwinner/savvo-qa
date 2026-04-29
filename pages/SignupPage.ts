import { Page, Locator } from '@playwright/test'

export class SignupPage {
  readonly nameInput: Locator
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly confirmPasswordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator
  readonly loginLink: Locator

  constructor(private readonly page: Page) {
    this.nameInput = page.locator('#name')
    this.emailInput = page.locator('#email')
    this.passwordInput = page.locator('#password')
    this.confirmPasswordInput = page.locator('#password_confirm')
    this.submitButton = page.locator('button[type="submit"]')
    this.errorMessage = page.locator('.alert.alert-error')
    this.loginLink = page.locator('a[href="/login"]')
  }

  async goto(url = '/signup'): Promise<void> {
    await this.page.goto(url)
    // Wait for SvelteKit to hydrate — without this, on:submit|preventDefault isn't attached yet
    // and the browser falls back to native GET form submission
    await this.page.waitForLoadState('networkidle')
  }

  async signup(name: string, email: string, password: string, confirmPassword: string): Promise<void> {
    await this.nameInput.fill(name)
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.confirmPasswordInput.fill(confirmPassword)
    await this.submitButton.click()
  }
}
