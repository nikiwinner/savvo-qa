import { Page, Locator } from '@playwright/test'

/**
 * Page object for the analytics surface.
 *
 * Nav redesign (2026-07-03): the GROWTH analytics surface moved off bare
 * `/dashboard` back onto its own route `/dashboard/analytics` (bare `/dashboard`
 * now 307-redirects to `/dashboard/learn`). The heading reads "Analytics" and
 * ALL `analytics-*` / `hero-*` / `dashboard-*` testids are unchanged. `goto()`
 * lands on `/dashboard/analytics` and exposes the KPI hero + section locators +
 * the shared period pill. The per-space Income/Expense/Net summary cards live on
 * `/dashboard/spaces` — use `gotoSpaces()` and the `summary*` helpers (the
 * markers keep their old `summary-figure-*` testids). Logout moved from the
 * removed top bar into the sidebar account block (still `aria-label="Logout"`,
 * still a POST /logout form); the user name is the sidebar `.account-name`.
 */
export class DashboardPage {
  readonly logoutButton: Locator
  readonly userName: Locator
  readonly spacesLink: Locator
  readonly expensesLink: Locator

  // ---- Moved analytics surface (the main dashboard) -----------------------
  readonly hero: Locator
  readonly heroNet: Locator
  readonly periodSelector: Locator
  readonly emptyState: Locator

  constructor(private readonly page: Page) {
    // The top bar was removed in the nav redesign — logout lives in the sidebar
    // account block (bottom), keeping its `aria-label="Logout"`.
    this.logoutButton = page.locator('button[aria-label="Logout"]')
    this.userName = page.locator('.account-name')
    this.spacesLink = page.locator('a[href="/dashboard/spaces"]')
    // The "Transactions" sidebar entry points at /dashboard/transactions
    // (Phase 15, Story 15.2). navHref may append ?space=, so match by prefix.
    this.expensesLink = page.locator('a[href^="/dashboard/transactions"]')

    // The analytics-* testids persist on /dashboard/analytics (the nav redesign
    // kept the marker names to avoid a needless QA-contract churn; the visible
    // copy reads "Analytics").
    this.hero = page.getByTestId('analytics-hero')
    this.heroNet = page.getByTestId('hero-net')
    this.periodSelector = page.getByTestId('dashboard-period-selector')
    this.emptyState = page.getByTestId('dashboard-empty-state')
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard/analytics')
    await this.page.waitForLoadState('networkidle')
  }

  /** The per-space summary cards live on /dashboard/spaces. */
  async gotoSpaces(): Promise<void> {
    await this.page.goto('/dashboard/spaces')
    await this.page.waitForLoadState('networkidle')
  }

  async logout(): Promise<void> {
    await this.logoutButton.click()
    await this.page.waitForURL('/login')
  }

  // ---- KPI hero stats (the dashboard's money display) ---------------------
  heroStat(kind: 'income' | 'expenses' | 'savings'): Locator {
    return this.page.getByTestId(`hero-stat-${kind}`)
  }

  // ---- Per-space summary card figures (now on /dashboard/spaces) -----------
  // Period-scoped, in the viewer's currency. `.first()` targets the first/only
  // card; scope with ?space= to isolate a specific space's card. Call
  // `gotoSpaces()` (or navigate to /dashboard/spaces) before reading these.
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

  // ---- Period selector (shared pill — present on both dashboard & spaces) ---
  periodPreset(key: string): Locator {
    return this.page.getByTestId(`period-preset-${key}`)
  }

  periodWindowLabel(): Locator {
    return this.page.getByTestId('period-window-label')
  }
}
