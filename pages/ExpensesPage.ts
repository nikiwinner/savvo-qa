import { Page, Locator } from '@playwright/test'

export interface CreateExpenseForm {
  spaceLabel: string
  spaceId?: number
  category: string
  description: string
  amount: string
  date?: string
  type?: 'expense' | 'income'
}

export class ExpensesPage {
  readonly heading: Locator
  readonly newExpenseButton: Locator
  readonly createForm: Locator
  readonly emptyState: Locator
  readonly noSpaceMessage: Locator
  readonly summaryValue: Locator

  constructor(private readonly page: Page) {
    this.heading = page.locator('h1', { hasText: 'Transactions' })
    this.newExpenseButton = page.locator('button.btn-create', { hasText: 'New Transaction' })
    this.createForm = page.locator('.form-paper')
    this.emptyState = page.locator('.empty-state')
    this.noSpaceMessage = page.locator('.alert.alert-info')
    this.summaryValue = page.locator('.summary-strip .stat-expense .stat-value')
  }

  async goto(): Promise<void> {
    // The transactions page lives at /dashboard/transactions (Phase 15, Story
    // 15.2). The legacy /dashboard/expenses route still redirects here, but
    // tests navigate to the canonical path directly.
    await this.page.goto('/dashboard/transactions')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoWithSpace(spaceId: number): Promise<void> {
    await this.page.goto(`/dashboard/transactions?space=${spaceId}`)
    await this.page.waitForLoadState('networkidle')
  }

  // Navigate to the legacy /dashboard/expenses route to exercise the Phase-15
  // redirect. The server redirects (307) to /dashboard/transactions, preserving
  // the query string. Used by the redirect assertion test.
  async gotoLegacy(search = ''): Promise<void> {
    await this.page.goto(`/dashboard/expenses${search}`)
    await this.page.waitForLoadState('networkidle')
  }

  async openCreateForm(): Promise<void> {
    await this.newExpenseButton.click()
    await this.createForm.waitFor()
  }

  async selectDate(container: Locator, dateStr: string): Promise<void> {
    // dateStr is YYYY-MM-DD
    const [, , dayStr] = dateStr.split('-')
    const targetDay = parseInt(dayStr, 10)

    // Click the DatePicker trigger to open the calendar
    await container.locator('.dp-trigger').click()

    // Wait for dropdown to appear
    await container.locator('.dp-dropdown').waitFor()

    // Click the day button matching the target day number (exact match to avoid "1" matching "10")
    await container
      .locator('.dp-day')
      .getByText(String(targetDay), { exact: true })
      .click()
  }

  async submitCreateForm(data: CreateExpenseForm): Promise<void> {
    // Interact with type radio — this has no Svelte binding so no re-render risk
    if (data.type) {
      const labelText = data.type === 'income' ? 'Income' : 'Expense'
      await this.createForm.locator('label', { hasText: labelText }).click()
    }

    // Select category via the chip-grid picker. The picker is rendered async
    // (server load derives recents), so wait for it to be visible — failing
    // here is faster and clearer than timing out on a missing chip.
    //
    // The legacy <select> exposed a "No category" placeholder option; the chip
    // picker has no such chip — leaving every chip unclicked is what "no
    // category" looks like now. So when callers pass `category: 'No category'`
    // we just don't click anything (the hidden <input name="category"> stays
    // empty and the backend stores null).
    const picker = this.createForm.locator('[role="radiogroup"][data-chip-picker-id="category"]')
    await picker.waitFor({ state: 'visible' })

    let categoryId: string | null = null
    if (data.category && data.category !== 'No category') {
      const categoryChip = picker.locator('[role="radio"]', { hasText: data.category }).first()
      await categoryChip.scrollIntoViewIfNeeded()
      await categoryChip.click()

      // Resolve the category id from the chip's data attribute. We use this id
      // below to force the hidden <input name="category"> value right before
      // submit, the same defensive pattern used in
      // tests/expenses/category-chip-picker.spec.ts and
      // tests/expenses/categories.spec.ts.
      categoryId = await categoryChip.getAttribute('data-chip-cat-id')
    }

    // Fill description and amount via Playwright
    await this.createForm.locator('#description').fill(data.description)
    await this.createForm.locator('#amount').fill(data.amount)

    // Only interact with the DatePicker when the date differs from today.
    // The DatePicker defaults to today, so no interaction is needed for TODAY.
    const todayStr = new Date().toISOString().split('T')[0]
    if (data.date && data.date !== todayStr) {
      await this.selectDate(this.createForm, data.date)
    }

    // Set ALL form field values in one synchronous evaluate call, immediately before submit,
    // to prevent any pending Svelte re-renders from resetting them.
    await this.page.evaluate(
      ({
        spaceLabel,
        description,
        amount,
        categoryId,
      }: {
        spaceLabel: string
        description: string
        amount: string
        categoryId: string | null
      }) => {
        const form = document.querySelector('.form-paper form') as HTMLFormElement | null
        if (!form) return

        const spaceSelect = form.querySelector('#space_id') as HTMLSelectElement | null
        if (spaceSelect) {
          const opt = Array.from(spaceSelect.options).find((o) => o.text === spaceLabel)
          if (opt) spaceSelect.value = opt.value
        }

        const descInput = form.querySelector('#description') as HTMLInputElement | null
        if (descInput) descInput.value = description

        const amountInput = form.querySelector('#amount') as HTMLInputElement | null
        if (amountInput) amountInput.value = amount

        const hiddenCat = form.querySelector(
          'input[type="hidden"][name="category"]',
        ) as HTMLInputElement | null
        if (hiddenCat) hiddenCat.value = categoryId ?? ''
      },
      {
        spaceLabel: data.spaceLabel,
        description: data.description,
        amount: data.amount,
        categoryId,
      },
    )

    // Scroll the submit button into view first — under some viewport/layout races the
    // fixed footer covers the button and Playwright's click retries time out.
    const submitBtn = this.createForm.locator('button', { hasText: 'Add Transaction' })
    await submitBtn.scrollIntoViewIfNeeded()
    await submitBtn.click()
  }

  async createExpense(data: CreateExpenseForm): Promise<void> {
    // If spaceId is provided, navigate with it to pre-select the space via URL.
    // This ensures Svelte's reactive `selected` attribute on the select option is set
    // based on activeSpaceIds, which is more reliable than Playwright's selectOption.
    if (data.spaceId) {
      await this.gotoWithSpace(data.spaceId)
    }
    await this.openCreateForm()
    await this.submitCreateForm(data)
  }

  rows(): Locator {
    return this.page.locator('tbody tr:not(.edit-row)')
  }

  row(description: string): Locator {
    return this.page.locator('tbody tr', { hasText: description })
  }

  // The edit UI is a modal (.edit-modal-overlay / .edit-modal-card), not an
  // inline row. Field ids: #edit-description, #edit-amount, #edit-currency.
  // Type is a radio group (input[name="type"]). Save/Cancel are buttons in
  // .edit-modal-actions.
  editModal(): Locator {
    return this.page.locator('.edit-modal-card')
  }

  async openEditModal(description: string): Promise<void> {
    // The Edit button is wrapped in <Tooltip label="Edit"> (no native title=).
    // It is the only non-danger .action-btn in a manual-expense row (Delete is
    // .action-btn.action-btn-danger; bank-row category/space buttons use
    // .cat-map-btn / .hh-map-btn), so :not(.action-btn-danger) uniquely matches.
    await this.row(description).locator('.action-btn:not(.action-btn-danger)').click()
    await this.editModal().waitFor({ state: 'visible' })
  }

  async editExpense(
    description: string,
    updates: Partial<{ description: string; amount: string }>,
  ): Promise<void> {
    await this.openEditModal(description)
    const modal = this.editModal()
    if (updates.description) {
      await modal.locator('#edit-description').fill(updates.description)
    }
    if (updates.amount) {
      await modal.locator('#edit-amount').fill(updates.amount)
    }
    await modal.locator('.edit-modal-actions button', { hasText: 'Save' }).click()
    await this.editModal().waitFor({ state: 'hidden' })
  }

  async cancelEdit(): Promise<void> {
    const modal = this.editModal()
    await modal.locator('.edit-modal-actions button', { hasText: 'Cancel' }).click()
    await this.editModal().waitFor({ state: 'hidden' })
  }

  // ---- Filters drawer ----------------------------------------------------
  // Filters now live inside a right-side <Drawer> that only renders its
  // content while open. Open it by clicking the "Filters" button in the
  // page header, then interact with .filter-chip / .btn-filter-action inside.
  filtersDrawer(): Locator {
    return this.page.locator('.drawer-panel')
  }

  async openFilters(): Promise<void> {
    if (await this.filtersDrawer().isVisible()) return
    await this.page.locator('button.btn-outline', { hasText: 'Filters' }).click()
    await this.filtersDrawer().waitFor({ state: 'visible' })
  }

  // ---- Bank transaction categorization ----------------------------------
  // Bank rows no longer carry an inline <select>; clicking the row's
  // .cat-map-btn opens a centered modal (.cat-modal-card) with a
  // CategoryChipPicker. Pick a chip by name, then confirm with Save.
  categoryModal(): Locator {
    return this.page.locator('.cat-modal-card')
  }

  async categorizeRow(rowLocator: Locator, categoryName: string): Promise<void> {
    await rowLocator.locator('.cat-map-btn').click()
    const modal = this.categoryModal()
    await modal.waitFor({ state: 'visible' })
    await modal
      .locator('[role="radio"]', { hasText: categoryName })
      .first()
      .click()
    await modal.locator('.cat-modal-actions button', { hasText: 'Save' }).click()
    await this.categoryModal().waitFor({ state: 'hidden' })
  }

  async deleteExpense(description: string): Promise<void> {
    await this.row(description).locator('.action-btn.action-btn-danger').click()
    // The app uses a custom ConfirmDialog (not the native confirm()).
    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible' })
    await dialog.locator('button.btn-confirm-danger').click()
    await dialog.waitFor({ state: 'hidden' })
  }
}
