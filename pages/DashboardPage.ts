import { Page, Locator } from '@playwright/test'

export class DashboardPage {
  /** stat-value elements in DOM order: Households, Expenses, Total $, This Month $ */
  readonly statValues: Locator
  readonly statCards: Locator
  readonly logoutButton: Locator
  readonly userName: Locator
  readonly householdsLink: Locator
  readonly expensesLink: Locator

  constructor(private readonly page: Page) {
    this.statValues = page.locator('.stat-value')
    this.statCards = page.locator('.stat-card')
    this.logoutButton = page.locator('.logout-btn')
    this.userName = page.locator('.user-name')
    this.householdsLink = page.locator('a[href="/dashboard/households"]')
    this.expensesLink = page.locator('a[href="/dashboard/expenses"]')
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard')
  }

  async logout(): Promise<void> {
    await this.logoutButton.click()
    // Wait for the server to process logout and redirect to /login
    await this.page.waitForURL('/login')
  }

  totalHouseholds(): Locator {
    return this.statValues.nth(0)
  }

  totalExpenses(): Locator {
    return this.statValues.nth(1)
  }

  totalAmount(): Locator {
    return this.statValues.nth(2)
  }

  monthlyAmount(): Locator {
    return this.statValues.nth(3)
  }
}
