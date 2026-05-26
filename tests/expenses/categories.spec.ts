/**
 * Expenses — Categories (Phase 01, Story 1.9)
 *
 * Verifies category dropdown population from API, inline category creation,
 * category display in the table, global category visibility, and duplicate rejection.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

test.describe('Expense categories', () => {
  test('category dropdown is populated from the API (not hardcoded)', async ({
    page,
    loggedInPage,
  }) => {
    // Create a space — this seeds default categories
    const { api } = loggedInPage
    await api.createSpace('Category Dropdown Home')

    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await expenses.openCreateForm()

    // The category chip picker should contain a chip for at least "Groceries"
    // (a seeded default). The picker lives inside the create form paper.
    const picker = expenses.createForm.locator(
      '[role="radiogroup"][data-chip-picker-id="category"]',
    )
    await expect(picker).toBeVisible()
    // Wait for categories to load (they load via onMount).
    // Use exact-word regex to avoid matching parallel-test categories like
    // "Groceries-IM" or "Groceries-D1" which can pollute the global list
    // (categories are global per Gotcha #9).
    await expect(
      picker.locator('[role="radio"]', { hasText: /(?:^|\s)Groceries(?:\s|$)/ }),
    ).toHaveCount(1, { timeout: 5000 })
  })

  test('created expense shows the selected category name', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Category Display Home')
    const groceries = await api.getCategoryByName('Groceries')
    expect(groceries, 'Groceries default category should exist').not.toBeNull()

    const expenses = new ExpensesPage(page)
    await expenses.gotoWithSpace(hh.id)
    await expenses.openCreateForm()

    // Pick the Groceries chip in the new chip-grid picker.
    const picker = expenses.createForm.locator(
      '[role="radiogroup"][data-chip-picker-id="category"]',
    )
    await expect(picker).toBeVisible()
    const groceriesChip = picker.locator(
      `[role="radio"][data-chip-cat-id="${groceries!.id}"]`,
    )
    await groceriesChip.scrollIntoViewIfNeeded()
    await groceriesChip.click()
    await expect(groceriesChip).toHaveAttribute('aria-checked', 'true')

    // The hidden form input the form actually submits should hold the category id.
    const hiddenCategoryInput = expenses.createForm.locator(
      'input[type="hidden"][name="category"]',
    )
    await expect(hiddenCategoryInput).toHaveValue(String(groceries!.id))

    // Fill the rest of the form. Force values right before submit to defend
    // against any pending Svelte re-renders (mirrors the chip-picker spec).
    const description = 'Weekly Shop'
    const amount = '80'

    await expenses.createForm.locator('#description').fill(description)
    await expenses.createForm.locator('#amount').fill(amount)

    await page.evaluate(
      ({
        hhId,
        desc,
        amt,
        catId,
      }: {
        hhId: number
        desc: string
        amt: string
        catId: number
      }) => {
        const form = document.querySelector('.form-paper form') as HTMLFormElement | null
        if (!form) return
        const spaceSelect = form.querySelector('#space_id') as HTMLSelectElement | null
        if (spaceSelect) spaceSelect.value = String(hhId)
        const descInput = form.querySelector('#description') as HTMLInputElement | null
        if (descInput) descInput.value = desc
        const amountInput = form.querySelector('#amount') as HTMLInputElement | null
        if (amountInput) amountInput.value = amt
        const hiddenCat = form.querySelector(
          'input[type="hidden"][name="category"]',
        ) as HTMLInputElement | null
        if (hiddenCat) hiddenCat.value = String(catId)
      },
      { hhId: hh.id, desc: description, amt: amount, catId: groceries!.id },
    )

    const submitBtn = expenses.createForm.locator('button', { hasText: 'Add Transaction' })
    await submitBtn.scrollIntoViewIfNeeded()
    await submitBtn.click()

    // The table row should show the category name (not an ID).
    const row = page.locator('tbody tr', { hasText: description })
    await expect(row).toBeVisible()
    await expect(row.locator('.badge-category')).toContainText('Groceries')
  })

  test('categories are global — user B sees user A\'s created category', async ({
    twoActors,
    page,
    context,
  }) => {
    const { apiA, apiB } = twoActors

    // User A creates a custom category — use unique name to avoid cross-project conflicts
    const uniqueCatName = `PetCare-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await apiA.createCategory(uniqueCatName)

    // Switch browser to user B
    await apiB.createSpace('Bob Category Home')
    const cookiesB = await apiB.cookies()
    await context.clearCookies()
    await context.addCookies(cookiesB)

    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await expenses.openCreateForm()

    // Wait for categories to load — the user A-created category must appear as
    // a chip in user B's picker (categories are global per Gotcha #9).
    const picker = expenses.createForm.locator(
      '[role="radiogroup"][data-chip-picker-id="category"]',
    )
    await expect(picker).toBeVisible()
    await expect(
      picker.locator('[role="radio"]', { hasText: uniqueCatName }),
    ).toHaveCount(1, { timeout: 5000 })
  })

  test('duplicate category name returns 400', async ({ loggedInPage }) => {
    const { api } = loggedInPage

    // Create a category, then try to create the same name again
    await api.createCategory('Unique Cat ' + Date.now())
    const catName = 'DupCheck-' + Date.now()
    await api.createCategory(catName)

    // Second creation of same name should throw with 400
    try {
      await api.createCategory(catName)
      throw new Error('Expected createCategory to throw')
    } catch (err: unknown) {
      expect(String(err)).toContain('400')
    }
  })
})
