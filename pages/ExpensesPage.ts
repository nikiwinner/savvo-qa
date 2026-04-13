import { Page, Locator } from '@playwright/test'

export interface CreateExpenseForm {
  householdLabel: string
  category: string
  description: string
  amount: string
  date: string
}

export class ExpensesPage {
  readonly heading: Locator
  readonly newExpenseButton: Locator
  readonly createForm: Locator
  readonly emptyState: Locator
  readonly noHouseholdMessage: Locator
  readonly summaryValue: Locator

  constructor(private readonly page: Page) {
    this.heading = page.locator('h1', { hasText: 'Expenses' })
    this.newExpenseButton = page.locator('button', { hasText: '+ New Expense' })
    this.createForm = page.locator('.form-card')
    this.emptyState = page.locator('.empty-state')
    this.noHouseholdMessage = page.locator('.info-message')
    this.summaryValue = page.locator('.summary-value')
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard/expenses')
    await this.page.waitForLoadState('networkidle')
  }

  async openCreateForm(): Promise<void> {
    await this.newExpenseButton.click()
    await this.createForm.waitFor()
  }

  async submitCreateForm(data: CreateExpenseForm): Promise<void> {
    await this.createForm.locator('#household_id').selectOption({ label: data.householdLabel })
    await this.createForm.locator('#category').selectOption({ label: data.category })
    await this.createForm.locator('#description').fill(data.description)
    await this.createForm.locator('#amount').fill(data.amount)
    await this.createForm.locator('#expense_date').fill(data.date)
    await this.createForm.locator('button', { hasText: 'Add Expense' }).click()
  }

  async createExpense(data: CreateExpenseForm): Promise<void> {
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
    await this.row(description).locator('.btn-icon[title="Edit"]').click()
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
    this.page.once('dialog', (d) => d.accept())
    await this.row(description).locator('.btn-delete').click()
  }
}
