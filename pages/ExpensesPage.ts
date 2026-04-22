import { Page, Locator } from '@playwright/test'

export interface CreateExpenseForm {
  householdLabel: string
  householdId?: number
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
  readonly noHouseholdMessage: Locator
  readonly summaryValue: Locator

  constructor(private readonly page: Page) {
    this.heading = page.locator('h1', { hasText: 'Transactions' })
    this.newExpenseButton = page.locator('button.btn-create', { hasText: 'New Transaction' })
    this.createForm = page.locator('.form-paper')
    this.emptyState = page.locator('.empty-state')
    this.noHouseholdMessage = page.locator('.alert.alert-info')
    this.summaryValue = page.locator('.summary-strip .stat-expense .stat-value')
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard/expenses')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoWithHousehold(householdId: number): Promise<void> {
    await this.page.goto(`/dashboard/expenses?household=${householdId}`)
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

    // Select category via Playwright (no on:change handler, safe)
    await this.createForm.locator('#category').selectOption({ label: data.category })

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
      ({ householdLabel, description, amount, category }: { householdLabel: string; description: string; amount: string; category: string }) => {
        const form = document.querySelector('.form-paper form') as HTMLFormElement | null
        if (!form) return

        const householdSelect = form.querySelector('#household_id') as HTMLSelectElement | null
        if (householdSelect) {
          const opt = Array.from(householdSelect.options).find((o) => o.text === householdLabel)
          if (opt) householdSelect.value = opt.value
        }

        const descInput = form.querySelector('#description') as HTMLInputElement | null
        if (descInput) descInput.value = description

        const amountInput = form.querySelector('#amount') as HTMLInputElement | null
        if (amountInput) amountInput.value = amount

        const catSelect = form.querySelector('#category') as HTMLSelectElement | null
        if (catSelect) {
          const catOpt = Array.from(catSelect.options).find((o) => o.text === category)
          if (catOpt) catSelect.value = catOpt.value
        }
      },
      {
        householdLabel: data.householdLabel,
        description: data.description,
        amount: data.amount,
        category: data.category,
      },
    )

    // Scroll the submit button into view first — under some viewport/layout races the
    // fixed footer covers the button and Playwright's click retries time out.
    const submitBtn = this.createForm.locator('button', { hasText: 'Add Transaction' })
    await submitBtn.scrollIntoViewIfNeeded()
    await submitBtn.click()
  }

  async createExpense(data: CreateExpenseForm): Promise<void> {
    // If householdId is provided, navigate with it to pre-select the household via URL.
    // This ensures Svelte's reactive `selected` attribute on the select option is set
    // based on activeHouseholdIds, which is more reliable than Playwright's selectOption.
    if (data.householdId) {
      await this.gotoWithHousehold(data.householdId)
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

  async editExpense(
    description: string,
    updates: Partial<{ description: string; amount: string }>,
  ): Promise<void> {
    await this.row(description).locator('.action-btn[title="Edit"]').click()
    const editRow = this.page.locator('tr.edit-row')
    if (updates.description) {
      await editRow.locator('input[name="description"]').fill(updates.description)
    }
    if (updates.amount) {
      await editRow.locator('input[name="amount"]').fill(updates.amount)
    }
    await editRow.locator('button', { hasText: 'Save' }).click()
  }

  async cancelEdit(): Promise<void> {
    const editRow = this.page.locator('tr.edit-row')
    await editRow.locator('button', { hasText: 'Cancel' }).click()
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
