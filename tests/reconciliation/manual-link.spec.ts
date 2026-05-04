/**
 * Reconciliation — Manual Link Form (Phase 08, Story 8.1)
 *
 * Verifies the manual link form on /dashboard/reconciliation:
 *  - creates links between rows the auto-suggester misses (date outside ±2d)
 *  - surfaces 400 errors inline (currency mismatch)
 *  - filters expense list by search substring
 *  - hides already-linked rows when "unlinked only" is on (default)
 *
 * Story 8.6 (existing-links section) has not shipped yet, so test #1 verifies
 * link creation via API rather than via the existing-links UI.
 */
import { test, expect } from '../../fixtures/index'

test.describe('Manual link form', () => {
  test('manual link form creates a link between non-suggested rows', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Manual Link Create')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Outside the auto-suggester window: amounts differ AND dates are 5 days apart.
    // The algorithm groups by (amount, currency) and uses ±2d window, so this pair
    // never appears as a suggestion — exactly what the manual form is for.
    const expense = await api.createExpense({
      household: hh.id,
      description: 'Manual link test expense',
      amount: 10.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-01-15',
    })

    const bankTxn = await api.createBankTransaction({
      description: 'MANUAL LINK TEST SHOP',
      merchant_display_name: 'MANUAL LINK TEST SHOP',
      amount: '10.50',
      type: 'expense',
      transaction_date: '2026-01-20',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The manual link form should be present
    const form = page.locator('.manual-link-form')
    await expect(form).toBeVisible()

    // Locate the two panels by their headings (avoids ambiguity with role=listbox)
    const expensePanel = page.locator('.panel', {
      has: page.locator('.panel-title', { hasText: 'Manual Expenses' }),
    })
    const bankPanel = page.locator('.panel', {
      has: page.locator('.panel-title', { hasText: 'Bank Transactions' }),
    })

    // Wait for both panels to load their first batch of rows
    const expenseRow = expensePanel.locator('.result-row', {
      hasText: 'Manual link test expense',
    })
    const bankRow = bankPanel.locator('.result-row', {
      hasText: 'MANUAL LINK TEST SHOP',
    })
    await expect(expenseRow).toBeVisible({ timeout: 5000 })
    await expect(bankRow).toBeVisible({ timeout: 5000 })

    // Select one of each
    await expenseRow.click()
    await bankRow.click()

    // Submit
    const submitBtn = page.locator('.btn-submit')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Success message appears
    await expect(page.locator('.submit-success')).toBeVisible({ timeout: 5000 })

    // No submit error
    await expect(page.locator('.submit-error')).toHaveCount(0)

    // Verify via API that the link was actually created (Story 8.6 existing-links UI not shipped)
    const links = await api.listReconciliationLinks(hh.id)
    expect(links.count).toBe(1)
    expect(links.results[0].expense_id).toBe(expense.id)
    expect(links.results[0].bank_transaction_id).toBe(bankTxn.id)
    expect(links.results[0].source).toBe('manual')

    // UI side-effect: the just-linked rows disappear from both panels (unlinked-only is on)
    await expect(expenseRow).toHaveCount(0, { timeout: 5000 })
    await expect(bankRow).toHaveCount(0, { timeout: 5000 })
  })

  test('manual link form surfaces 400 errors inline (currency mismatch)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    // User defaults to EUR; expense currency is snapshotted from user → EUR.
    const hh = await api.createHousehold('Manual Link Currency Mismatch')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createExpense({
      household: hh.id,
      description: 'EUR mismatch expense',
      amount: 25.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-02-10',
    })

    await api.createBankTransaction({
      description: 'USD MISMATCH SHOP',
      merchant_display_name: 'USD MISMATCH SHOP',
      amount: '25.00',
      type: 'expense',
      transaction_date: '2026-02-10',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'USD',
    })

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const expensePanel = page.locator('.panel', {
      has: page.locator('.panel-title', { hasText: 'Manual Expenses' }),
    })
    const bankPanel = page.locator('.panel', {
      has: page.locator('.panel-title', { hasText: 'Bank Transactions' }),
    })

    const expenseRow = expensePanel.locator('.result-row', { hasText: 'EUR mismatch expense' })
    const bankRow = bankPanel.locator('.result-row', { hasText: 'USD MISMATCH SHOP' })
    await expect(expenseRow).toBeVisible({ timeout: 5000 })
    await expect(bankRow).toBeVisible({ timeout: 5000 })

    await expenseRow.click()
    await bankRow.click()
    await page.locator('.btn-submit').click()

    // Error message rendered inline
    const err = page.locator('.submit-error')
    await expect(err).toBeVisible({ timeout: 5000 })
    await expect(err).toContainText('Currency mismatch.')

    // No success
    await expect(page.locator('.submit-success')).toHaveCount(0)

    // No link was created
    const links = await api.listReconciliationLinks(hh.id)
    expect(links.count).toBe(0)
  })

  test('search input filters expenses by description', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Manual Link Search Filter')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createExpense({
      household: hh.id,
      description: 'Coffee at Starbucks',
      amount: 5.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-03-01',
    })
    await api.createExpense({
      household: hh.id,
      description: 'Lunch at Pret',
      amount: 12.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-03-02',
    })
    await api.createExpense({
      household: hh.id,
      description: 'Dinner at Nobu',
      amount: 80.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-03-03',
    })

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const expensePanel = page.locator('.panel', {
      has: page.locator('.panel-title', { hasText: 'Manual Expenses' }),
    })
    const expenseRows = expensePanel.locator('.result-row')

    // All three present initially
    await expect(expenseRows).toHaveCount(3, { timeout: 5000 })

    // Type a substring that matches only one
    const searchInput = expensePanel.locator('input[aria-label="Search manual expenses"]')
    await searchInput.fill('Starbucks')

    // Debounce is 300ms; result list filters down to 1
    await expect(expenseRows).toHaveCount(1, { timeout: 5000 })
    await expect(expenseRows.first()).toContainText('Coffee at Starbucks')

    // Clear → all three return
    await searchInput.fill('')
    await expect(expenseRows).toHaveCount(3, { timeout: 5000 })
  })

  test('unlinked filter excludes already-linked rows', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Manual Link Unlinked Filter')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Pair A — will be linked via API before opening the form
    const expenseA = await api.createExpense({
      household: hh.id,
      description: 'Linked pair A expense',
      amount: 40.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-04-01',
    })
    const bankA = await api.createBankTransaction({
      description: 'LINKED PAIR A SHOP',
      merchant_display_name: 'LINKED PAIR A SHOP',
      amount: '40.00',
      type: 'expense',
      transaction_date: '2026-04-01',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })
    await api.createReconciliationLink(expenseA.id, bankA.id)

    // Pair B — left unlinked
    await api.createExpense({
      household: hh.id,
      description: 'Unlinked pair B expense',
      amount: 60.00,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-04-15',
    })
    await api.createBankTransaction({
      description: 'UNLINKED PAIR B SHOP',
      merchant_display_name: 'UNLINKED PAIR B SHOP',
      amount: '60.00',
      type: 'expense',
      transaction_date: '2026-04-15',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const expensePanel = page.locator('.panel', {
      has: page.locator('.panel-title', { hasText: 'Manual Expenses' }),
    })
    const bankPanel = page.locator('.panel', {
      has: page.locator('.panel-title', { hasText: 'Bank Transactions' }),
    })

    const expenseRows = expensePanel.locator('.result-row')
    const bankRows = bankPanel.locator('.result-row')

    // With unlinked-only ON (default), only the unlinked pair B should appear in each panel
    await expect(expenseRows).toHaveCount(1, { timeout: 5000 })
    await expect(expenseRows.first()).toContainText('Unlinked pair B expense')
    await expect(expensePanel).not.toContainText('Linked pair A expense')

    await expect(bankRows).toHaveCount(1, { timeout: 5000 })
    await expect(bankRows.first()).toContainText('UNLINKED PAIR B SHOP')
    await expect(bankPanel).not.toContainText('LINKED PAIR A SHOP')

    // Toggle unlinked-only OFF — both pairs should now appear
    const expenseToggle = expensePanel.locator('input[aria-label="Show unlinked expenses only"]')
    await expenseToggle.uncheck()
    await expect(expenseRows).toHaveCount(2, { timeout: 5000 })
    await expect(expensePanel).toContainText('Linked pair A expense')

    const bankToggle = bankPanel.locator('input[aria-label="Show unlinked bank transactions only"]')
    await bankToggle.uncheck()
    await expect(bankRows).toHaveCount(2, { timeout: 5000 })
    await expect(bankPanel).toContainText('LINKED PAIR A SHOP')
  })
})
