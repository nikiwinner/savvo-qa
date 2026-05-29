import { APIRequestContext, APIResponse } from '@playwright/test'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'

export interface UserRecord {
  email: string
  password: string
  name: string
}

export interface SpaceRecord {
  id: number
  name: string
}

export interface ExpenseRecord {
  id: number
  description: string
  amount: string
  category: number | null
  category_detail: { id: number; name: string; icon: string } | null
}

export interface CategoryRecord {
  id: number
  name: string
  icon: string
  is_default: boolean
}

export interface BankTransactionRecord {
  id: number
  account_id: number
  connection_id: number
  description: string
  amount: string
  type: string
  transaction_date: string
  space: number | null
  category: number | null
  merchant_display_name: string
}

export interface CategoryRuleRecord {
  id: number
  name: string
  priority: number
  merchant_contains: string
  merchant_exact: string
  is_auto: boolean
  set_category: number | null
  rename_merchant: string
  space: number
}

export interface CreateBankTransactionData {
  description: string
  amount: string
  type?: 'expense' | 'income'
  transaction_date: string
  space_id?: number | null
  category_id?: number | null
  merchant_display_name?: string
  provider_category_code?: string
  /** ISO 4217 currency code from the 8-code whitelist. Default 'EUR' (matches backend default). */
  currency?: string
  /** Whether the transaction is pending. Default false. */
  pending?: boolean
}

export interface CreateCategoryRuleData {
  space: number
  name: string
  priority?: number
  merchant_contains?: string
  merchant_exact?: string
  amount_min?: string | null
  amount_max?: string | null
  bank_account?: number | null
  set_category?: number | null
  rename_merchant?: string
  is_auto?: boolean
}

export interface CreateExpenseData {
  space: number
  description: string
  amount: number
  category?: number | null
  type?: 'expense' | 'income'
  expense_date: string
  /** ISO 4217 currency code from the 8-code whitelist. Default: viewer's User.currency. */
  currency?: string
}

/** Unique email to avoid conflicts between parallel tests */
export function uniqueUser(prefix = 'user'): UserRecord {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 6)
  return {
    email: `${prefix}-${ts}-${rand}@test.local`,
    password: 'TestPass123!',
    name: `Test ${prefix} ${ts}`,
  }
}

/**
 * Wraps a single APIRequestContext as one authenticated actor.
 * Auth endpoints are @csrf_exempt so they need no CSRF header.
 * All other mutating endpoints require X-CSRFToken from the cookie jar.
 */
export class ApiHelper {
  constructor(
    private readonly ctx: APIRequestContext,
    private readonly baseUrl = BACKEND_URL,
  ) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  async signup(user: UserRecord, currency?: string): Promise<void> {
    const data: Record<string, string> = {
      username: user.email,
      email: user.email,
      password: user.password,
      password_confirm: user.password,
      name: user.name,
    }
    if (currency !== undefined) {
      data['currency'] = currency
    }
    const res = await this.ctx.post(`${this.baseUrl}/api/auth/signup/`, { data })
    if (!res.ok()) {
      throw new Error(`signup failed (${res.status()}): ${await res.text()}`)
    }
  }

  async setUserCurrency(code: string): Promise<void> {
    const res = await this.ctx.patch(`${this.baseUrl}/api/auth/profile/`, {
      data: { currency: code },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`setUserCurrency failed (${res.status()}): ${await res.text()}`)
    }
  }

  async login(email: string, password: string): Promise<void> {
    // If a session already exists (e.g. after signup), DRF's SessionAuthentication
    // will enforce CSRF on the login request. Send the token when we have it.
    const csrf = await this.csrfToken()
    const res = await this.ctx.post(`${this.baseUrl}/api/auth/login/`, {
      data: { username: email, password },
      headers: csrf ? { 'X-CSRFToken': csrf } : {},
    })
    if (!res.ok()) {
      throw new Error(`login failed (${res.status()}): ${await res.text()}`)
    }
    // Session + CSRF cookies are now stored in ctx's cookie jar automatically
  }

  /** Returns all cookies currently held by this context. */
  async cookies() {
    const state = await this.ctx.storageState()
    return state.cookies
  }

  // ── Spaces ─────────────────────────────────────────────────────────────

  async createSpace(name: string, description = ''): Promise<SpaceRecord> {
    const res = await this.ctx.post(`${this.baseUrl}/api/spaces/`, {
      data: { name, description },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`createSpace failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * PATCH arbitrary editable fields on a space. Used by lifecycle tests to
   * seed start_date / end_date directly after create (the SpacesPage UI only
   * speaks DatePicker which is harder to drive via Playwright than a single
   * PATCH).
   */
  async updateSpace(
    spaceId: number,
    fields: Partial<{
      name: string
      description: string
      start_date: string | null
      end_date: string | null
      primary_currency: string
    }>,
  ): Promise<SpaceRecord> {
    const res = await this.ctx.patch(`${this.baseUrl}/api/spaces/${spaceId}/`, {
      data: fields,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`updateSpace failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  async listSpaces(): Promise<SpaceRecord[]> {
    const res = await this.ctx.get(`${this.baseUrl}/api/spaces/`)
    if (!res.ok()) {
      throw new Error(`listSpaces failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** Returns the HTTP status code when fetching a specific space. */
  async getSpaceStatus(spaceId: number): Promise<number> {
    const res = await this.ctx.get(`${this.baseUrl}/api/spaces/${spaceId}/`)
    return res.status()
  }

  async assignUser(spaceId: number, userId: number): Promise<void> {
    const res = await this.ctx.put(`${this.baseUrl}/api/spaces/${spaceId}/assign_user/`, {
      data: { user_id: userId },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`assignUser failed (${res.status()}): ${await res.text()}`)
    }
  }

  async unassignUser(spaceId: number, userId: number): Promise<APIResponse> {
    return this.ctx.put(`${this.baseUrl}/api/spaces/${spaceId}/unassign_user/`, {
      data: { user_id: userId },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  async me(): Promise<{ id: number; email: string; name: string; currency?: string } | null> {
    const res = await this.ctx.get(`${this.baseUrl}/api/auth/me/`)
    const data = await res.json()
    return data.user ?? null
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  async createExpense(data: CreateExpenseData): Promise<ExpenseRecord> {
    const res = await this.ctx.post(`${this.baseUrl}/api/expenses/`, {
      data,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`createExpense failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  async listExpenses(): Promise<ExpenseRecord[]> {
    const res = await this.ctx.get(`${this.baseUrl}/api/expenses/`)
    if (!res.ok()) {
      throw new Error(`listExpenses failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async createCategory(name: string, icon = ''): Promise<CategoryRecord> {
    const res = await this.ctx.post(`${this.baseUrl}/api/categories/`, {
      data: { name, icon },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`createCategory failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * Idempotent variant of {@link createCategory}. Returns the existing row
   * by name when POST returns 400 "already exists".
   *
   * Categories are global (CLAUDE.md Gotcha #9) — the QA test DB persists
   * across project runs (chromium → mobile-safari → tablet) and across
   * separate `pnpm test` invocations. Use this helper from any test that
   * seeds shared category names; reserve {@link createCategory} for tests
   * that explicitly assert on the strict 400 duplicate behaviour.
   */
  async findOrCreateCategory(name: string, icon = ''): Promise<CategoryRecord> {
    const res = await this.ctx.post(`${this.baseUrl}/api/categories/`, {
      data: { name, icon },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (res.ok()) {
      return res.json()
    }
    if (res.status() === 400) {
      const body = await res.text()
      if (body.includes('already exists')) {
        const existing = await this.getCategoryByName(name)
        if (existing) {
          return existing
        }
      }
      throw new Error(`findOrCreateCategory failed (${res.status()}): ${body}`)
    }
    throw new Error(`findOrCreateCategory failed (${res.status()}): ${await res.text()}`)
  }

  async listCategories(): Promise<CategoryRecord[]> {
    const res = await this.ctx.get(`${this.baseUrl}/api/categories/`)
    if (!res.ok()) {
      throw new Error(`listCategories failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  async getCategoryByName(name: string): Promise<CategoryRecord | null> {
    const cats = await this.listCategories()
    return cats.find((c) => c.name === name) ?? null
  }

  /** Returns the HTTP status code when fetching a specific expense. */
  async getExpenseStatus(expenseId: number): Promise<number> {
    const res = await this.ctx.get(`${this.baseUrl}/api/expenses/${expenseId}/`)
    return res.status()
  }

  // ── Bank Transactions (debug seeding) ─────────────────────────────────────

  async createBankTransaction(data: CreateBankTransactionData): Promise<BankTransactionRecord> {
    const res = await this.ctx.post(`${this.baseUrl}/api/seed/bank-transaction/`, {
      data,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`createBankTransaction failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * POST /api/seed/bank-connection-status/ — DEBUG-only endpoint that forces
   * a BankConnection.status (and optionally error_message) for E2E tests.
   * Used to exercise the SyncProgress passive-mode and 30s-hint flows where
   * we need to pin status='syncing' server-side without racing a real /sync/.
   */
  async setBankConnectionStatus(
    connectionId: number,
    statusValue:
      | 'awaiting_auth'
      | 'connected'
      | 'syncing'
      | 'error'
      | 'disconnected',
    errorMessage?: string,
  ): Promise<{ id: number; status: string; error_message: string }> {
    const body: Record<string, unknown> = {
      connection_id: connectionId,
      status: statusValue,
    }
    if (errorMessage !== undefined) {
      body['error_message'] = errorMessage
    }
    const res = await this.ctx.post(`${this.baseUrl}/api/seed/bank-connection-status/`, {
      data: body,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`setBankConnectionStatus failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Bank Transactions: bulk_set_space ─────────────────────────────────

  /**
   * POST /api/bank-transactions/bulk_set_space/ — raw, returns APIResponse so
   * negative tests can inspect the status code without throwing.
   * `spaceId === null` unmaps; pass `undefined` to omit the key entirely.
   */
  async bulkSetSpaceRaw(
    transactionIds: number[],
    spaceId: number | null | undefined,
  ): Promise<APIResponse> {
    const body: Record<string, unknown> = { transaction_ids: transactionIds }
    if (spaceId !== undefined) {
      body['space_id'] = spaceId
    }
    return this.ctx.post(`${this.baseUrl}/api/bank-transactions/bulk_set_space/`, {
      data: body,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  /** Throws on non-OK; returns the JSON response (`{ updated: number }`). */
  async bulkSetSpace(
    transactionIds: number[],
    spaceId: number | null,
  ): Promise<{ updated: number }> {
    const res = await this.bulkSetSpaceRaw(transactionIds, spaceId)
    if (!res.ok()) {
      throw new Error(`bulkSetSpace failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** Fetch a single bank transaction's record via the list endpoint. */
  async getBankTransaction(id: number): Promise<BankTransactionRecord | null> {
    const res = await this.ctx.get(`${this.baseUrl}/api/bank-transactions/${id}/`)
    if (res.status() === 404) return null
    if (!res.ok()) {
      throw new Error(`getBankTransaction failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Category Rules ─────────────────────────────────────────────────────────

  async createCategoryRule(data: CreateCategoryRuleData): Promise<CategoryRuleRecord> {
    const res = await this.ctx.post(`${this.baseUrl}/api/category-rules/`, {
      data,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`createCategoryRule failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  async listCategoryRules(spaceId?: number): Promise<CategoryRuleRecord[]> {
    const url = spaceId
      ? `${this.baseUrl}/api/category-rules/?space=${spaceId}`
      : `${this.baseUrl}/api/category-rules/`
    const res = await this.ctx.get(url)
    if (!res.ok()) {
      throw new Error(`listCategoryRules failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Bank Accounts (DEBUG-only seed) ────────────────────────────────────────

  /**
   * POST /api/seed/bank-account/ — DEBUG-only endpoint (Phase 11 Story 11.7)
   * that creates a BankConnection + BankAccount with explicit balance fields,
   * optionally also seeding one BankTransaction mapped to a space so the
   * analytics `balance-summary` scoping filter includes the account.
   *
   * Pass `balance_amount: null` to seed a "never synced" account.
   */
  async seedBankAccount(data: {
    account_name: string
    bank_name?: string
    balance_amount: string | null
    balance_currency?: string
    balance_updated_at?: string | null
    space_id?: number | null
  }): Promise<{
    account_id: number
    connection_id: number
    account_name: string
    bank_name: string
    balance_amount: string | null
    balance_currency: string
    balance_updated_at: string | null
  }> {
    const res = await this.ctx.post(`${this.baseUrl}/api/seed/bank-account/`, {
      data,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`seedBankAccount failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── FX (DEBUG-only seed) ───────────────────────────────────────────────────

  /**
   * POST /api/seed/exchange-rate/ — DEBUG-only endpoint that pre-fills the
   * ExchangeRate cache so tests are deterministic without hitting the live
   * Frankfurter provider. The QA backend points FX_PROVIDER_BASE_URL at an
   * unreachable host (see playwright.config.ts), so any rate not seeded will
   * raise FXRateUnavailableError and surface fx_stale=true.
   */
  async seedExchangeRate(
    base_currency: string,
    quote_currency: string,
    rate: string,
    on_date?: string,
  ): Promise<{ id: number; date: string; base_currency: string; quote_currency: string; rate: string }> {
    const body: Record<string, string> = { base_currency, quote_currency, rate }
    if (on_date !== undefined) {
      body['date'] = on_date
    }
    const res = await this.ctx.post(`${this.baseUrl}/api/seed/exchange-rate/`, {
      data: body,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`seedExchangeRate failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async csrfToken(): Promise<string> {
    const state = await this.ctx.storageState()
    return state.cookies.find((c) => c.name === 'csrftoken')?.value ?? ''
  }
}
