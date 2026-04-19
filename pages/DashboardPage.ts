import { Page, Locator } from '@playwright/test'

export class DashboardPage {
  /** stat-value elements in DOM order (after Story 1.9):
   * 0: Total Households
   * 1: Total Transactions
   * 2: Total Income ($)
   * 3: Total Expenses ($)
   * 4: Net Balance ($)
   * 5: This Month Income ($)
   * 6: This Month Expenses ($)
   */
  readonly statValues: Locator
  readonly statCards: Locator
  readonly logoutButton: Locator
  readonly userName: Locator
  readonly householdsLink: Locator
  readonly expensesLink: Locator

  constructor(private readonly page: Page) {
    this.statValues = page.locator('.stat-value')
    this.statCards = page.locator('.stat-card')
    this.logoutButton = page.locator('.logout-topbar-btn')
    this.userName = page.locator('.user-name')
    this.householdsLink = page.locator('a[href="/dashboard/households"]')
    this.expensesLink = page.locator('a[href="/dashboard/expenses"]')
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard')
    await this.page.waitForLoadState('networkidle')
  }

  async logout(): Promise<void> {
    await this.logoutButton.click()
    // Wait for the server to process logout and redirect to /login
    await this.page.waitForURL('/login')
  }

  totalHouseholds(): Locator {
    return this.statValues.nth(0)
  }

  totalTransactions(): Locator {
    return this.statValues.nth(1)
  }

  /** @deprecated use totalTransactions() — label changed to "Total Transactions" */
  totalExpenses(): Locator {
    return this.statValues.nth(1)
  }

  totalIncome(): Locator {
    return this.statValues.nth(2)
  }

  totalExpenseAmount(): Locator {
    return this.statValues.nth(3)
  }

  netBalance(): Locator {
    return this.statValues.nth(4)
  }

  monthlyIncomeAmount(): Locator {
    return this.statValues.nth(5)
  }

  monthlyExpenseAmount(): Locator {
    return this.statValues.nth(6)
  }

  /** @deprecated use totalIncome() or totalExpenseAmount() instead */
  totalAmount(): Locator {
    return this.statValues.nth(2)
  }

  /** @deprecated use monthlyExpenseAmount() instead */
  monthlyAmount(): Locator {
    return this.statValues.nth(6)
  }
}
