/**
 * Phase 14 — Story 14.4 — Multi-layer categorization cascade (provider mapping
 * + merchant-seed library), proven via the reapply endpoint.
 *
 * The DEBUG `seed_bank_transaction` endpoint BYPASSES the cascade (it stamps
 * `provider_category` / `category` directly and runs NO categorization), so we
 * prove the cascade hermetically through `POST /api/categorization/reapply/`
 * (Story 14.6) — which runs the SAME `run_cascade` the Tink sync uses — over a
 * space carrying a seeded `ProviderCategoryMapping` / `MerchantSeed`.
 *
 * The merchant-seed library (e.g. `lidl` → Groceries) is populated once at
 * global-setup via `manage.py seed_categorization`. Provider categories are
 * created on demand by the seed endpoint's `provider_category_code` and mapped
 * via the `provider-category-mappings` API.
 *
 * Precedence under test: manual lock > CategoryRule (rung 1/2) > seed (rung 3)
 * > provider/bank (rung 4).
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

// A Tink-style provider category code, mapped via PROVIDER_CATEGORY_MAP/seed
// data only if seeded — here we map it explicitly via the API so the test is
// self-contained and does not depend on a particular code being pre-mapped.
const PROVIDER_CODE = 'expenses:food.groceries'

test.describe('Categorization cascade (via reapply)', () => {
  test('a provider-mapped transaction gets the mapped category after reapply', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Cascade Provider Home')

    // Seed a bank txn carrying a provider category but NO app category. The seed
    // endpoint creates the global ProviderCategory row for this code.
    const txn = await api.createBankTransaction({
      description: 'UNKNOWN PROVIDER MERCHANT ZZX',
      amount: '14.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
      provider_category_code: PROVIDER_CODE,
    })

    // Map that provider category → Groceries (global mapping; idempotent).
    const groceries = await api.getCategoryByName('Groceries')
    expect(groceries, 'Groceries default category should exist').not.toBeNull()
    const providerCat = await api.getProviderCategoryByCode(PROVIDER_CODE)
    expect(providerCat, `provider category ${PROVIDER_CODE} should exist after seed`).not.toBeNull()
    await api.ensureProviderCategoryMapping(providerCat!.id, groceries!.id)

    // Run the cascade. The provider rung should fill Groceries.
    const result = await api.categorizationReapply(space.id)
    expect(result.provider).toBeGreaterThanOrEqual(1)

    // Authoritative: the row's category is Groceries via the API.
    const after = await api.getBankTransaction(txn.id)
    expect(after!.category).toBe(groceries!.id)

    // UI: the row shows the assigned category badge (not the raw bank-cat badge).
    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')
    const row = page.locator('tbody tr.row-bank', { hasText: 'UNKNOWN PROVIDER MERCHANT ZZX' })
    await expect(row).toBeVisible()
    await expect(row.locator('.badge-category')).toContainText('Groceries')
  })

  test('a seeded-merchant transaction gets the seed category after reapply', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Cascade Seed Home')

    // `lidl` is a known MERCHANT_SEED token → Groceries. No provider category.
    const txn = await api.createBankTransaction({
      description: 'LIDL 4821 BERLIN 12MAY',
      amount: '32.10',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    const groceries = await api.getCategoryByName('Groceries')
    expect(groceries, 'Groceries default category should exist').not.toBeNull()

    const result = await api.categorizationReapply(space.id)
    expect(result.seed).toBeGreaterThanOrEqual(1)

    const after = await api.getBankTransaction(txn.id)
    expect(after!.category).toBe(groceries!.id)

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')
    const row = page.locator('tbody tr.row-bank', { hasText: 'LIDL 4821 BERLIN' })
    await expect(row).toBeVisible()
    await expect(row.locator('.badge-category')).toContainText('Groceries')
  })

  test('a matching CategoryRule overrides the mapped provider/seed category', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Cascade Override Home')

    // The row matches BOTH a seed token (`netflix` → Subscriptions) AND a user
    // CategoryRule (merchant_contains 'netflix' → Entertainment). Rule wins.
    const seedCategory = await api.getCategoryByName('Subscriptions') // rung 3 target
    const ruleCategory = await api.getCategoryByName('Entertainment') // rung 1/2 target
    expect(seedCategory).not.toBeNull()
    expect(ruleCategory).not.toBeNull()

    const txn = await api.createBankTransaction({
      description: 'NETFLIX.COM SUBSCRIPTION',
      amount: '12.99',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    // A user rule that targets a DIFFERENT category than the seed would assign.
    await api.createCategoryRule({
      space: space.id,
      name: 'Netflix to Entertainment',
      merchant_contains: 'netflix',
      set_category: ruleCategory!.id,
    })

    const result = await api.categorizationReapply(space.id)
    // The rule wins → attributed to the 'rule' layer, NOT 'seed'.
    expect(result.rule).toBeGreaterThanOrEqual(1)

    const after = await api.getBankTransaction(txn.id)
    expect(after!.category).toBe(ruleCategory!.id)
    expect(after!.category).not.toBe(seedCategory!.id)

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')
    const row = page.locator('tbody tr.row-bank', { hasText: 'NETFLIX.COM' })
    await expect(row).toBeVisible()
    await expect(row.locator('.badge-category')).toContainText('Entertainment')
  })

  test('a manually-categorized row is not changed by reapply', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Cascade Lock Home')

    // Seed a row whose description matches a seed token (`lidl` → Groceries),
    // but hand-categorize it to something else first. The manual lock must hold.
    const txn = await api.createBankTransaction({
      description: 'LIDL 5290 MUNICH 19MAY',
      amount: '18.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    const shopping = await api.getCategoryByName('Shopping')
    const groceries = await api.getCategoryByName('Groceries')
    expect(shopping).not.toBeNull()
    expect(groceries).not.toBeNull()

    // Hand-categorize through the UI modal so we exercise the real lock-stamping
    // path (`category_set_manually=True`).
    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')
    const expenses = new ExpensesPage(page)
    const row = page.locator('tbody tr.row-bank', { hasText: 'LIDL 5290 MUNICH' })
    await expect(row).toBeVisible()
    await expenses.categorizeRow(row, 'Shopping')
    await expect(row.locator('.badge-category')).toContainText('Shopping')

    // Confirm the lock is set server-side.
    const locked = await api.getBankTransaction(txn.id)
    expect(locked!.category).toBe(shopping!.id)

    // Reapply — the seed (Groceries) must NOT overwrite the hand-picked Shopping.
    await api.categorizationReapply(space.id)

    const after = await api.getBankTransaction(txn.id)
    expect(after!.category, 'manual lock must survive reapply').toBe(shopping!.id)
    expect(after!.category).not.toBe(groceries!.id)

    await page.reload()
    await page.waitForLoadState('networkidle')
    const rowAfter = page.locator('tbody tr.row-bank', { hasText: 'LIDL 5290 MUNICH' })
    await expect(rowAfter.locator('.badge-category')).toContainText('Shopping')
  })
})
