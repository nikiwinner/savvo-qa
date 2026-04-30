import { APIRequestContext, APIResponse } from '@playwright/test'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export interface UserRecord {
  email: string
  password: string
  name: string
}

export interface HouseholdRecord {
  id: number
  name: string
}

export interface ExpenseRecord {
  id: number
  description: string
  amount: string
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
  household: number | null
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
  household: number
}

export interface CreateBankTransactionData {
  description: string
  amount: string
  type?: 'expense' | 'income'
  transaction_date: string
  household_id?: number | null
  category_id?: number | null
  merchant_display_name?: string
  provider_category_code?: string
  /** ISO 4217 currency code from the 8-code whitelist. Default 'EUR' (matches backend default). */
  currency?: string
  /** Whether the transaction is pending. Default false. */
  pending?: boolean
}

export interface ReconciliationLinkRecord {
  id: number
  expense_id: number
  bank_transaction_id: number
  source: 'suggestion' | 'manual'
  confidence: string | null
  canonical_source: 'manual' | 'bank'
}

export interface SuggestionRecord {
  expense: { id: number; description: string; amount: string; currency: string }
  bank_transaction: { id: number; description: string; amount: string; currency: string }
  confidence: string
  date_delta_days: number
}

export interface CreateCategoryRuleData {
  household: number
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
  household: number
  description: string
  amount: number
  category?: number | null
  type?: 'expense' | 'income'
  expense_date: string
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

  // ── Households ─────────────────────────────────────────────────────────────

  async createHousehold(name: string, description = ''): Promise<HouseholdRecord> {
    const res = await this.ctx.post(`${this.baseUrl}/api/households/`, {
      data: { name, description },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`createHousehold failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  async listHouseholds(): Promise<HouseholdRecord[]> {
    const res = await this.ctx.get(`${this.baseUrl}/api/households/`)
    if (!res.ok()) {
      throw new Error(`listHouseholds failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** Returns the HTTP status code when fetching a specific household. */
  async getHouseholdStatus(householdId: number): Promise<number> {
    const res = await this.ctx.get(`${this.baseUrl}/api/households/${householdId}/`)
    return res.status()
  }

  async assignUser(householdId: number, userId: number): Promise<void> {
    const res = await this.ctx.put(`${this.baseUrl}/api/households/${householdId}/assign_user/`, {
      data: { user_id: userId },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`assignUser failed (${res.status()}): ${await res.text()}`)
    }
  }

  async unassignUser(householdId: number, userId: number): Promise<APIResponse> {
    return this.ctx.put(`${this.baseUrl}/api/households/${householdId}/unassign_user/`, {
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

  // ── Budgets ────────────────────────────────────────────────────────────────

  async createBudget(data: {
    household: number
    category: number
    amount: string
    year: number
    month: number
  }): Promise<{ id: number; household: number; category: number; amount: string; year: number; month: number; spent: string; pace_status: string; pace_ratio: number; daily_safe_spend: string; remaining: string }> {
    const res = await this.ctx.post(`${this.baseUrl}/api/budgets/`, {
      data,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`createBudget failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  async listBudgets(params: { household?: number; year?: number; month?: number } = {}): Promise<Array<{ id: number; household: number; category: number; amount: string; spent: string; pace_status: string; pace_ratio: number; daily_safe_spend: string }>> {
    const qs = new URLSearchParams()
    if (params.household !== undefined) qs.set('household', String(params.household))
    if (params.year !== undefined) qs.set('year', String(params.year))
    if (params.month !== undefined) qs.set('month', String(params.month))
    const url = `${this.baseUrl}/api/budgets/${qs.toString() ? '?' + qs.toString() : ''}`
    const res = await this.ctx.get(url)
    if (!res.ok()) {
      throw new Error(`listBudgets failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  async listUnbudgeted(params: { household: number; year: number; month: number }): Promise<Array<{ category: { id: number; name: string; icon: string }; spent: string }>> {
    const qs = new URLSearchParams({
      household: String(params.household),
      year: String(params.year),
      month: String(params.month),
    })
    const res = await this.ctx.get(`${this.baseUrl}/api/budgets/unbudgeted/?${qs.toString()}`)
    if (!res.ok()) {
      throw new Error(`listUnbudgeted failed (${res.status()}): ${await res.text()}`)
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

  async listCategoryRules(householdId?: number): Promise<CategoryRuleRecord[]> {
    const url = householdId
      ? `${this.baseUrl}/api/category-rules/?household=${householdId}`
      : `${this.baseUrl}/api/category-rules/`
    const res = await this.ctx.get(url)
    if (!res.ok()) {
      throw new Error(`listCategoryRules failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Reconciliation ─────────────────────────────────────────────────────────

  /**
   * POST /api/reconciliation/links/ — create (confirm) a reconciliation link.
   * Default from_suggestion=false. Use from_suggestion=true for suggestion-page confirms.
   */
  async createReconciliationLink(
    expense_id: number,
    bank_transaction_id: number,
    opts?: { from_suggestion?: boolean },
  ): Promise<ReconciliationLinkRecord> {
    const res = await this.ctx.post(`${this.baseUrl}/api/reconciliation/links/`, {
      data: {
        expense_id,
        bank_transaction_id,
        from_suggestion: opts?.from_suggestion ?? false,
      },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`createReconciliationLink failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * POST /api/reconciliation/rejections/ — record a suggestion rejection (idempotent).
   */
  async rejectSuggestion(
    expense_id: number,
    bank_transaction_id: number,
  ): Promise<{ rejected: boolean; expense_id: number; bank_transaction_id: number }> {
    const res = await this.ctx.post(`${this.baseUrl}/api/reconciliation/rejections/`, {
      data: { expense_id, bank_transaction_id },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`rejectSuggestion failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * DELETE /api/reconciliation/links/<id>/ — remove a reconciliation link.
   */
  async deleteReconciliationLink(link_id: number): Promise<void> {
    const res = await this.ctx.delete(
      `${this.baseUrl}/api/reconciliation/links/${link_id}/`,
      { headers: { 'X-CSRFToken': await this.csrfToken() } },
    )
    if (!res.ok()) {
      throw new Error(`deleteReconciliationLink failed (${res.status()}): ${await res.text()}`)
    }
  }

  /**
   * GET /api/reconciliation/links/?household=<id> — list links for a household.
   */
  async listReconciliationLinks(
    householdId: number,
  ): Promise<{ count: number; results: ReconciliationLinkRecord[] }> {
    const res = await this.ctx.get(
      `${this.baseUrl}/api/reconciliation/links/?household=${householdId}`,
    )
    if (!res.ok()) {
      throw new Error(`listReconciliationLinks failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * GET /api/reconciliation/suggestions/?household=<id> — list outstanding suggestions.
   */
  async listSuggestions(
    householdId: number,
  ): Promise<{ count: number; results: SuggestionRecord[] }> {
    const res = await this.ctx.get(
      `${this.baseUrl}/api/reconciliation/suggestions/?household=${householdId}`,
    )
    if (!res.ok()) {
      throw new Error(`listSuggestions failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * POST /api/reconciliation/links/ — raw post, returns the raw APIResponse so
   * callers can inspect the status code without throwing.
   */
  async createReconciliationLinkRaw(
    expense_id: number,
    bank_transaction_id: number,
    opts?: { from_suggestion?: boolean },
  ) {
    return this.ctx.post(`${this.baseUrl}/api/reconciliation/links/`, {
      data: {
        expense_id,
        bank_transaction_id,
        from_suggestion: opts?.from_suggestion ?? false,
      },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async csrfToken(): Promise<string> {
    const state = await this.ctx.storageState()
    return state.cookies.find((c) => c.name === 'csrftoken')?.value ?? ''
  }
}
