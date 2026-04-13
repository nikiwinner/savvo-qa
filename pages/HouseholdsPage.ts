import { Page, Locator } from '@playwright/test'

export class HouseholdsPage {
  readonly heading: Locator
  readonly newHouseholdButton: Locator
  readonly createForm: Locator
  readonly emptyState: Locator
  readonly householdsGrid: Locator

  constructor(private readonly page: Page) {
    this.heading = page.locator('h1', { hasText: 'Households' })
    this.newHouseholdButton = page.locator('button', { hasText: '+ New Household' })
    this.createForm = page.locator('.form-card')
    this.emptyState = page.locator('.empty-state')
    this.householdsGrid = page.locator('.households-grid')
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard/households')
    await this.page.waitForLoadState('networkidle')
  }

  async openCreateForm(): Promise<void> {
    await this.newHouseholdButton.click()
    await this.createForm.waitFor()
  }

  async submitCreateForm(name: string, description = ''): Promise<void> {
    await this.createForm.locator('#name').fill(name)
    if (description) {
      await this.createForm.locator('#description').fill(description)
    }
    await this.createForm.locator('button', { hasText: 'Create Household' }).click()
  }

  async createHousehold(name: string, description = ''): Promise<void> {
    await this.openCreateForm()
    await this.submitCreateForm(name, description)
  }

  card(name: string): Locator {
    return this.page.locator(`.household-card[data-name="${name}"]`)
  }

  cards(): Locator {
    return this.page.locator('.household-card')
  }

  cardNames(): Locator {
    return this.page.locator('.household-card h3')
  }

  async editHousehold(currentName: string, newName: string): Promise<void> {
    const c = this.card(currentName)
    await c.locator('.btn-icon[title="Edit"]').click()
    // The card switches to edit form — re-query by hidden id
    const editName = c.locator('input[name="name"]')
    await editName.fill(newName)
    await c.locator('button', { hasText: 'Save' }).click()
  }

  async cancelEdit(name: string): Promise<void> {
    const c = this.card(name)
    await c.locator('.btn-icon[title="Edit"]').click()
    await c.locator('button', { hasText: 'Cancel' }).click()
  }

  async deleteHousehold(name: string): Promise<void> {
    const c = this.card(name)
    this.page.once('dialog', (d) => d.accept())
    await c.locator('.btn-delete').click()
  }
}
