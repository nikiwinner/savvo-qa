/**
 * Spaces — Lifecycle (Phase 12 Stories 12.3 + 12.5)
 *
 * Archive / restore / delete-with-rehome via the Spaces UI surface:
 *   - `/dashboard/spaces`           — active spaces; Archive button per card +
 *                                      "View archived" link in the header
 *   - `/dashboard/spaces/archived`  — archived spaces; Restore + Delete
 *                                      permanently per card (rich re-home
 *                                      dialog with "leave unassigned" warning)
 *
 * Backend endpoints exercised:
 *   - POST   /api/spaces/<id>/archive/
 *   - POST   /api/spaces/<id>/restore/
 *   - DELETE /api/spaces/<id>/  body: {"rehome_to": <id>} | omitted
 *
 * The dual-port QA stack (Gotcha #26) makes this fully isolated from dev. URLs
 * come from the Playwright baseURL (qa/.env FRONTEND_URL) and the api helper's
 * BACKEND_URL — no hardcoded :8000/:5173 here.
 */
import { test, expect } from '../../fixtures/index'
import { SpacesPage } from '../../pages/SpacesPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Spaces lifecycle — archive / restore / delete (Phase 12)', () => {
  test('archiving a space hides it from the active list', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.createSpace('Archive Me')

    await expect(spaces.card('Archive Me')).toBeVisible()

    await spaces.archiveSpace('Archive Me')

    // After archive the active grid no longer contains the card.
    await expect(spaces.card('Archive Me')).not.toBeVisible()
  })

  test('archived space appears in the dedicated Archived view', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.createSpace('Visible Archived')
    await spaces.archiveSpace('Visible Archived')

    await spaces.gotoArchived()

    const archivedCard = spaces.card('Visible Archived')
    await expect(archivedCard).toBeVisible()

    // The archived card must offer Restore + Delete permanently, but NOT
    // Archive (the active-page action that doesn't make sense for an
    // already-archived row).
    await expect(archivedCard.locator('button', { hasText: 'Restore' })).toBeVisible()
    await expect(archivedCard.locator('button', { hasText: 'Delete permanently' })).toBeVisible()
    await expect(archivedCard.locator('.action-btn-archive')).toHaveCount(0)
  })

  test('active page links to the Archived view', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()

    await expect(spaces.archivedLink).toBeVisible()
    await expect(spaces.archivedLink).toHaveAttribute('href', '/dashboard/spaces/archived')
  })

  test('restoring from the Archived view returns it to Active', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.createSpace('Round Trip Space')

    await spaces.archiveSpace('Round Trip Space')
    await spaces.gotoArchived()

    await expect(spaces.card('Round Trip Space')).toBeVisible()
    await spaces.restoreSpace('Round Trip Space')

    // No longer present on the archived view.
    await expect(spaces.card('Round Trip Space')).not.toBeVisible()
    await expect(spaces.emptyState).toBeVisible()

    // Now visible again on the active page.
    await spaces.goto()
    await expect(spaces.card('Round Trip Space')).toBeVisible()
  })

  test('archive confirm dialog explains it is restorable', async ({ page, loggedInPage: _ }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.createSpace('Explain Archive')

    const dialog = await spaces.openArchiveDialog('Explain Archive')

    const message = (await dialog.locator('.dialog-message').textContent()) ?? ''
    const lower = message.toLowerCase()
    expect(lower).toContain('hidden')
    expect(lower).toContain('analytics')
    expect(lower).toContain('restore')
  })

  test('delete dialog explains permanence and offers a re-home target', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    // Seed two spaces — one we'll archive then delete (H1), one that lives on
    // to serve as the re-home target in the dropdown (H2).
    await api.createSpace('Delete H1')
    await api.createSpace('Other Active H2')

    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.archiveSpace('Delete H1')

    const dialog = await spaces.openDeleteDialog('Delete H1')

    // The dialog message body must communicate permanence.
    const message = (await dialog.locator('.dialog-message').textContent()) ?? ''
    const lower = message.toLowerCase()
    expect(lower).toContain('cannot be undone')

    // The re-home dropdown must list at least the other active space as a
    // target, plus the explicit "leave unassigned" option.
    const select = dialog.locator('select#rehome-select')
    await expect(select).toBeVisible()
    const optionLabels: string[] = await select.evaluate((el: HTMLSelectElement) =>
      Array.from(el.options).map((o) => o.textContent?.trim() ?? ''),
    )
    expect(optionLabels).toContain('Other Active H2')
    // "Don't move — leave them unassigned" is the explicit unassigned label
    // per the Story 12.5 spec.
    expect(optionLabels.some((label) => label.toLowerCase().includes('leave them unassigned'))).toBe(true)
  })

  test('delete dialog warns when leaving transactions unassigned', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    // Need two spaces so the dropdown has SOMETHING to switch away from.
    // (With one space the dialog defaults to "unassigned" anyway because
    // there's no other active target — exercising both branches is cleaner.)
    await api.createSpace('Warn Target')
    await api.createSpace('Warn Me')

    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.archiveSpace('Warn Me')

    const dialog = await spaces.openDeleteDialog('Warn Me')

    // Default-select an active re-home → no warn-block visible.
    await dialog.locator('select#rehome-select').selectOption({ label: 'Warn Target' })
    await expect(dialog.locator('.warn-block')).toHaveCount(0)

    // Switch to "leave unassigned" → warn-block must render with both the
    // no-fake-numbers warning and the split-share hint.
    await dialog.locator('select#rehome-select').selectOption({ value: 'unassigned' })
    const warn = dialog.locator('.warn-block')
    await expect(warn).toBeVisible()
    const warnText = (await warn.textContent()) ?? ''
    const lowerWarn = warnText.toLowerCase()
    // "Manual (cash) expenses left unassigned won't appear on any space screen…"
    expect(lowerWarn).toContain('unassigned')
    // Either the "re-homing is recommended" steer or the split-share hint.
    expect(
      lowerWarn.includes('recommended') ||
        lowerWarn.includes('split') ||
        lowerWarn.includes('share'),
    ).toBe(true)
  })

  test('deleting with re-home moves transactions to the target space', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Source H1 Rehome')
    const h2 = await api.createSpace('Target H2 Rehome')

    // Seed one manual expense in H1.
    await api.createExpense({
      space: h1.id,
      description: 'Rehome Me Expense',
      amount: 42.5,
      expense_date: TODAY,
    })

    const spaces = new SpacesPage(page)
    await spaces.goto()

    await spaces.archiveSpace('Source H1 Rehome')
    await spaces.deletePermanently('Source H1 Rehome', { rehomeTo: 'Target H2 Rehome' })

    // After delete, H1 is gone (the page-object already waited for the
    // post-delete navigation back to /dashboard/spaces).
    await expect(spaces.card('Source H1 Rehome')).not.toBeVisible()

    // The expense is now reachable under H2 on the expenses page.
    await page.goto(`/dashboard/transactions?space=${h2.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr', { hasText: 'Rehome Me Expense' })).toBeVisible()
  })

  test('deleting without re-home leaves transactions unassigned (not destroyed)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Source Orphan H1')
    // Need a second space so the dialog dropdown isn't empty and we can
    // deliberately choose "leave unassigned" instead of an active target.
    await api.createSpace('Bystander H2')

    // Seed one manual expense AND one bank transaction in H1. Both should
    // survive the delete-without-rehome path with `space=NULL`. The bank
    // transaction gives us a directly observable proof point (`?unmapped=true`
    // on /api/bank-transactions/), while the manual expense has no current
    // user-visible orphan surface (Phase 16) — its persistence is proved
    // transitively by the service layer's bulk re-home/orphan logic, which
    // is symmetric across Expense and BankTransaction. Both rows
    // disappear from their default surfaces, but the bank one is also
    // reachable via the unmapped filter.
    await api.createExpense({
      space: h1.id,
      description: 'Orphan Me Expense',
      amount: 7.77,
      expense_date: TODAY,
    })
    const createdBankTxn = await api.createBankTransaction({
      description: 'Orphan Me Bank Txn',
      amount: '12.34',
      transaction_date: TODAY,
      space_id: h1.id,
    })

    const spaces = new SpacesPage(page)
    await spaces.goto()

    await spaces.archiveSpace('Source Orphan H1')
    // No rehomeTo → the helper selects the "unassigned" sentinel.
    await spaces.deletePermanently('Source Orphan H1')

    await expect(spaces.card('Source Orphan H1')).not.toBeVisible()

    // The bank transaction MUST survive — orphaned (space=NULL), not
    // destroyed (no-fake-numbers, Story 12.3 DoD #5). It's no longer
    // attached to H1 (which is gone) but persists with `space=null` and
    // is reachable via the BankTransaction `?unmapped=true` filter.
    const orphan = await api.getBankTransaction(createdBankTxn.id)
    expect(orphan).not.toBeNull()
    expect(orphan!.space).toBeNull()
    expect(orphan!.description).toBe('Orphan Me Bank Txn')
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Polish round — Delete directly from the active page (no archive step).
  // ──────────────────────────────────────────────────────────────────────────

  test('delete from active page removes the space without archiving first', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Active Delete Source')
    await api.createSpace('Active Delete Target')

    // Seed one manual expense so we can verify re-home moved it.
    await api.createExpense({
      space: h1.id,
      description: 'Direct Delete Re-home',
      amount: 9.99,
      expense_date: TODAY,
    })

    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.deleteFromActivePage('Active Delete Source', {
      rehomeTo: 'Active Delete Target',
    })

    // The card is gone, no detour through /archived.
    await expect(spaces.card('Active Delete Source')).not.toBeVisible()
    await expect(spaces.card('Active Delete Target')).toBeVisible()

    // The expense rode along with the re-home.
    const target = (await api.listSpaces()).find((s) => s.name === 'Active Delete Target')
    expect(target).toBeDefined()
    await page.goto(`/dashboard/transactions?space=${target!.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('tbody tr', { hasText: 'Direct Delete Re-home' })).toBeVisible()
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Polish round — End-date behaviour (variant D: informational badge +
  // dismissible warning banner with localStorage scoping per space:end_date).
  // ──────────────────────────────────────────────────────────────────────────

  test('Ended chip appears on the dates row when end_date is in the past', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const past = '2020-01-15'
    const s = await api.createSpace('Ended Project')
    await api.updateSpace(s.id, { start_date: '2019-01-01', end_date: past })

    const spaces = new SpacesPage(page)
    await spaces.goto()

    const card = spaces.card('Ended Project')
    await expect(card).toBeVisible()
    await expect(card.locator('.ended-chip', { hasText: 'Ended' })).toBeVisible()
  })

  test('Ended warning banner dismisses and stays dismissed across reload', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const past = '2021-06-15'
    const s = await api.createSpace('Dismissible Ended')
    await api.updateSpace(s.id, { end_date: past })

    const spaces = new SpacesPage(page)
    await spaces.goto()

    const card = spaces.card('Dismissible Ended')
    const warning = card.locator('.ended-warning')

    // Banner shows on first visit.
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('Archive when you')

    // Dismiss → banner vanishes immediately.
    await warning.locator('.ended-warning-dismiss').click()
    await expect(warning).not.toBeVisible()

    // localStorage holds the dismissal — reload must NOT bring the banner back.
    await page.reload()
    await page.waitForLoadState('networkidle')
    const reloadedCard = spaces.card('Dismissible Ended')
    await expect(reloadedCard.locator('.ended-warning')).not.toBeVisible()

    // The informational "Ended" chip MUST still be visible — dismissing the
    // nudge doesn't hide the fact that the space ended.
    await expect(reloadedCard.locator('.ended-chip', { hasText: 'Ended' })).toBeVisible()
  })

  test('Ended warning is absent when end_date is in the future', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    // Far enough future that the test stays valid for years.
    const future = '2099-12-31'
    const s = await api.createSpace('Still Running')
    await api.updateSpace(s.id, { end_date: future })

    const spaces = new SpacesPage(page)
    await spaces.goto()

    const card = spaces.card('Still Running')
    await expect(card).toBeVisible()
    await expect(card.locator('.ended-chip')).toHaveCount(0)
    await expect(card.locator('.ended-warning')).toHaveCount(0)
  })

  test('archived space is absent from the dashboard switcher', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createSpace('Stays Active')
    await api.createSpace('Soon Archived')

    const spaces = new SpacesPage(page)
    await spaces.goto()
    await spaces.archiveSpace('Soon Archived')

    // Open the analytics SpaceFilter modal — this is the canonical
    // multi-space "switcher" surfaced in the UI. It reads `parentData.spaces`
    // (active-only after Story 12.3 list filter), so the archived space must
    // not show up.
    await page.goto('/dashboard/analytics')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('space-filter-trigger').click()
    const modal = page.getByTestId('space-filter-modal')
    await expect(modal).toBeVisible()

    // Active space appears as a selectable row; archived one must not.
    const optionLabels: string[] = await modal
      .locator('.space-option .option-label')
      .allTextContents()
    expect(optionLabels).toContain('Stays Active')
    expect(optionLabels).not.toContain('Soon Archived')
  })
})
