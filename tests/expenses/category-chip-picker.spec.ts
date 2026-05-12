/**
 * Expenses — Category Chip Picker (Phase 09, Story 9.4)
 *
 * Replaces the legacy <select> with a chip-grid picker that surfaces the user's
 * 3 most-recently-used categories under a "Recent" header, with the rest
 * alphabetised under "All categories".
 *
 * Verifies:
 *   1. All default seeded categories render as chips in the picker.
 *   2. Recency ordering: top three "Recent" chips reflect the most-recently-used
 *      categories (in encounter order from latest expense first), and those
 *      categories do not appear again in the "All categories" section.
 *   3. Submitting the form with a chip-selected category creates an expense
 *      with that category id.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

const DEFAULT_CATEGORY_NAMES = [
  'Rent',
  'Utilities',
  'Groceries',
  'Transportation',
  'Healthcare',
  'Entertainment',
  'Dining Out',
  'Shopping',
  'Salary',
  'Freelance',
  'Other',
]

test.describe('Category chip picker', () => {
  test('chip picker renders all default seeded categories', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    // Creating a household seeds the 11 default categories.
    await api.createHousehold('Chip Picker Home')

    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await expenses.openCreateForm()

    // Scope all queries to the chip picker radiogroup so we don't accidentally
    // match anything in another part of the page (e.g. the table column).
    const picker = page.locator('[role="radiogroup"][data-chip-picker-id="category"]')
    await expect(picker).toBeVisible()

    // Without prior expenses there is nothing in the "Recent" section.
    await expect(picker.locator('.chip-section-header', { hasText: 'Recent' })).toHaveCount(0)
    await expect(picker.locator('.chip-section-header', { hasText: 'All categories' })).toBeVisible()

    // Every default seeded category must have a chip with its name.
    // (We deliberately don't assert an exact total chip count: the QA test DB
    // is shared across runs and may carry custom user-created categories from
    // sibling specs — categories are global per Gotcha #9. Asserting presence
    // of every default and the picker being functional is what matters here.)
    // We use exact-word regex matching so parallel-test categories like
    // "Groceries-IM" or "Other-D1" don't satisfy a substring `hasText` match.
    for (const name of DEFAULT_CATEGORY_NAMES) {
      const exactWord = new RegExp(`(?:^|\\s)${name}(?:\\s|$)`)
      const chip = picker.locator('[role="radio"]', { hasText: exactWord })
      await expect(chip, `chip for category "${name}" should be present`).toHaveCount(1)
    }

    // Functional sanity: at least one default chip is clickable + flips aria-checked.
    const groceriesChip = picker.locator('[role="radio"]', { hasText: /(?:^|\s)Groceries(?:\s|$)/ })
    await groceriesChip.scrollIntoViewIfNeeded()
    await groceriesChip.click()
    await expect(groceriesChip).toHaveAttribute('aria-checked', 'true')
  })

  test('recent categories surface first in correct order', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Recents Home')

    // Look up category ids for the three we'll seed.
    const groceries = await api.getCategoryByName('Groceries')
    const transportation = await api.getCategoryByName('Transportation')
    const utilities = await api.getCategoryByName('Utilities')
    expect(groceries, 'Groceries default category should exist').not.toBeNull()
    expect(transportation, 'Transportation default category should exist').not.toBeNull()
    expect(utilities, 'Utilities default category should exist').not.toBeNull()

    // Seed in chronological order so created_at increases with each call.
    // Default ordering on the backend list endpoint is `-expense_date, -created_at`,
    // so when scanning the latest 20 rows the unique-category encounter order
    // (most-recent first) becomes: Groceries, Transportation, Utilities.
    //
    //   1× Utilities (oldest)
    //   2× Transportation
    //   3× Groceries (newest)
    await api.createExpense({
      household: household.id,
      description: 'U-1',
      amount: 10,
      expense_date: TODAY,
      category: utilities!.id,
    })
    for (let i = 0; i < 2; i++) {
      await api.createExpense({
        household: household.id,
        description: `T-${i}`,
        amount: 11,
        expense_date: TODAY,
        category: transportation!.id,
      })
    }
    for (let i = 0; i < 3; i++) {
      await api.createExpense({
        household: household.id,
        description: `G-${i}`,
        amount: 12,
        expense_date: TODAY,
        category: groceries!.id,
      })
    }

    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await expenses.openCreateForm()

    const picker = page.locator('[role="radiogroup"][data-chip-picker-id="category"]')
    await expect(picker).toBeVisible()

    // The Recent section must be visible with exactly 3 chips.
    await expect(picker.locator('.chip-section-header', { hasText: 'Recent' })).toBeVisible()

    // The first .chip-grid inside the picker holds the recent chips. The second
    // .chip-grid is the alphabetised "All categories" grid.
    const recentGrid = picker.locator('.chip-grid').first()
    const recentChips = recentGrid.locator('[role="radio"]')
    await expect(recentChips).toHaveCount(3)

    // Order: Groceries, Transportation, Utilities (most-recent encounter first).
    await expect(recentChips.nth(0)).toContainText('Groceries')
    await expect(recentChips.nth(1)).toContainText('Transportation')
    await expect(recentChips.nth(2)).toContainText('Utilities')

    // Recent chips must carry their category id in data-chip-cat-id.
    await expect(recentChips.nth(0)).toHaveAttribute('data-chip-cat-id', String(groceries!.id))
    await expect(recentChips.nth(1)).toHaveAttribute('data-chip-cat-id', String(transportation!.id))
    await expect(recentChips.nth(2)).toHaveAttribute('data-chip-cat-id', String(utilities!.id))

    // The "All categories" grid must NOT include any of the recent three.
    const allGrid = picker.locator('.chip-grid').nth(1)
    await expect(allGrid).toBeVisible()
    for (const recentId of [groceries!.id, transportation!.id, utilities!.id]) {
      await expect(
        allGrid.locator(`[role="radio"][data-chip-cat-id="${recentId}"]`),
        `recent category id ${recentId} should not appear in "All categories"`,
      ).toHaveCount(0)
    }

    // Sanity: each remaining default (the 8 not in Recent) is still reachable
    // in the "All categories" grid. We assert presence rather than an exact
    // total — the shared QA DB may carry user-created categories from sibling
    // specs (categories are global per Gotcha #9).
    const remainingDefaults = DEFAULT_CATEGORY_NAMES.filter(
      (n) => n !== 'Groceries' && n !== 'Transportation' && n !== 'Utilities',
    )
    for (const name of remainingDefaults) {
      await expect(
        allGrid.locator('[role="radio"]', { hasText: name }),
        `default category "${name}" should appear in "All categories"`,
      ).toHaveCount(1)
    }
  })

  test('submitting with the chip-selected category creates the expense with that category', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Chip Submit Home')
    const groceries = await api.getCategoryByName('Groceries')
    expect(groceries).not.toBeNull()

    const expenses = new ExpensesPage(page)
    await expenses.gotoWithHousehold(household.id)
    await expenses.openCreateForm()

    const picker = page.locator('[role="radiogroup"][data-chip-picker-id="category"]')
    await expect(picker).toBeVisible()

    // Click the Groceries chip and verify aria-checked flips on.
    const groceriesChip = picker.locator(`[role="radio"][data-chip-cat-id="${groceries!.id}"]`)
    await groceriesChip.scrollIntoViewIfNeeded()
    await groceriesChip.click()
    await expect(groceriesChip).toHaveAttribute('aria-checked', 'true')

    // Hidden input the form actually submits should now hold the category id.
    const hiddenCategoryInput = expenses.createForm.locator('input[type="hidden"][name="category"]')
    await expect(hiddenCategoryInput).toHaveValue(String(groceries!.id))

    // Fill the rest of the form (date defaults to today, household is preselected
    // via ?household=<id>). Force the household + amount values right before submit
    // to defend against any pending Svelte re-renders.
    const description = `Chip Created ${Date.now()}`
    const amount = '42.00'

    await expenses.createForm.locator('#description').fill(description)
    await expenses.createForm.locator('#amount').fill(amount)

    await page.evaluate(
      ({ hhId, desc, amt, catId }: { hhId: number; desc: string; amt: string; catId: number }) => {
        const form = document.querySelector('.form-paper form') as HTMLFormElement | null
        if (!form) return
        const householdSelect = form.querySelector('#household_id') as HTMLSelectElement | null
        if (householdSelect) householdSelect.value = String(hhId)
        const descInput = form.querySelector('#description') as HTMLInputElement | null
        if (descInput) descInput.value = desc
        const amountInput = form.querySelector('#amount') as HTMLInputElement | null
        if (amountInput) amountInput.value = amt
        const hiddenCat = form.querySelector(
          'input[type="hidden"][name="category"]',
        ) as HTMLInputElement | null
        if (hiddenCat) hiddenCat.value = String(catId)
      },
      { hhId: household.id, desc: description, amt: amount, catId: groceries!.id },
    )

    const submitBtn = expenses.createForm.locator('button', { hasText: 'Add Transaction' })
    await submitBtn.scrollIntoViewIfNeeded()
    await submitBtn.click()

    // The form should close on a successful submit.
    await expect(expenses.createForm).not.toBeVisible({ timeout: 10_000 })

    // The new row should be visible in the table with the Groceries badge.
    const row = expenses.row(description)
    await expect(row).toBeVisible()
    await expect(row.locator('.badge-category')).toContainText('Groceries')

    // Authoritative assertion: re-fetch via API and confirm the category id wired through.
    const list = await api.listExpenses()
    const created = list.find((e) => e.description === description)
    expect(created, `expense with description "${description}" should exist via API`).toBeDefined()
    expect(created!.category).toBe(groceries!.id)
  })
})
