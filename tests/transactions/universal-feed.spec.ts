/**
 * Phase 15 — Stories 15.1 / 15.2: the universal `/dashboard/transactions` feed.
 *
 * Covers the unified, allocation-aware feed (`GET /api/transactions/`) rendered
 * on the `/dashboard/transactions` page: manual + bank rows in one date-sorted
 * list, source/type/category/period/unmapped/ordering filters, the income/expense
 * red/green split, the split-row in-scope-amount display, the
 * `/dashboard/expenses` → `/dashboard/transactions` redirect, and the empty state.
 *
 * Seeding strategy: everything is seeded in EUR (the default User.currency), so
 * every row's `attributed_amount` == its full native amount with no FX conversion
 * and `fx_stale=false`. All rows are dated within the current month so the default
 * "this month" period window (and the custom-range deep-links below) include them.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

// Current month window — keeps every seeded row inside the default summary
// period and the custom-range deep-link windows used below.
const NOW = new Date()
const CURRENT_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
// Use the 15th of the current month to avoid any month-boundary timezone drift.
const MID_MONTH = `${CURRENT_MONTH}-15`

test.describe('Universal transactions feed', () => {
  test('manual + bank rows appear in one date-sorted list (default -date)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Feed Space One')

    // Two rows on distinct dates so we can assert -date ordering deterministically.
    await api.createExpense({
      space: space.id,
      description: 'FEED-MANUAL-OLDER',
      amount: 10,
      expense_date: `${CURRENT_MONTH}-05`,
    })
    await api.createBankTransaction({
      description: 'FEED-BANK-NEWER',
      amount: '20.00',
      transaction_date: `${CURRENT_MONTH}-20`,
      space_id: space.id,
      merchant_display_name: 'FEED-BANK-NEWER',
    })

    const expenses = new ExpensesPage(page)
    await expenses.gotoWithSpace(space.id)

    // Both origins present.
    await expect(expenses.row('FEED-MANUAL-OLDER')).toBeVisible()
    await expect(expenses.row('FEED-BANK-NEWER')).toBeVisible()

    // Default ordering is -date (newest first): the bank row (20th) precedes the
    // manual row (5th) in DOM order.
    const allText = await expenses.rows().allInnerTexts()
    const idxBank = allText.findIndex((t) => t.includes('FEED-BANK-NEWER'))
    const idxManual = allText.findIndex((t) => t.includes('FEED-MANUAL-OLDER'))
    expect(idxBank).toBeGreaterThanOrEqual(0)
    expect(idxManual).toBeGreaterThanOrEqual(0)
    expect(idxBank).toBeLessThan(idxManual)
  })

  test('a split transaction shows once with its in-scope allocation amount + split badge', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const spaceA = await api.createSpace('Split Feed A')
    const spaceB = await api.createSpace('Split Feed B')

    // 100 EUR expense split 70 → A, 30 → B.
    const expense = await api.createExpense({
      space: spaceA.id,
      description: 'SPLIT-FEED-ROW',
      amount: 100,
      expense_date: MID_MONTH,
    })
    await api.setExpenseAllocations(expense.id, [
      { space_id: spaceA.id, amount: '70.00' },
      { space_id: spaceB.id, amount: '30.00' },
    ])

    const expenses = new ExpensesPage(page)
    await expenses.gotoWithSpace(spaceA.id)

    // Exactly one row for the split parent under ?space=A.
    const splitRows = expenses.row('SPLIT-FEED-ROW')
    await expect(splitRows).toHaveCount(1)

    // The split badge shows the in-scope portion ("70.00 of 100.00"), not the
    // full native 100 as this space's share (no-fake-numbers).
    const badge = splitRows.locator('.split-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('70')
    await expect(badge).toContainText('100')

    // Feed parity: Σ attributed_amount for ?space=A == space A's summary outflow.
    const feedA = await api.getTransactionsFeed(`space=${spaceA.id}&period=${CURRENT_MONTH}`)
    const sumA = feedA.results.reduce((s, r) => s + Number(r.attributed_amount), 0)
    expect(sumA).toBeCloseTo(70, 2)

    const summaryA = await api.getSpacesSummary(`space=${spaceA.id}&period=${CURRENT_MONTH}`)
    expect(Number(summaryA.spaces[0].outflow)).toBeCloseTo(70, 2)

    // And space B sees 30.
    const feedB = await api.getTransactionsFeed(`space=${spaceB.id}&period=${CURRENT_MONTH}`)
    const sumB = feedB.results.reduce((s, r) => s + Number(r.attributed_amount), 0)
    expect(sumB).toBeCloseTo(30, 2)
  })

  test('?source=manual restricts to manual rows', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Source Manual Space')
    await api.createExpense({
      space: space.id,
      description: 'SRC-MANUAL-ROW',
      amount: 11,
      expense_date: MID_MONTH,
    })
    await api.createBankTransaction({
      description: 'SRC-BANK-ROW',
      amount: '22.00',
      transaction_date: MID_MONTH,
      space_id: space.id,
      merchant_display_name: 'SRC-BANK-ROW',
    })

    await page.goto(`/dashboard/transactions?space=${space.id}&source=manual`)
    await page.waitForLoadState('networkidle')

    const expenses = new ExpensesPage(page)
    await expect(expenses.row('SRC-MANUAL-ROW')).toBeVisible()
    await expect(expenses.row('SRC-BANK-ROW')).toHaveCount(0)
  })

  test('?source=bank restricts to bank rows', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Source Bank Space')
    await api.createExpense({
      space: space.id,
      description: 'SRCB-MANUAL-ROW',
      amount: 11,
      expense_date: MID_MONTH,
    })
    await api.createBankTransaction({
      description: 'SRCB-BANK-ROW',
      amount: '22.00',
      transaction_date: MID_MONTH,
      space_id: space.id,
      merchant_display_name: 'SRCB-BANK-ROW',
    })

    await page.goto(`/dashboard/transactions?space=${space.id}&source=bank`)
    await page.waitForLoadState('networkidle')

    const expenses = new ExpensesPage(page)
    await expect(expenses.row('SRCB-BANK-ROW')).toBeVisible()
    await expect(expenses.row('SRCB-MANUAL-ROW')).toHaveCount(0)
  })

  test('type tabs filter expense / income / all', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Type Tab Space')
    await api.createExpense({
      space: space.id,
      description: 'TYPE-EXPENSE-ROW',
      amount: 30,
      type: 'expense',
      expense_date: MID_MONTH,
    })
    await api.createExpense({
      space: space.id,
      description: 'TYPE-INCOME-ROW',
      amount: 40,
      type: 'income',
      expense_date: MID_MONTH,
    })

    const expenses = new ExpensesPage(page)

    // ?type=all (default) — both rows.
    await expenses.gotoWithSpace(space.id)
    await expect(expenses.row('TYPE-EXPENSE-ROW')).toBeVisible()
    await expect(expenses.row('TYPE-INCOME-ROW')).toBeVisible()

    // ?type=expense — only the expense row.
    await page.goto(`/dashboard/transactions?space=${space.id}&type=expense`)
    await page.waitForLoadState('networkidle')
    await expect(expenses.row('TYPE-EXPENSE-ROW')).toBeVisible()
    await expect(expenses.row('TYPE-INCOME-ROW')).toHaveCount(0)

    // ?type=income — only the income row.
    await page.goto(`/dashboard/transactions?space=${space.id}&type=income`)
    await page.waitForLoadState('networkidle')
    await expect(expenses.row('TYPE-INCOME-ROW')).toBeVisible()
    await expect(expenses.row('TYPE-EXPENSE-ROW')).toHaveCount(0)
  })

  test('expense rows red, income rows green on the list', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Color Space')
    await api.createExpense({
      space: space.id,
      description: 'COLOR-EXPENSE-ROW',
      amount: 12,
      type: 'expense',
      expense_date: MID_MONTH,
    })
    await api.createExpense({
      space: space.id,
      description: 'COLOR-INCOME-ROW',
      amount: 13,
      type: 'income',
      expense_date: MID_MONTH,
    })

    const expenses = new ExpensesPage(page)
    await expenses.gotoWithSpace(space.id)

    // Amount cells carry .amount-expense (red) / .amount-income (green).
    await expect(
      expenses.row('COLOR-EXPENSE-ROW').locator('td.cell-amount.amount-expense'),
    ).toHaveCount(1)
    await expect(
      expenses.row('COLOR-INCOME-ROW').locator('td.cell-amount.amount-income'),
    ).toHaveCount(1)
  })

  test('category + period filters narrow the list', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Cat Period Space')
    const travel = await api.findOrCreateCategory('Travel')

    // Two rows: one categorized Travel this month, one uncategorized last month.
    await api.createExpense({
      space: space.id,
      description: 'CATP-TRAVEL-THISMONTH',
      amount: 60,
      category: travel.id,
      expense_date: MID_MONTH,
    })
    const prev = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 15)
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    await api.createExpense({
      space: space.id,
      description: 'CATP-OTHER-LASTMONTH',
      amount: 70,
      expense_date: `${prevMonth}-15`,
    })

    const expenses = new ExpensesPage(page)

    // Category filter — only the Travel row.
    await page.goto(`/dashboard/transactions?space=${space.id}&category=${travel.id}`)
    await page.waitForLoadState('networkidle')
    await expect(expenses.row('CATP-TRAVEL-THISMONTH')).toBeVisible()
    await expect(expenses.row('CATP-OTHER-LASTMONTH')).toHaveCount(0)

    // Period filter — a custom window covering only the current month excludes
    // last month's row. (The page period model is ?preset=custom&date_from=&date_to=,
    // not the removed ?month= deep-link.)
    await page.goto(
      `/dashboard/transactions?space=${space.id}&preset=custom&date_from=${CURRENT_MONTH}-01&date_to=${CURRENT_MONTH}-28`,
    )
    await page.waitForLoadState('networkidle')
    await expect(expenses.row('CATP-TRAVEL-THISMONTH')).toBeVisible()
    await expect(expenses.row('CATP-OTHER-LASTMONTH')).toHaveCount(0)
  })

  test('filters persist across navigation away and back (until cleared)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Persist Space')
    const travel = await api.findOrCreateCategory('Travel')

    // One row that matches a category filter, one that does not.
    await api.createExpense({
      space: space.id,
      description: 'PERSIST-TRAVEL',
      amount: 33,
      category: travel.id,
      expense_date: MID_MONTH,
    })
    await api.createExpense({
      space: space.id,
      description: 'PERSIST-OTHER',
      amount: 44,
      expense_date: MID_MONTH,
    })

    const expenses = new ExpensesPage(page)

    // Apply a category filter via URL — persistence saves it to localStorage.
    await page.goto(`/dashboard/transactions?space=${space.id}&category=${travel.id}`)
    await page.waitForLoadState('networkidle')
    await expect(expenses.row('PERSIST-TRAVEL')).toBeVisible()
    await expect(expenses.row('PERSIST-OTHER')).toHaveCount(0)

    // Leave the page entirely, then return to a BARE transactions URL (no filter
    // params) — exactly what the sidebar link does. The saved filter restores
    // itself via an onMount replaceState navigation.
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.goto('/dashboard/transactions')
    await page.waitForURL(new RegExp(`category=${travel.id}`))
    await page.waitForLoadState('networkidle')
    await expect(expenses.row('PERSIST-TRAVEL')).toBeVisible()
    await expect(expenses.row('PERSIST-OTHER')).toHaveCount(0)
  })

  test('?unmapped=true shows only unmapped bank rows (manual excluded)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Unmapped Space')

    // An unmapped bank row (space_id=null), a mapped bank row, and a manual row.
    // Use non-overlapping descriptions so a `hasText` row match can't collide
    // (e.g. "MAPPED" is a substring of "UNMAPPED").
    await api.createBankTransaction({
      description: 'INBOX-BANK-NOSPACE',
      amount: '15.00',
      transaction_date: MID_MONTH,
      space_id: null,
      merchant_display_name: 'INBOX-BANK-NOSPACE',
    })
    await api.createBankTransaction({
      description: 'ASSIGNED-BANK-ROW',
      amount: '16.00',
      transaction_date: MID_MONTH,
      space_id: space.id,
      merchant_display_name: 'ASSIGNED-BANK-ROW',
    })
    await api.createExpense({
      space: space.id,
      description: 'CASH-MANUAL-ROW',
      amount: 17,
      expense_date: MID_MONTH,
    })

    const expenses = new ExpensesPage(page)
    await page.goto('/dashboard/transactions?unmapped=true')
    await page.waitForLoadState('networkidle')

    await expect(expenses.row('INBOX-BANK-NOSPACE')).toBeVisible()
    await expect(expenses.row('ASSIGNED-BANK-ROW')).toHaveCount(0)
    await expect(expenses.row('CASH-MANUAL-ROW')).toHaveCount(0)
  })

  test('?ordering=amount / -amount reorders', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Ordering Space')
    await api.createExpense({
      space: space.id,
      description: 'ORDER-SMALL',
      amount: 5,
      expense_date: MID_MONTH,
    })
    await api.createExpense({
      space: space.id,
      description: 'ORDER-LARGE',
      amount: 500,
      expense_date: MID_MONTH,
    })

    const expenses = new ExpensesPage(page)

    // amount asc → small precedes large.
    await page.goto(`/dashboard/transactions?space=${space.id}&ordering=amount`)
    await page.waitForLoadState('networkidle')
    let texts = await expenses.rows().allInnerTexts()
    let idxSmall = texts.findIndex((t) => t.includes('ORDER-SMALL'))
    let idxLarge = texts.findIndex((t) => t.includes('ORDER-LARGE'))
    expect(idxSmall).toBeGreaterThanOrEqual(0)
    expect(idxLarge).toBeGreaterThanOrEqual(0)
    expect(idxSmall).toBeLessThan(idxLarge)

    // amount desc → large precedes small.
    await page.goto(`/dashboard/transactions?space=${space.id}&ordering=-amount`)
    await page.waitForLoadState('networkidle')
    texts = await expenses.rows().allInnerTexts()
    idxSmall = texts.findIndex((t) => t.includes('ORDER-SMALL'))
    idxLarge = texts.findIndex((t) => t.includes('ORDER-LARGE'))
    expect(idxLarge).toBeLessThan(idxSmall)
  })

  test('/dashboard/expenses redirects to /dashboard/transactions preserving query', async ({
    page,
    loggedInPage: _,
  }) => {
    // The legacy route 307-redirects to the canonical page, preserving the query
    // string (e.g. ?unmapped=true). hooks.server.ts runs the auth check first.
    await page.goto('/dashboard/expenses?unmapped=true')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/dashboard\/transactions\?unmapped=true$/)
  })

  test('over-narrow filters show empty-state', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Empty Filter Space')
    await api.createExpense({
      space: space.id,
      description: 'EMPTY-FILTER-ROW',
      amount: 9,
      type: 'expense',
      expense_date: MID_MONTH,
    })

    // The space has only an expense row; filtering to income → empty state.
    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/transactions?space=${space.id}&type=income`)
    await page.waitForLoadState('networkidle')
    await expect(expenses.emptyState).toBeVisible()
    await expect(expenses.row('EMPTY-FILTER-ROW')).toHaveCount(0)
  })
})
