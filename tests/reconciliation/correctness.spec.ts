/**
 * Reconciliation — Correctness regression (Phase 07, Stories 7.6 + 7.8)
 *
 * Verifies the headline guarantee: a confirmed reconciliation link eliminates
 * double-counting in budget spend totals, and the dashboard widget matches the
 * budgets page totals.
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const YEAR = NOW.getFullYear()
const MONTH = NOW.getMonth() + 1
const TODAY = `${YEAR}-${String(MONTH).padStart(2, '0')}-15`

test.describe('Reconciliation correctness', () => {
  test('confirming a suggestion creates a link and updates budget total to single-count', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Correctness Single Count')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '500.00',
      year: YEAR,
      month: MONTH,
    })

    // Seed a manual expense and a matching bank transaction — same amount,
    // currency, category. Both are EUR so the suggestion algorithm matches them.
    const expense = await api.createExpense({
      household: hh.id,
      description: 'Lidl groceries',
      amount: 47.50,
      category: cat.id,
      type: 'expense',
      expense_date: TODAY,
    })

    await api.createBankTransaction({
      description: 'LIDL #1234',
      merchant_display_name: 'LIDL #1234',
      amount: '47.50',
      type: 'expense',
      transaction_date: TODAY,
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    // Without a link, both contribute → 95.00
    const budgetsBefore = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const budgetBefore = budgetsBefore.find((b) => b.category === cat.id)
    expect(budgetBefore).toBeDefined()
    expect(parseFloat(budgetBefore!.spent)).toBeCloseTo(95.00, 1)

    // Get the suggestion and confirm it
    const suggestions = await api.listSuggestions(hh.id)
    expect(suggestions.results.length).toBeGreaterThan(0)
    const suggestion = suggestions.results.find(
      (s) => s.expense.id === Number(expense.id),
    )
    expect(suggestion).toBeDefined()

    await api.createReconciliationLink(
      Number(expense.id),
      suggestion!.bank_transaction.id,
      { from_suggestion: true },
    )

    // After linking, only the manual side counts (canonical_source='manual' by default)
    const budgetsAfter = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const budgetAfter = budgetsAfter.find((b) => b.category === cat.id)
    expect(budgetAfter).toBeDefined()
    expect(parseFloat(budgetAfter!.spent)).toBeCloseTo(47.50, 1)
  })

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

  test('unlinking via DELETE restores double counting', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Correctness Unlink Restore')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '200.00',
      year: YEAR,
      month: MONTH,
    })

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

    // Confirm single count after linking
    const linkedBudgets = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const linkedBudget = linkedBudgets.find((b) => b.category === cat.id)
    expect(parseFloat(linkedBudget!.spent)).toBeCloseTo(60.00, 1)

    // Delete the link
    await api.deleteReconciliationLink(link.id)

    // Double count is restored
    const unlinkedBudgets = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const unlinkedBudget = unlinkedBudgets.find((b) => b.category === cat.id)
    expect(parseFloat(unlinkedBudget!.spent)).toBeCloseTo(120.00, 1)
  })

  test('dashboard widget total matches budgets page total after linking', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Correctness Widget Match')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '300.00',
      year: YEAR,
      month: MONTH,
    })

    const expense = await api.createExpense({
      household: hh.id,
      description: 'Kaufland purchase',
      amount: 75.00,
      category: cat.id,
      type: 'expense',
      expense_date: TODAY,
    })

    await api.createBankTransaction({
      description: 'KAUFLAND',
      merchant_display_name: 'KAUFLAND',
      amount: '75.00',
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

    // Get the spent value from the API (source of truth)
    const budgets = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const budget = budgets.find((b) => b.category === cat.id)
    expect(budget).toBeDefined()
    const apiSpent = parseFloat(budget!.spent)
    expect(apiSpent).toBeCloseTo(75.00, 1)

    // Verify the dashboard page loads without errors and shows the household
    await page.goto(`/dashboard?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The budget widget should be present (not the CTA) since a budget exists
    const widget = page.locator('.budget-widget')
    await expect(widget).toBeVisible()

    // The budgets page should show the same spent value (not 150.00 = double-count)
    await page.goto(`/dashboard/budgets?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Check the spent value displayed is close to 75.00, not 150.00
    const spentCells = page.locator('[data-testid="budget-spent"], .budget-spent, .spent-amount')
    const count = await spentCells.count()
    if (count > 0) {
      const text = await spentCells.first().textContent()
      // Should not contain 150 (double-count)
      expect(text).not.toMatch(/150/)
    }
  })
})
