import { Page, Locator } from '@playwright/test'

export class SpacesPage {
  readonly heading: Locator
  readonly newSpaceButton: Locator
  readonly createForm: Locator
  readonly emptyState: Locator
  readonly spacesGrid: Locator

  constructor(private readonly page: Page) {
    this.heading = page.locator('h1', { hasText: 'Spaces' })
    this.newSpaceButton = page.locator('button.btn-create', { hasText: 'New Space' })
    this.createForm = page.locator('.form-paper')
    this.emptyState = page.locator('.empty-state')
    this.spacesGrid = page.locator('.spaces-grid')
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard/spaces')
    await this.page.waitForLoadState('networkidle')
  }

  async openCreateForm(): Promise<void> {
    await this.newSpaceButton.click()
    await this.createForm.waitFor()
  }

  async submitCreateForm(name: string, description = ''): Promise<void> {
    await this.createForm.locator('#name').fill(name)
    if (description) {
      await this.createForm.locator('#description').fill(description)
    }
    await this.createForm.locator('button', { hasText: 'Create Space' }).click()
  }

  async createSpace(name: string, description = ''): Promise<void> {
    await this.openCreateForm()
    await this.submitCreateForm(name, description)
  }

  card(name: string): Locator {
    return this.page.locator(`.space-card[data-name="${name}"]`)
  }

  cards(): Locator {
    return this.page.locator('.space-card')
  }

  cardNames(): Locator {
    return this.page.locator('.space-card h3')
  }

  async editSpace(currentName: string, newName: string): Promise<void> {
    const c = this.card(currentName)
    await c.locator('.action-btn[title="Edit"]').click()
    // The card switches to edit form — re-query by hidden id
    const editName = c.locator('input[name="name"]')
    await editName.fill(newName)
    await c.locator('button', { hasText: 'Save' }).click()
  }

  async cancelEdit(name: string): Promise<void> {
    const c = this.card(name)
    await c.locator('.action-btn[title="Edit"]').click()
    await c.locator('button', { hasText: 'Cancel' }).click()
  }

  async deleteSpace(name: string): Promise<void> {
    const c = this.card(name)
    await c.locator('.action-btn.action-btn-danger').click()
    // The app uses a custom ConfirmDialog (not the native confirm()).
    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible' })
    await dialog.locator('button.btn-confirm-danger').click()
    await dialog.waitFor({ state: 'hidden' })
  }
}
