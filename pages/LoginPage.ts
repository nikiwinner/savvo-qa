import { Page, Locator } from '@playwright/test'

export class LoginPage {
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator
  readonly signupLink: Locator

  constructor(private readonly page: Page) {
    this.emailInput = page.locator('#email')
    this.passwordInput = page.locator('#password')
    this.submitButton = page.locator('button[type="submit"]')
    this.errorMessage = page.locator('.error-message')
    this.signupLink = page.locator('a[href="/signup"]')
  }

  async goto(): Promise<void> {
    await this.page.goto('/login')
    // Wait for SvelteKit hydration before interacting with the form
    await this.page.waitForLoadState('networkidle')
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}
