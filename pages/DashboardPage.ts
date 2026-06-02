import { Page, Locator } from '@playwright/test'

export class DashboardPage {
  /**
   * After the user-review 2026-06-02 rework the dashboard's money display is the
   * per-space summary card (Income/Expense/Net for the selected period), NOT a
   * grid of all-time totals. The only `.stat-value` cards left are:
   *   0: Total Spaces
   *   1: Transactions (in the selected period)
   * Use the summary* helpers for money figures and periodPreset* for the period
   * control.
   */
  readonly statValues: Locator
  readonly statCards: Locator
  readonly logoutButton: Locator
  readonly userName: Locator
  readonly spacesLink: Locator
  readonly expensesLink: Locator

  constructor(private readonly page: Page) {
    this.statValues = page.locator('.stat-value')
    this.statCards = page.locator('.stat-card')
    this.logoutButton = page.locator('.logout-topbar-btn')
    this.userName = page.locator('.user-name')
    this.spacesLink = page.locator('a[href="/dashboard/spaces"]')
    // The "Transactions" sidebar entry points at /dashboard/transactions
    // (Phase 15, Story 15.2). navHref may append ?space=, so match by prefix.
    this.expensesLink = page.locator('a[href^="/dashboard/transactions"]')
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard')
    await this.page.waitForLoadState('networkidle')
  }

  async logout(): Promise<void> {
    await this.logoutButton.click()
    await this.page.waitForURL('/login')
  }

  // ---- Secondary stat cards ----------------------------------------------
  totalSpaces(): Locator {
    return this.statValues.nth(0)
  }

  /** Transactions in the selected period (user review 2026-06-02). */
  totalTransactions(): Locator {
    return this.page.getByTestId('period-transactions-count')
  }

  // ---- Per-space summary card figures (the dashboard's money display) ------
  // Period-scoped, in the viewer's currency. `.first()` targets the first/only
  // card; scope the dashboard with ?space= to isolate a specific space's card.
  summaryInflow(): Locator {
    return this.page.locator('[data-testid="summary-figure-inflow"] .figure-value').first()
  }

  summaryOutflow(): Locator {
    return this.page.locator('[data-testid="summary-figure-outflow"] .figure-value').first()
  }

  summaryNet(): Locator {
    return this.page.locator('[data-testid="summary-figure-net"] .figure-value').first()
  }

  /** The clickable Expense figure (the <a> deep-link), first/only card. */
  summaryOutflowLink(): Locator {
    return this.page.locator('[data-testid="summary-figure-outflow"]').first()
  }

  // ---- Period selector ----------------------------------------------------
  periodPreset(key: string): Locator {
    return this.page.getByTestId(`period-preset-${key}`)
  }

  periodWindowLabel(): Locator {
    return this.page.getByTestId('period-window-label')
  }
}
