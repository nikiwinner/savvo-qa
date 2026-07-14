import { Page, Locator } from '@playwright/test'

/**
 * Page object for the Spaces UI surface (Phase 12 Story 12.5 + polish round).
 *
 * Two routes:
 *   - `/dashboard/spaces`           — active spaces only (archived hidden after
 *                                      backend list filter)
 *   - `/dashboard/spaces/archived`  — archived spaces only, with Restore +
 *                                      Delete permanently affordances
 *
 * Active page actions: create, edit, archive, **delete** (post-polish — Delete
 * is now also available from the active page next to Archive, with the same
 * rich re-home dialog). The shared `SpaceDeleteDialog` component is mounted
 * from BOTH pages.
 *
 * Archived page actions: restore, delete permanently (with re-home dropdown
 * or "leave unassigned" sentinel).
 */
export class SpacesPage {
  readonly newSpaceButton: Locator
  readonly createForm: Locator
  readonly emptyState: Locator
  readonly archivedLink: Locator

  constructor(private readonly page: Page) {
    this.newSpaceButton = page.locator('button.btn-create', { hasText: 'New Space' })
    this.createForm = page.locator('.form-paper')
    this.emptyState = page.locator('.empty-state')
    this.archivedLink = page.locator('a.btn-archived-link', { hasText: 'View archived' })
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard/spaces')
    await this.page.waitForLoadState('networkidle')
  }

  async gotoArchived(): Promise<void> {
    await this.page.goto('/dashboard/spaces/archived')
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

  async editSpace(currentName: string, newName: string): Promise<void> {
    const c = this.card(currentName)
    await c.locator('.action-btn[aria-label="Edit"]').click()
    // The card switches to edit form — re-query by hidden id
    const editName = c.locator('input[name="name"]')
    await editName.fill(newName)
    await c.locator('button', { hasText: 'Save' }).click()
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Phase 12 — Archive flow (replaces the old single-confirm delete on the
  // active page).
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Open the archive confirm dialog for the named card. The dialog is the
   * shared ConfirmDialog (`[role="dialog"]`) — non-danger styled (Archive
   * button, not danger-red — `danger={false}` in the spaces page).
   */
  async openArchiveDialog(name: string): Promise<Locator> {
    const c = this.card(name)
    await c.locator('.action-btn.action-btn-archive').click()
    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible' })
    return dialog
  }

  /**
   * Click the Archive button on the named active card, then confirm in the
   * confirm dialog. Waits for the dialog to dismiss + the backing
   * `invalidateAll()` round-trip to settle before returning, so the next
   * test step can navigate without racing the still-pending refetch.
   */
  async archiveSpace(name: string): Promise<void> {
    const dialog = await this.openArchiveDialog(name)
    // ConfirmDialog renders the confirm button with .btn-confirm. We pin it
    // by visible label ('Archive') to be robust against future styling
    // tweaks. The active-page archive dialog uses `danger={false}`, so the
    // button gets `.btn-confirm-primary` (not `.btn-confirm-danger`).
    await dialog.locator('button.btn-confirm', { hasText: 'Archive' }).click()
    // confirmArchive in +page.svelte fires the dialog close BEFORE the API
    // + invalidateAll await chain. So we MUST wait for the card to detach
    // (that's the post-invalidateAll signal) FIRST, then ask for networkidle.
    // Without that ordering, networkidle resolves immediately (before the
    // API call has even gone out) and the next `page.goto(...)` cancels the
    // in-flight refetch with net::ERR_ABORTED.
    await dialog.waitFor({ state: 'hidden' })
    await this.card(name).waitFor({ state: 'detached', timeout: 10_000 })
    await this.page.waitForLoadState('networkidle')
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Phase 12 — Delete-permanently flow (only available from the archived
  // view, behind the rich re-home dialog).
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Open the Delete-permanently dialog for an archived card. Caller may already
   * be on `/dashboard/spaces/archived`; this method navigates only if not.
   */
  async openDeleteDialog(name: string): Promise<Locator> {
    if (!this.page.url().includes('/dashboard/spaces/archived')) {
      await this.gotoArchived()
    }
    const c = this.card(name)
    await c.locator('button.btn-danger', { hasText: 'Delete permanently' }).click()
    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible' })
    return dialog
  }

  /**
   * Permanently delete an archived space.
   *
   * - `options.rehomeTo` → select that named space in the re-home dropdown.
   * - `options.rehomeTo` omitted → select the "leave unassigned" option.
   *
   * The dialog ships a re-home `<select id="rehome-select">` with active
   * spaces + a `value="unassigned"` sentinel. The bespoke dialog lives in
   * `/dashboard/spaces/archived/+page.svelte` (NOT the shared ConfirmDialog —
   * it carries the re-home picker + warn-block that ConfirmDialog can't host).
   */
  async deletePermanently(name: string, options: { rehomeTo?: string } = {}): Promise<void> {
    const dialog = await this.openDeleteDialog(name)
    const rehomeSelect = dialog.locator('select#rehome-select')

    if (options.rehomeTo) {
      await rehomeSelect.selectOption({ label: options.rehomeTo })
    } else {
      await rehomeSelect.selectOption({ value: 'unassigned' })
    }

    // The bespoke delete dialog also uses .btn-confirm-danger for the primary
    // action, matching the ConfirmDialog convention.
    // Toggling between an active-space target and the "unassigned" sentinel
    // mounts / unmounts the warn-block above the dialog actions — the confirm
    // button shifts a few pixels and Playwright flags it as "not stable".
    // Scroll into view + a short stabilisation tick keeps the click reliable.
    const confirmBtn = dialog.locator('button.btn-confirm-danger', {
      hasText: 'Delete permanently',
    })
    await confirmBtn.scrollIntoViewIfNeeded()
    await confirmBtn.click()
    // confirmDelete in archived/+page.svelte navigates to /dashboard/spaces
    // on success. Wait for that navigation to land instead of just the
    // dialog being hidden — the page-object boundary returns when the
    // user is back on the active spaces page.
    await this.page.waitForURL(/\/dashboard\/spaces(\?|$)/, { timeout: 10_000 })
    await this.page.waitForLoadState('networkidle')
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Phase 12 — Restore (archived view → card returns to active).
  // ────────────────────────────────────────────────────────────────────────────

  async restoreSpace(name: string): Promise<void> {
    if (!this.page.url().includes('/dashboard/spaces/archived')) {
      await this.gotoArchived()
    }
    const c = this.card(name)
    await c.locator('button.btn-outline', { hasText: 'Restore' }).click()
    // No confirm dialog on restore — it's a direct POST. Wait for the card
    // to leave the DOM as the post-restore signal, then wait for the
    // backing invalidateAll() to settle so the next navigation doesn't
    // race the still-pending refetch with net::ERR_ABORTED.
    await c.waitFor({ state: 'detached' })
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * Convenience for tests that want to archive AND then delete in one call.
   * The legacy `deleteSpace` helper used to do the single-confirm delete from
   * the active page; that path no longer exists. This helper preserves the
   * "I want to fully remove a space" intent for the crud.spec.ts delete tests.
   */
  async archiveAndDelete(name: string, options: { rehomeTo?: string } = {}): Promise<void> {
    await this.archiveSpace(name)
    await this.gotoArchived()
    await this.deletePermanently(name, options)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Polish round — Delete directly from the active page (no archive step).
  // The trash-icon button sits next to Archive in the action row, opens the
  // same shared SpaceDeleteDialog, and on success refreshes in place (no
  // navigation away).
  // ────────────────────────────────────────────────────────────────────────────

  async openActiveDeleteDialog(name: string): Promise<Locator> {
    const c = this.card(name)
    await c.locator('.action-btn.action-btn-delete').click()
    const dialog = this.page.locator('[role="dialog"]')
    await dialog.waitFor({ state: 'visible' })
    return dialog
  }

  /**
   * Delete a space directly from the active page without first archiving.
   * Uses the same rich re-home dialog as the archived view.
   */
  async deleteFromActivePage(name: string, options: { rehomeTo?: string } = {}): Promise<void> {
    const dialog = await this.openActiveDeleteDialog(name)
    const rehomeSelect = dialog.locator('select#rehome-select')

    if (options.rehomeTo) {
      await rehomeSelect.selectOption({ label: options.rehomeTo })
    } else {
      await rehomeSelect.selectOption({ value: 'unassigned' })
    }

    const confirmBtn = dialog.locator('button.btn-confirm-danger', {
      hasText: 'Delete permanently',
    })
    await confirmBtn.scrollIntoViewIfNeeded()
    await confirmBtn.click()
    // Active-page delete stays on /dashboard/spaces — no navigation. Wait for
    // the dialog to close + the card to leave the DOM as the post-invalidateAll
    // signal.
    await dialog.waitFor({ state: 'hidden' })
    await this.card(name).waitFor({ state: 'detached', timeout: 10_000 })
    await this.page.waitForLoadState('networkidle')
  }
}
