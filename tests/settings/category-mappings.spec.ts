/**
 * Phase 14 — Stories 14.3 / 14.7 — Provider-category mapping editor.
 *
 * The "Bank category mappings" section on /dashboard/settings/categories lets a
 * user map their bank's PFM categories (rung 4) to an app Category. Since
 * 2026-08-20 a mapping is PER USER: the seeded rows are shared, immutable
 * defaults, and editing one writes YOUR OWN override (the row used to be global
 * and writable by anyone, so one tenant's edit re-categorized another's money).
 * Editing changes what the cascade (run via reapply) assigns to YOUR rows.
 *
 * NOTE on the empty-state test: `/api/provider-categories/` is GLOBAL and the QA
 * test DB is shared across specs + projects, so provider categories seeded by a
 * sibling spec persist. The empty state is therefore only deterministically
 * reachable when NO provider category exists DB-wide. We assert the section
 * renders without breaking and, when the global list happens to be empty,
 * assert the empty-state copy — never a broken table.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

// Unique provider code per test run so this spec controls its own provider
// category and is not perturbed by sibling specs' codes.
function uniqueCode(): string {
  return `expenses:e2e.mapping_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

test.describe('Bank category mappings editor', () => {
  test('editing a bank category mapping changes what new categorization assigns', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Mapping Edit Home')
    const code = uniqueCode()

    // Seed a bank txn carrying a fresh provider category, no app category, no
    // seed-token match in its description. The seed endpoint creates the global
    // ProviderCategory for `code`.
    const txn = await api.createBankTransaction({
      description: `OPAQUE MAPPING MERCHANT ${Date.now()}`,
      amount: '21.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
      provider_category_code: code,
    })

    const transportation = await api.getCategoryByName('Transportation')
    expect(transportation, 'Transportation default category should exist').not.toBeNull()
    const providerCat = await api.getProviderCategoryByCode(code)
    expect(providerCat, `provider category ${code} should exist after seed`).not.toBeNull()

    // Set the mapping through the UI select on the categories page.
    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    const mappingsSection = page.locator('.mappings-section')
    await expect(mappingsSection.locator('h2', { hasText: 'Bank category mappings' })).toBeVisible()

    // Find the row for our provider category and pick Transportation in its select.
    const providerRow = mappingsSection.locator('tbody tr', {
      hasText: providerCat!.display_name,
    })
    await expect(providerRow).toBeVisible()
    const select = providerRow.locator('select.mapping-select')
    await select.selectOption(String(transportation!.id))

    // The PATCH/POST is fired on change — wait until it's reflected via the API.
    await expect(async () => {
      const mappings = await api.listProviderCategoryMappings()
      const m = mappings.find((x) => x.provider_category === providerCat!.id)
      expect(m?.category).toBe(transportation!.id)
    }).toPass({ timeout: 8000 })

    // Reapply the cascade — the row now resolves to Transportation via the edited
    // provider mapping (rung 4).
    const result = await api.categorizationReapply(space.id)
    expect(result.provider).toBeGreaterThanOrEqual(1)

    const after = await api.getBankTransaction(txn.id)
    expect(after!.category, 'reapply should assign the edited mapping target').toBe(transportation!.id)
  })

  test('a mapping edit is my own override, and Default resets it', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Mapping Override Home')
    const code = uniqueCode()

    await api.createBankTransaction({
      description: `OVERRIDE MAPPING MERCHANT ${Date.now()}`,
      amount: '13.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
      provider_category_code: code,
    })
    const groceries = await api.getCategoryByName('Groceries')
    expect(groceries, 'Groceries default category should exist').not.toBeNull()
    const providerCat = await api.getProviderCategoryByCode(code)
    expect(providerCat, `provider category ${code} should exist after seed`).not.toBeNull()

    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    const providerRow = page.locator('.mappings-section tbody tr', {
      hasText: providerCat!.display_name,
    })
    const select = providerRow.locator('select.mapping-select')

    // Every row offers the shared default explicitly, and starts on it.
    await expect(select.locator('option[value="default"]')).toHaveCount(1)
    await expect(select).toHaveValue('default')

    // Picking a category writes MY override — never a shared row.
    await select.selectOption(String(groceries!.id))
    await expect(async () => {
      const mappings = await api.listProviderCategoryMappings()
      const mine = mappings.find(
        (x) => x.provider_category === providerCat!.id && x.is_default === false,
      )
      expect(mine?.category).toBe(groceries!.id)
    }).toPass({ timeout: 8000 })

    // Picking "Default" deletes the override and puts the row back on the shared
    // value — it does NOT delete anything shared.
    await select.selectOption('default')
    await expect(async () => {
      const mappings = await api.listProviderCategoryMappings()
      const mine = mappings.filter(
        (x) => x.provider_category === providerCat!.id && x.is_default === false,
      )
      expect(mine).toHaveLength(0)
    }).toPass({ timeout: 8000 })
    await expect(select).toHaveValue('default')
  })

  test('mappings section is absent when no provider categories exist', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // The old "No bank categories yet" empty state was REMOVED: `+page.svelte`
    // now wraps the whole `.mappings-section` in `{#if providerCategories.length
    // > 0}`. So the section is ABSENT when no provider category exists DB-wide.
    // Provider categories are GLOBAL and the QA DB is shared, so a
    // sibling spec may seed one — we branch on the actual global state.
    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    const mappingsSection = page.locator('.mappings-section')
    const providerCategories = await api.listProviderCategories()
    if (providerCategories.length === 0) {
      // No provider categories DB-wide → the section does not render at all.
      await expect(mappingsSection).toHaveCount(0)
    } else {
      // Provider categories exist DB-wide (seeded by sibling specs). The section
      // renders a NON-broken table with one mapping select per row.
      await expect(mappingsSection.locator('h2', { hasText: 'Bank category mappings' })).toBeVisible()
      await expect(mappingsSection.locator('.alert-error')).toHaveCount(0)
      await expect(mappingsSection.locator('table')).toBeVisible()
      await expect(mappingsSection.locator('select.mapping-select').first()).toBeVisible()
    }
  })
})
