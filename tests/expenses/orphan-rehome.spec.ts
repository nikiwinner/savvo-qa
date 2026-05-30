/**
 * Phase 13 — Story 13.6: re-home API for orphaned manual expenses.
 *
 * Flow: a manual expense lives in a space; the space is hard-deleted with
 * `rehome_to=null` (the Phase-12 orphan path → Expense.space SET_NULL). The
 * orphan is then reachable via `GET /api/expenses/orphaned/` (scoped by
 * created_by) and re-homeable via `POST /api/expenses/<id>/rehome/`.
 *
 * API-level E2E (no UI surface ships for orphans in Phase 13 — only the API).
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Orphaned manual expense re-home (API)', () => {
  test('an orphaned manual expense is listed via the orphaned action', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    // Need a second space so deleting the first leaves the user with ≥1 space
    // and is a clean "orphan its rows" delete (rehome_to=null).
    const doomed = await api.createSpace('Doomed Space')
    await api.createSpace('Survivor Space')

    const expense = await api.createExpense({
      space: doomed.id,
      description: 'ORPHAN-CANDIDATE EXPENSE',
      amount: 42,
      expense_date: TODAY,
    })

    // Before deletion, the orphan bucket is empty for this expense.
    const orphansBefore = await api.listOrphanedExpenses()
    expect(orphansBefore.map((e) => e.id)).not.toContain(expense.id)

    // Hard-delete the space, orphaning its rows (rehome_to=null).
    const del = await api.deleteSpaceRehome(doomed.id, null)
    expect(del.ok(), `delete-with-orphan failed: ${await del.text()}`).toBeTruthy()

    // The expense is now reachable through the orphaned action.
    const orphansAfter = await api.listOrphanedExpenses()
    expect(orphansAfter.map((e) => e.id)).toContain(expense.id)
  })

  test('an orphaned manual expense can be re-homed to an active space', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const doomed = await api.createSpace('Rehome Doomed Space')
    const survivor = await api.createSpace('Rehome Target Space')

    const expense = await api.createExpense({
      space: doomed.id,
      description: 'REHOME-ME EXPENSE',
      amount: 13.37,
      expense_date: TODAY,
    })

    const del = await api.deleteSpaceRehome(doomed.id, null)
    expect(del.ok(), `delete-with-orphan failed: ${await del.text()}`).toBeTruthy()

    // Confirm it is orphaned first.
    expect((await api.listOrphanedExpenses()).map((e) => e.id)).toContain(expense.id)

    // Re-home to the survivor space.
    const rehome = await api.rehomeExpenseRaw(expense.id, survivor.id)
    expect(rehome.ok(), `rehome failed: ${await rehome.text()}`).toBeTruthy()

    // It is gone from the orphan bucket and now homed in the survivor.
    expect((await api.listOrphanedExpenses()).map((e) => e.id)).not.toContain(expense.id)
    const survivorExpenses = await api.listExpenses()
    expect(survivorExpenses.map((e) => e.id)).toContain(expense.id)
  })

  test('re-homing into a foreign space is rejected', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors
    const doomedA = await apiA.createSpace('A doomed')
    await apiA.createSpace('A survivor')
    const spaceB = await apiB.createSpace('B target')

    const expenseA = await apiA.createExpense({
      space: doomedA.id,
      description: 'CROSS-USER REHOME EXPENSE',
      amount: 5,
      expense_date: TODAY,
    })
    const del = await apiA.deleteSpaceRehome(doomedA.id, null)
    expect(del.ok()).toBeTruthy()

    // userA tries to re-home their orphan into userB's space → rejected (400).
    const res = await apiA.rehomeExpenseRaw(expenseA.id, spaceB.id)
    expect(res.status()).toBe(400)

    // Still orphaned.
    expect((await apiA.listOrphanedExpenses()).map((e) => e.id)).toContain(expenseA.id)
  })

  test('orphaned action does not leak another user\'s orphans', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors
    const doomedB = await apiB.createSpace('B doomed')
    await apiB.createSpace('B survivor')
    const orphanB = await apiB.createExpense({
      space: doomedB.id,
      description: 'B-ONLY ORPHAN',
      amount: 9,
      expense_date: TODAY,
    })
    expect((await apiB.deleteSpaceRehome(doomedB.id, null)).ok()).toBeTruthy()

    // userA's orphan list never contains userB's orphan.
    const aOrphans = await apiA.listOrphanedExpenses()
    expect(aOrphans.map((e) => e.id)).not.toContain(orphanB.id)
    // userB sees their own.
    expect((await apiB.listOrphanedExpenses()).map((e) => e.id)).toContain(orphanB.id)
  })
})
