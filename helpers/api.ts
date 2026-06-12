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
  /** Phase 13 — manual-override lock. Exposed read-only on BankTransactionSerializer. */
  is_manually_assigned?: boolean
}

/** Phase 13 — SpaceClaimRule shape (banking). */
export interface ClaimRuleRecord {
  id: number
  space: number
  space_name: string
  name: string
  merchant_contains: string
  merchant_exact: string
  amount_min: string | null
  amount_max: string | null
  date_from: string | null
  date_to: string | null
  txn_type: string
  category: number | null
  bank_account: number | null
  bank_account_name: string | null
  created_at: string
  updated_at: string
}

/** Phase 13 — body for POST /api/claim-rules/ (≥1 condition required). */
export interface CreateClaimRuleData {
  space: number
  name?: string
  merchant_contains?: string
  merchant_exact?: string
  amount_min?: string | null
  amount_max?: string | null
  date_from?: string | null
  date_to?: string | null
  txn_type?: 'expense' | 'income' | 'any'
  category?: number | null
  bank_account?: number | null
}

/** Phase 13 — body for POST /api/claim-rules/from_transaction/. */
export interface FromTransactionData {
  transaction_id: number
  space_id: number
  scope?: 'merchant' | 'account' | 'merchant_account'
  merchant_contains?: string
  apply_to_matching?: boolean
}

export interface FromTransactionResult {
  rule: ClaimRuleRecord
  assigned_transaction_id: number
  matched_count: number
}

/** Phase 13 — GET /api/inbox/summary/ shape. */
export interface InboxSummary {
  total_unmapped: number
  groups: { account_id: number; label: string; unmapped_count: number }[]
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

// ── Coaching date math (UTC-only — never the runner's local tz) ─────────────
//
// Phase 18 streak/recovery fixtures pin `UserProgram.timezone='UTC'`, so EVERY
// seeded date must be computed in UTC. Mixing in the runner machine's local zone
// (e.g. via `new Date().toISOString().slice(0,10)` after a local-tz offset, or
// `Date` getters that read local fields) flakes near midnight. These helpers do
// all arithmetic with the UTC-* getters/`Date.UTC` so the result is tz-stable.

/** Today's date in UTC as `YYYY-MM-DD`. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10)
}

/** A date `n` whole days before UTC-today, as `YYYY-MM-DD`. */
export function utcDateDaysAgo(n: number): string {
  const now = new Date()
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  utc.setUTCDate(utc.getUTCDate() - n)
  return utc.toISOString().slice(0, 10)
}

/**
 * An ISO-8601 UTC instant `n` whole days before now, fixed at 12:00:00Z so the
 * LOCAL (UTC) calendar date is unambiguous regardless of the hour. Feeds
 * `seed/completion/`'s `completed_at`.
 */
export function utcInstantDaysAgo(n: number): string {
  return `${utcDateDaysAgo(n)}T12:00:00Z`
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
      routing_priority: number
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

  /** DELETE /api/expenses/<id>/ — throws on non-OK (2xx). */
  async deleteExpense(expenseId: number): Promise<void> {
    const res = await this.ctx.delete(`${this.baseUrl}/api/expenses/${expenseId}/`, {
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`deleteExpense failed (${res.status()}): ${await res.text()}`)
    }
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

  // ── Categorization (Phase 14) ──────────────────────────────────────────────

  /**
   * POST /api/bank-transactions/<id>/categorize/ — hand-categorize a bank txn.
   * Server-side this stamps `category_set_manually=True` (the manual lock). An
   * explicit `categoryId: null` clears the category AND the lock. `createRule`
   * optionally spawns a non-auto CategoryRule (default false).
   *
   * Raw form returns APIResponse so negative tests can inspect the status.
   */
  async categorizeBankTransactionRaw(
    transactionId: number,
    categoryId: number | null,
    createRule = false,
  ): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/bank-transactions/${transactionId}/categorize/`, {
      data: { category_id: categoryId, create_rule: createRule },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  async categorizeBankTransaction(
    transactionId: number,
    categoryId: number | null,
    createRule = false,
  ): Promise<BankTransactionRecord> {
    const res = await this.categorizeBankTransactionRaw(transactionId, categoryId, createRule)
    if (!res.ok()) {
      throw new Error(`categorizeBankTransaction failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * POST /api/categorization/reapply/ — full-cascade reapply over one space's
   * non-manual, non-pending bank txns (seed/provider FILL then a matching
   * CategoryRule OVERRIDES). Returns per-layer counts.
   */
  async categorizationReapply(
    spaceId: number,
  ): Promise<{ provider: number; seed: number; rule: number; total: number }> {
    const res = await this.ctx.post(`${this.baseUrl}/api/categorization/reapply/`, {
      data: { space_id: spaceId },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`categorizationReapply failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** GET /api/categorization/suggestions/ — pending rung-2 auto-suggestions. */
  async listCategorySuggestions(): Promise<
    { merchant: string; category_id: number; category_name: string; occurrence_count: number; space_id: number }[]
  > {
    const res = await this.ctx.get(`${this.baseUrl}/api/categorization/suggestions/`)
    if (!res.ok()) {
      throw new Error(`listCategorySuggestions failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Provider categories + mappings (Phase 14, rung 4) ──────────────────────

  /** GET /api/provider-categories/ — GLOBAL list of bank PFM categories. */
  async listProviderCategories(): Promise<
    { id: number; provider: string; code: string; display_name: string; type: string }[]
  > {
    const res = await this.ctx.get(`${this.baseUrl}/api/provider-categories/`)
    if (!res.ok()) {
      throw new Error(`listProviderCategories failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** Find a provider category by its raw `code` (e.g. 'expenses:food.groceries'). */
  async getProviderCategoryByCode(
    code: string,
  ): Promise<{ id: number; code: string; display_name: string; type: string } | null> {
    const all = await this.listProviderCategories()
    return all.find((c) => c.code === code) ?? null
  }

  /** GET /api/provider-category-mappings/ — GLOBAL ProviderCategory → Category map. */
  async listProviderCategoryMappings(): Promise<
    { id: number; provider_category: number; category: number; is_seeded: boolean }[]
  > {
    const res = await this.ctx.get(`${this.baseUrl}/api/provider-category-mappings/`)
    if (!res.ok()) {
      throw new Error(`listProviderCategoryMappings failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** Raw POST — returns APIResponse so duplicate-create tests can assert 400. */
  async createProviderCategoryMappingRaw(
    providerCategoryId: number,
    categoryId: number,
  ): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/provider-category-mappings/`, {
      data: { provider_category: providerCategoryId, category: categoryId },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  async createProviderCategoryMapping(
    providerCategoryId: number,
    categoryId: number,
  ): Promise<{ id: number; provider_category: number; category: number; is_seeded: boolean }> {
    const res = await this.createProviderCategoryMappingRaw(providerCategoryId, categoryId)
    if (!res.ok()) {
      throw new Error(`createProviderCategoryMapping failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * Idempotent: maps the provider category to the given category, reusing the
   * existing mapping (PATCH) when one already exists (mappings are global +
   * the OneToOne rejects a duplicate create with a 400). Returns the mapping id.
   */
  async ensureProviderCategoryMapping(providerCategoryId: number, categoryId: number): Promise<number> {
    const existing = (await this.listProviderCategoryMappings()).find(
      (m) => m.provider_category === providerCategoryId,
    )
    if (existing) {
      const res = await this.ctx.patch(
        `${this.baseUrl}/api/provider-category-mappings/${existing.id}/`,
        { data: { category: categoryId }, headers: { 'X-CSRFToken': await this.csrfToken() } },
      )
      if (!res.ok()) {
        throw new Error(`ensureProviderCategoryMapping PATCH failed (${res.status()}): ${await res.text()}`)
      }
      return existing.id
    }
    const created = await this.createProviderCategoryMapping(providerCategoryId, categoryId)
    return created.id
  }

  /** PATCH /api/provider-category-mappings/<id>/ — remap to a new category. */
  async patchProviderCategoryMapping(mappingId: number, categoryId: number): Promise<APIResponse> {
    return this.ctx.patch(`${this.baseUrl}/api/provider-category-mappings/${mappingId}/`, {
      data: { category: categoryId },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
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

  // ── Spaces: routing_priority (Phase 13) ───────────────────────────────────

  /**
   * Raw PATCH on a space — returns APIResponse so negative tests can inspect
   * the status code (e.g. out-of-range routing_priority → 400) without throwing.
   */
  async patchSpaceRaw(spaceId: number, fields: Record<string, unknown>): Promise<APIResponse> {
    return this.ctx.patch(`${this.baseUrl}/api/spaces/${spaceId}/`, {
      data: fields,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  /** Fetch a space's full record (includes routing_priority, start/end dates, is_archived). */
  async getSpaceFull(spaceId: number): Promise<Record<string, unknown> | null> {
    const res = await this.ctx.get(`${this.baseUrl}/api/spaces/${spaceId}/`)
    if (res.status() === 404) return null
    if (!res.ok()) {
      throw new Error(`getSpaceFull failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Claim Rules (Phase 13) ─────────────────────────────────────────────────

  /** Raw POST — returns APIResponse so negative tests (zero conditions) can assert 400. */
  async createClaimRuleRaw(data: CreateClaimRuleData): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/claim-rules/`, {
      data,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  async createClaimRule(data: CreateClaimRuleData): Promise<ClaimRuleRecord> {
    const res = await this.createClaimRuleRaw(data)
    if (!res.ok()) {
      throw new Error(`createClaimRule failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  async listClaimRules(spaceId?: number): Promise<ClaimRuleRecord[]> {
    const url = spaceId
      ? `${this.baseUrl}/api/claim-rules/?space=${spaceId}`
      : `${this.baseUrl}/api/claim-rules/`
    const res = await this.ctx.get(url)
    if (!res.ok()) {
      throw new Error(`listClaimRules failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  async deleteClaimRule(ruleId: number): Promise<APIResponse> {
    return this.ctx.delete(`${this.baseUrl}/api/claim-rules/${ruleId}/`, {
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  /** Raw — returns APIResponse so negative tests (foreign/archived space) can assert 400. */
  async fromTransactionRaw(data: FromTransactionData): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/claim-rules/from_transaction/`, {
      data,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  async fromTransaction(data: FromTransactionData): Promise<FromTransactionResult> {
    const res = await this.fromTransactionRaw(data)
    if (!res.ok()) {
      throw new Error(`fromTransaction failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Bank transaction: single assign (Phase 13 override-stamping) ───────────

  async assignTransactionRaw(transactionId: number, spaceId: number): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/bank-transactions/${transactionId}/assign/`, {
      data: { space_id: spaceId },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  // ── Inbox (Phase 13) ────────────────────────────────────────────────────────

  async inboxSummary(): Promise<InboxSummary> {
    const res = await this.ctx.get(`${this.baseUrl}/api/inbox/summary/`)
    if (!res.ok()) {
      throw new Error(`inboxSummary failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Orphaned manual expenses (Phase 13 Story 13.6) ────────────────────────

  async listOrphanedExpenses(): Promise<ExpenseRecord[]> {
    const res = await this.ctx.get(`${this.baseUrl}/api/expenses/orphaned/`)
    if (!res.ok()) {
      throw new Error(`listOrphanedExpenses failed (${res.status()}): ${await res.text()}`)
    }
    const body = await res.json()
    // The action may return a bare list or a paginated {results:[]} envelope.
    return Array.isArray(body) ? body : (body.results ?? [])
  }

  async rehomeExpenseRaw(expenseId: number, spaceId: number): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/expenses/${expenseId}/rehome/`, {
      data: { space_id: spaceId },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  /** Delete a space with an explicit rehome_to (null = orphan its rows). */
  async deleteSpaceRehome(spaceId: number, rehomeTo: number | null): Promise<APIResponse> {
    return this.ctx.delete(`${this.baseUrl}/api/spaces/${spaceId}/`, {
      data: { rehome_to: rehomeTo },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  /** POST /api/spaces/<id>/archive/ — Phase 12 lifecycle action. */
  async archiveSpaceRaw(spaceId: number): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/spaces/${spaceId}/archive/`, {
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  // ── Routing engine (DEBUG-only seed) ──────────────────────────────────────

  /**
   * POST /api/seed/route-unmapped/ — DEBUG-only endpoint that runs the REAL
   * routing engine (`route_transaction`, incl. `resolve_conflict`) over the
   * requesting user's unmapped (`space=NULL`), non-manually-assigned, non-split
   * bank transactions and assigns each to the resolved space. This is the
   * on-demand equivalent of routing-at-Tink-sync (which cannot be driven from
   * E2E), so it lets us exercise the conflict resolver / single-space fallback
   * branches. Returns `{ routed: N }` — the count of txns that resolved to a
   * space (txns that stay in the Inbox are NOT counted).
   */
  async routeUnmapped(): Promise<{ routed: number }> {
    const res = await this.ctx.post(`${this.baseUrl}/api/seed/route-unmapped/`, {
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`routeUnmapped failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Phase 16 — routing redesign (apply / suggestions / backfill seeds) ────

  /**
   * POST /api/claim-rules/<id>/apply/ — re-apply an existing rule to the user's
   * matching non-manual, non-split bank txns. Raw form returns APIResponse so
   * negative tests (non-member rule → 404) can inspect the status.
   */
  async applyClaimRuleRaw(ruleId: number): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/claim-rules/${ruleId}/apply/`, {
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  async applyClaimRule(ruleId: number): Promise<{ matched_count: number }> {
    const res = await this.applyClaimRuleRaw(ruleId)
    if (!res.ok()) {
      throw new Error(`applyClaimRule failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** GET /api/claim-rules/suggestions/ — learned merchant→space suggestions (Story 16.5). */
  async listSpaceSuggestions(): Promise<
    { merchant: string; space_id: number; space_name: string; occurrence_count: number }[]
  > {
    const res = await this.ctx.get(`${this.baseUrl}/api/claim-rules/suggestions/`)
    if (!res.ok()) {
      throw new Error(`listSpaceSuggestions failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** Raw POST /api/claim-rules/suggestions/accept/ — returns APIResponse for negative tests. */
  async acceptSpaceSuggestionRaw(spaceId: number, merchant: string): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/claim-rules/suggestions/accept/`, {
      data: { space_id: spaceId, merchant },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  async acceptSpaceSuggestion(
    spaceId: number,
    merchant: string,
  ): Promise<{ rule: ClaimRuleRecord; matched_count: number }> {
    const res = await this.acceptSpaceSuggestionRaw(spaceId, merchant)
    if (!res.ok()) {
      throw new Error(`acceptSpaceSuggestion failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * POST /api/seed/auto-attach/ — DEBUG-only: fabricate non-manual, non-split,
   * space-attached "auto-attached" bank rows (the pre-Phase-16-backfill state).
   * Returns the created count + transaction ids.
   */
  async seedAutoAttach(
    spaceId: number,
    opts: { count?: number; merchant?: string } = {},
  ): Promise<{ created: number; transaction_ids: number[] }> {
    const body: Record<string, unknown> = { space_id: spaceId }
    if (opts.count !== undefined) body['count'] = opts.count
    if (opts.merchant !== undefined) body['merchant'] = opts.merchant
    const res = await this.ctx.post(`${this.baseUrl}/api/seed/auto-attach/`, {
      data: body,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`seedAutoAttach failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * POST /api/seed/run-backfill/ — DEBUG-only: run the Phase-16 backfill for the
   * requesting user on demand (the migration already ran at stack startup before
   * the test's seeds, so this is how a test triggers it on fresh data).
   * Returns the real move counts.
   */
  async runBackfill(): Promise<{ moved_to_inbox: number; rerouted: number; unchanged: number }> {
    const res = await this.ctx.post(`${this.baseUrl}/api/seed/run-backfill/`, {
      data: {},
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`runBackfill failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** POST /api/bank-transactions/<id>/set_allocations/ — split across spaces. */
  async setBankAllocationsRaw(
    transactionId: number,
    allocations: { space_id: number; amount: string }[],
  ): Promise<APIResponse> {
    return this.ctx.post(
      `${this.baseUrl}/api/bank-transactions/${transactionId}/set_allocations/`,
      {
        data: { allocations },
        headers: { 'X-CSRFToken': await this.csrfToken() },
      },
    )
  }

  /**
   * POST /api/expenses/<id>/set_allocations/ — split a manual expense across
   * spaces (gotcha #33). The allocation amounts MUST sum to the parent's full
   * amount (rejection, never proration). Raw form returns APIResponse so
   * negative tests can inspect the status without throwing.
   */
  async setExpenseAllocationsRaw(
    expenseId: number,
    allocations: { space_id: number; amount: string }[],
  ): Promise<APIResponse> {
    return this.ctx.post(`${this.baseUrl}/api/expenses/${expenseId}/set_allocations/`, {
      data: { allocations },
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
  }

  async setExpenseAllocations(
    expenseId: number,
    allocations: { space_id: number; amount: string }[],
  ): Promise<void> {
    const res = await this.setExpenseAllocationsRaw(expenseId, allocations)
    if (!res.ok()) {
      throw new Error(`setExpenseAllocations failed (${res.status()}): ${await res.text()}`)
    }
  }

  // ── Unified transactions feed (Phase 15) ──────────────────────────────────

  /**
   * GET /api/transactions/ — the unified, allocation-aware feed (contract A).
   * Returns the raw paginated envelope `{count,next,previous,totals,results}`.
   * `query` is a ready-made query string WITHOUT the leading `?` (e.g.
   * `space=3&type=income`). Used to assert card↔feed sum-parity from a test.
   */
  async getTransactionsFeed(query = ''): Promise<{
    count: number
    next: string | null
    previous: string | null
    totals: { income: string; expense: string; net: string; currency: string; fx_stale: boolean }
    results: {
      kind: 'manual' | 'bank'
      id: number
      attributed_amount: string
      attributed_currency: string
      is_split: boolean
      allocation_count: number
      type: 'expense' | 'income'
      space_id: number | null
      [key: string]: unknown
    }[]
  }> {
    const url = query ? `${this.baseUrl}/api/transactions/?${query}` : `${this.baseUrl}/api/transactions/`
    const res = await this.ctx.get(url)
    if (!res.ok()) {
      throw new Error(`getTransactionsFeed failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Per-space summary (Phase 15) ───────────────────────────────────────────

  /**
   * GET /api/spaces/summary/ — per-space Income/Expense/Net (contract B).
   * `query` is a query string WITHOUT the leading `?` (e.g. `space=3&period=2026-06`).
   */
  async getSpacesSummary(query = ''): Promise<{
    period: string
    currency: string
    spaces: {
      space_id: number
      space_name: string
      inflow: string
      outflow: string
      net: string
      fx_stale: boolean
    }[]
  }> {
    const url = query ? `${this.baseUrl}/api/spaces/summary/?${query}` : `${this.baseUrl}/api/spaces/summary/`
    const res = await this.ctx.get(url)
    if (!res.ok()) {
      throw new Error(`getSpacesSummary failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Coaching: program state + completions (DEBUG-only seed, Phase 18) ──────

  /**
   * POST /api/seed/program-state/ — DEBUG-only: upsert the requesting user's
   * `UserProgram` to a forced state (`start_date` / `current_day` / `timezone`).
   * Used by recovery/landing/streak fixtures to pin the program deterministically.
   *
   * **Timezone pitfall (HARD):** always pass `timezone: 'UTC'` and compute every
   * seeded `completed_at` in UTC (see {@link utcDateDaysAgo}) — never let the
   * runner machine's local tz leak into the date math, or the suite flakes near
   * midnight. An invalid tz is a 400 (the seed must be deterministic).
   */
  async seedProgramState(state: {
    start_date?: string
    current_day?: number
    timezone?: string
  }): Promise<{ start_date: string; current_day: number; timezone: string }> {
    const res = await this.ctx.post(`${this.baseUrl}/api/seed/program-state/`, {
      data: state,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`seedProgramState failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /**
   * POST /api/seed/completion/ — DEBUG-only: backdate a `MissionCompletion` for
   * the requesting user. Idempotent on `(user, day_number)` (update_or_create —
   * re-POST safe). `completed_at` MUST be ISO-8601 UTC (e.g. `2026-06-12T08:00:00Z`).
   */
  async seedCompletion(data: {
    day_number: number
    completed_at: string
    is_recovery?: boolean
  }): Promise<{
    id: number
    day_number: number
    completed_at: string
    is_recovery: boolean
    created: boolean
  }> {
    const res = await this.ctx.post(`${this.baseUrl}/api/seed/completion/`, {
      data,
      headers: { 'X-CSRFToken': await this.csrfToken() },
    })
    if (!res.ok()) {
      throw new Error(`seedCompletion failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  /** GET /api/missions/today/ — direct API read of the resolved mission payload. */
  async getMissionToday(tz?: string): Promise<Record<string, unknown>> {
    const url = tz
      ? `${this.baseUrl}/api/missions/today/?tz=${encodeURIComponent(tz)}`
      : `${this.baseUrl}/api/missions/today/`
    const res = await this.ctx.get(url)
    if (!res.ok()) {
      throw new Error(`getMissionToday failed (${res.status()}): ${await res.text()}`)
    }
    return res.json()
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async csrfToken(): Promise<string> {
    const state = await this.ctx.storageState()
    return state.cookies.find((c) => c.name === 'csrftoken')?.value ?? ''
  }
}
