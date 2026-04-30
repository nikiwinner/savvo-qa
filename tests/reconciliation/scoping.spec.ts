/**
 * Reconciliation — Scoping + pending guards (Phase 07, Stories 7.4 + 7.5)
 *
 * Verifies cross-household isolation, pending-transaction rejection,
 * and unauthenticated access redirection.
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const TODAY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-15`

test.describe('Reconciliation scoping', () => {
  test('cross-household link returns 400 at the API', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    // Actor A creates a household with an expense
    const hhA = await apiA.createHousehold('Scoping HH A')
    const expenseA = await apiA.createExpense({
      household: hhA.id,
      description: 'Expense in HH A',
      amount: 50.00,
      type: 'expense',
      expense_date: TODAY,
    })

    // Actor B creates a household with a bank transaction
    const hhB = await apiB.createHousehold('Scoping HH B')
    const txnB = await apiB.createBankTransaction({
      description: 'Txn in HH B',
      amount: '50.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: hhB.id,
      currency: 'EUR',
    })

    // Actor A tries to link their expense to B's bank transaction — should be 400
    const res = await apiA.createReconciliationLinkRaw(
      Number(expenseA.id),
      txnB.id,
      { from_suggestion: false },
    )
    expect(res.status()).toBe(400)
  })

  test('pending bank transaction link returns 400', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Scoping Pending Guard')

    const expense = await api.createExpense({
      household: hh.id,
      description: 'Pending test expense',
      amount: 99.00,
      type: 'expense',
      expense_date: TODAY,
    })

    // Create a pending bank transaction
    const txn = await api.createBankTransaction({
      description: 'Pending txn',
      amount: '99.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: hh.id,
      currency: 'EUR',
      pending: true,
    })

    const res = await api.createReconciliationLinkRaw(Number(expense.id), txn.id)
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Pending')
  })

  test('unauthenticated user is redirected from /dashboard/reconciliation', async ({ page }) => {
    // No login — visit the reconciliation page directly
    await page.goto('/dashboard/reconciliation')
    await page.waitForLoadState('networkidle')

    // Should land on /login
    expect(page.url()).toContain('/login')
  })
})
