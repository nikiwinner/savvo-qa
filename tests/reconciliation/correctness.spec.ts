/**
 * Reconciliation — Correctness regression (Phase 07, Stories 7.6 + 7.8)
 *
 * Verifies the link mechanics: confirming a suggestion creates a link stamped
 * source='suggestion', and deleting a link removes it. (Budget-spent
 * double-count integration assertions were removed when the budgets feature
 * was deleted — canonical_source dedup is now exercised via analytics.)
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const YEAR = NOW.getFullYear()
const MONTH = NOW.getMonth() + 1
const TODAY = `${YEAR}-${String(MONTH).padStart(2, '0')}-15`

test.describe('Reconciliation correctness', () => {
  test('confirming a suggestion stamps source=suggestion on the link', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Correctness Source Stamp')
    const categories = await api.listCategories()
    const cat = categories[0]

    const expense = await api.createExpense({
      household: hh.id,
      description: 'Aldi groceries',
      amount: 32.00,
      category: cat.id,
      type: 'expense',
      expense_date: TODAY,
    })

    await api.createBankTransaction({
      description: 'ALDI SUED',
      merchant_display_name: 'ALDI SUED',
      amount: '32.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    const suggestions = await api.listSuggestions(hh.id)
    const suggestion = suggestions.results.find((s) => s.expense.id === Number(expense.id))
    expect(suggestion).toBeDefined()

    await api.createReconciliationLink(
      Number(expense.id),
      suggestion!.bank_transaction.id,
      { from_suggestion: true },
    )

    const links = await api.listReconciliationLinks(hh.id)
    const link = links.results.find(
      (l) => l.expense_id === Number(expense.id),
    )
    expect(link).toBeDefined()
    expect(link!.source).toBe('suggestion')
    expect(link!.confidence).not.toBeNull()
  })

  test('unlinking via DELETE removes the link', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Correctness Unlink Restore')
    const categories = await api.listCategories()
    const cat = categories[0]

    const expense = await api.createExpense({
      household: hh.id,
      description: 'Rewe shopping',
      amount: 60.00,
      category: cat.id,
      type: 'expense',
      expense_date: TODAY,
    })

    await api.createBankTransaction({
      description: 'REWE MARKT',
      merchant_display_name: 'REWE MARKT',
      amount: '60.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    const suggestions = await api.listSuggestions(hh.id)
    const suggestion = suggestions.results.find((s) => s.expense.id === Number(expense.id))
    expect(suggestion).toBeDefined()

    const link = await api.createReconciliationLink(
      Number(expense.id),
      suggestion!.bank_transaction.id,
      { from_suggestion: true },
    )

    // The link is present after creation.
    const linkedLinks = await api.listReconciliationLinks(hh.id)
    expect(linkedLinks.results.some((l) => l.id === link.id)).toBe(true)

    // Delete the link.
    await api.deleteReconciliationLink(link.id)

    // The link is gone.
    const unlinkedLinks = await api.listReconciliationLinks(hh.id)
    expect(unlinkedLinks.results.some((l) => l.id === link.id)).toBe(false)
  })
})
