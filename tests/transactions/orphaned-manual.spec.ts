/**
 * Phase 15 — Story 15.4: orphaned-manual-expense surface
 * (`/dashboard/transactions?view=orphaned`).
 *
 * An expense whose space was hard-deleted with `rehome_to=null` becomes
 * `space=NULL` (orphaned). The orphaned tab lists those rows (own, `created_by`)
 * and re-homes them to an active space via `POST /api/expenses/<id>/rehome/`.
 * Archived spaces are NOT offered as re-home targets (the picker is sourced from
 * the layout's `GET /api/spaces/`, which returns active spaces only).
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const CURRENT_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const MID_MONTH = `${CURRENT_MONTH}-15`

/** Create a manual expense, then hard-delete its space (rehome_to=null) to orphan it. */
async function orphanAnExpense(
  api: import('../../helpers/api').ApiHelper,
  description: string,
  survivorName = 'Survivor',
): Promise<number> {
  const doomed = await api.createSpace(`Doomed ${description}`)
  await api.createSpace(`${survivorName} ${description}`)
  const expense = await api.createExpense({
    space: doomed.id,
    description,
    amount: 42,
    expense_date: MID_MONTH,
  })
  const del = await api.deleteSpaceRehome(doomed.id, null)
  expect(del.ok(), `delete-with-orphan failed: ${await del.text()}`).toBeTruthy()
  return expense.id
}

const orphanRow = (page: import('@playwright/test').Page, description: string) =>
  page.locator('tbody tr', { hasText: description })

test.describe('Orphaned-manual surface', () => {
  test('an expense orphaned by a hard-delete appears on the orphaned surface', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await orphanAnExpense(api, 'ORPHAN-APPEARS')

    await page.goto('/dashboard/transactions?view=orphaned')
    await page.waitForLoadState('networkidle')

    await expect(orphanRow(page, 'ORPHAN-APPEARS')).toBeVisible()
  })

  test('re-homing moves it to the chosen space and off the surface', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const orphanId = await orphanAnExpense(api, 'ORPHAN-REHOME', 'RehomeTarget')

    await page.goto('/dashboard/transactions?view=orphaned')
    await page.waitForLoadState('networkidle')

    const row = orphanRow(page, 'ORPHAN-REHOME')
    await expect(row).toBeVisible()

    // Pick the survivor space (the only active space the user has) and re-home.
    const select = row.locator('select.rehome-select')
    // The picker offers exactly the active survivor space (+ the placeholder).
    const target = (await api.listSpaces())[0]
    await select.selectOption(String(target.id))
    await row.locator('button', { hasText: 'Re-home' }).click()

    // It disappears from the orphaned surface (optimistic client removal).
    await expect(orphanRow(page, 'ORPHAN-REHOME')).toHaveCount(0)

    // And it is no longer orphaned at the API.
    const orphans = await api.listOrphanedExpenses()
    expect(orphans.map((e) => e.id)).not.toContain(orphanId)
  })

  test('archived spaces are not offered as re-home targets', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    // Build: a doomed space (gets deleted → orphan), an active survivor, and an
    // archived space. Only the active survivor may be a re-home target.
    const doomed = await api.createSpace('Doomed Archived-Test')
    const active = await api.createSpace('Active Target Archived-Test')
    const archived = await api.createSpace('Archived Target Archived-Test')
    await api.createExpense({
      space: doomed.id,
      description: 'ORPHAN-ARCHIVED-TARGETS',
      amount: 50,
      expense_date: MID_MONTH,
    })
    expect((await api.deleteSpaceRehome(doomed.id, null)).ok()).toBeTruthy()
    expect((await api.archiveSpaceRaw(archived.id)).ok()).toBeTruthy()

    await page.goto('/dashboard/transactions?view=orphaned')
    await page.waitForLoadState('networkidle')

    const row = orphanRow(page, 'ORPHAN-ARCHIVED-TARGETS')
    await expect(row).toBeVisible()

    const select = row.locator('select.rehome-select')
    const optionTexts = await select.locator('option').allInnerTexts()
    expect(optionTexts.some((t) => t.includes('Active Target Archived-Test'))).toBeTruthy()
    expect(optionTexts.some((t) => t.includes('Archived Target Archived-Test'))).toBeFalsy()
  })

  test('empty-state when no orphans', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    // The user has a space and a non-orphaned expense — nothing orphaned.
    const space = await api.createSpace('No-Orphans Space')
    await api.createExpense({
      space: space.id,
      description: 'HOMED-EXPENSE',
      amount: 8,
      expense_date: MID_MONTH,
    })

    await page.goto('/dashboard/transactions?view=orphaned')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.empty-state', { hasText: 'No orphaned expenses' })).toBeVisible()
    await expect(orphanRow(page, 'HOMED-EXPENSE')).toHaveCount(0)
  })
})
