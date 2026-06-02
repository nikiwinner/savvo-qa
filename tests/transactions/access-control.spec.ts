/**
 * Phase 15 — cross-story access control for `/dashboard/transactions`.
 *
 * - An unauthenticated user hitting the page is redirected to /login
 *   (hooks.server.ts guard on /dashboard/*).
 * - A foreign `?space=<id>` surfaces NO rows (silent-drop, not a 403 / leak).
 *   The feed + page resolve `?space=` via the silent-drop resolver, so a
 *   non-member id never lands another user's transactions.
 */
import { test, expect } from '@playwright/test'
import { test as appTest } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const NOW = new Date()
const CURRENT_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const MID_MONTH = `${CURRENT_MONTH}-15`

test.describe('Transactions access control (unauthenticated)', () => {
  test('unauthenticated user redirected from /dashboard/transactions to /login', async ({
    page,
  }) => {
    await page.goto('/dashboard/transactions')
    await expect(page).toHaveURL('/login')
  })
})

appTest.describe('Transactions access control (foreign space)', () => {
  appTest('foreign ?space=<id> returns no rows (silent-drop)', async ({
    page,
    twoActors,
  }) => {
    const { apiA, apiB } = twoActors

    // User B owns a space with a transaction. User A must never see it via a
    // crafted ?space= pointing at B's space.
    const spaceB = await apiB.createSpace('B-only Secret Space')
    await apiB.createExpense({
      space: spaceB.id,
      description: 'B-SECRET-TXN',
      amount: 999,
      expense_date: MID_MONTH,
    })

    // Switch the browser to user A.
    const cookiesA = await apiA.cookies()
    await page.context().clearCookies()
    await page.context().addCookies(cookiesA)

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/transactions?space=${spaceB.id}`)
    await page.waitForLoadState('networkidle')

    // No leak: B's transaction is invisible, and the feed returns nothing for A.
    await expect(expenses.row('B-SECRET-TXN')).toHaveCount(0)
    const feed = await apiA.getTransactionsFeed(`space=${spaceB.id}`)
    expect(
      feed.results.some(
        (r) => (r.description as string | undefined) === 'B-SECRET-TXN',
      ),
    ).toBeFalsy()

    // The page renders the empty state (A's silent-dropped scope = all A spaces;
    // A has none with this txn) rather than 403.
    await expect(page).toHaveURL(/\/dashboard\/transactions/)
  })
})
