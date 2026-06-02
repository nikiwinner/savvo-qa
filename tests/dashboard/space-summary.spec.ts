/**
 * Phase 15 — Stories 15.3 / 15.5: per-space summary cards + in/out bar.
 *
 * Covers the `/dashboard` per-space Income/Expense/Net summary cards built on
 * `GET /api/spaces/summary/` (contract B): one card per in-scope space, figures
 * as real period sums, the no-fake-numbers deep-link gate (card figure → the
 * transactions page whose totals strip == the figure), allocation-aware split
 * attribution across cards, foreign-space silent-drop, and the InOutBar visual
 * (proportional segments + neutral empty state).
 *
 * The summary endpoint defaults to the CURRENT MONTH, so every seeded row is
 * dated this month. Everything is EUR (default User.currency) → no FX, sums are
 * the raw native amounts.
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const CURRENT_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const MID_MONTH = `${CURRENT_MONTH}-15`

const cards = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="space-summary-card"]')

const cardFor = (page: import('@playwright/test').Page, spaceId: number) =>
  page.locator(`[data-testid="space-summary-card"][data-space-id="${spaceId}"]`)

/** Parse a money figure like "€1,234.56" / "-€12.00" → number. */
function parseMoney(text: string): number {
  const cleaned = text.replace(/[^0-9.-]/g, '')
  return Number(cleaned)
}

test.describe('Per-space summary cards', () => {
  test('one card per space in the ?space= scope', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const a = await api.createSpace('Summary Scope A')
    const b = await api.createSpace('Summary Scope B')
    const c = await api.createSpace('Summary Scope C')

    // Select only A and B via ?space=.
    await page.goto(`/dashboard?space=${a.id},${b.id}`)
    await page.waitForLoadState('networkidle')

    await expect(cardFor(page, a.id)).toBeVisible()
    await expect(cardFor(page, b.id)).toBeVisible()
    await expect(cardFor(page, c.id)).toHaveCount(0)
    await expect(cards(page)).toHaveCount(2)
  })

  test('card shows Income / Expense / Net as sums of real rows', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Summary Sums Space')

    // 100 income + 40 income; 30 expense + 25 expense → inflow 140, outflow 55, net 85.
    await api.createExpense({ space: space.id, description: 'inc-1', amount: 100, type: 'income', expense_date: MID_MONTH })
    await api.createExpense({ space: space.id, description: 'inc-2', amount: 40, type: 'income', expense_date: MID_MONTH })
    await api.createExpense({ space: space.id, description: 'exp-1', amount: 30, type: 'expense', expense_date: MID_MONTH })
    await api.createExpense({ space: space.id, description: 'exp-2', amount: 25, type: 'expense', expense_date: MID_MONTH })

    await page.goto(`/dashboard?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const card = cardFor(page, space.id)
    await expect(card).toBeVisible()

    const inflow = parseMoney(await card.locator('[data-testid="summary-figure-inflow"] .figure-value').innerText())
    const outflow = parseMoney(await card.locator('[data-testid="summary-figure-outflow"] .figure-value').innerText())
    const net = parseMoney(await card.locator('[data-testid="summary-figure-net"] .figure-value').innerText())

    expect(inflow).toBeCloseTo(140, 2)
    expect(outflow).toBeCloseTo(55, 2)
    expect(net).toBeCloseTo(85, 2)

    // Cross-check against the contract-B endpoint directly.
    const summary = await api.getSpacesSummary(`space=${space.id}&period=${CURRENT_MONTH}`)
    expect(Number(summary.spaces[0].inflow)).toBeCloseTo(140, 2)
    expect(Number(summary.spaces[0].outflow)).toBeCloseTo(55, 2)
    expect(Number(summary.spaces[0].net)).toBeCloseTo(85, 2)
  })

  test('card figure deep-links to the exact summing rows (no-fake-numbers gate)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('DeepLink Space')
    // outflow = 12 + 33 = 45
    await api.createExpense({ space: space.id, description: 'dl-exp-1', amount: 12, type: 'expense', expense_date: MID_MONTH })
    await api.createExpense({ space: space.id, description: 'dl-exp-2', amount: 33, type: 'expense', expense_date: MID_MONTH })
    // income = 7 (must NOT be in the expense deep-link total)
    await api.createExpense({ space: space.id, description: 'dl-inc-1', amount: 7, type: 'income', expense_date: MID_MONTH })

    await page.goto(`/dashboard?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const card = cardFor(page, space.id)
    const outflowFigure = parseMoney(
      await card.locator('[data-testid="summary-figure-outflow"] .figure-value').innerText(),
    )
    expect(outflowFigure).toBeCloseTo(45, 2)

    // Click the Expense figure → lands on /dashboard/transactions filtered to the
    // same period+type (deep-link carries ?date_from/?date_to&type=expense).
    await card.locator('[data-testid="summary-figure-outflow"]').click()
    await page.waitForURL(/\/dashboard\/transactions\?/)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/type=expense/)

    // The landed list's expense totals-strip figure == the card figure.
    const stripExpense = parseMoney(
      await page.locator('.summary-strip .stat-expense .stat-value').innerText(),
    )
    expect(stripExpense).toBeCloseTo(outflowFigure, 2)
    expect(stripExpense).toBeCloseTo(45, 2)
  })

  test('split transaction is attributed per-allocation across cards', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const a = await api.createSpace('Split Card A')
    const b = await api.createSpace('Split Card B')

    // 100 EUR expense split 70 → A, 30 → B.
    const expense = await api.createExpense({
      space: a.id,
      description: 'SPLIT-CARD-ROW',
      amount: 100,
      type: 'expense',
      expense_date: MID_MONTH,
    })
    await api.setExpenseAllocations(expense.id, [
      { space_id: a.id, amount: '70.00' },
      { space_id: b.id, amount: '30.00' },
    ])

    await page.goto(`/dashboard?space=${a.id},${b.id}`)
    await page.waitForLoadState('networkidle')

    const cardA = cardFor(page, a.id)
    const cardB = cardFor(page, b.id)
    const outA = parseMoney(await cardA.locator('[data-testid="summary-figure-outflow"] .figure-value').innerText())
    const outB = parseMoney(await cardB.locator('[data-testid="summary-figure-outflow"] .figure-value').innerText())
    expect(outA).toBeCloseTo(70, 2)
    expect(outB).toBeCloseTo(30, 2)

    // Each card's deep-link totals to its own share.
    await cardA.locator('[data-testid="summary-figure-outflow"]').click()
    await page.waitForURL(/\/dashboard\/transactions\?/)
    await page.waitForLoadState('networkidle')
    let strip = parseMoney(await page.locator('.summary-strip .stat-expense .stat-value').innerText())
    expect(strip).toBeCloseTo(70, 2)

    await page.goto(`/dashboard?space=${a.id},${b.id}`)
    await page.waitForLoadState('networkidle')
    await cardB.locator('[data-testid="summary-figure-outflow"]').click()
    await page.waitForURL(/\/dashboard\/transactions\?/)
    await page.waitForLoadState('networkidle')
    strip = parseMoney(await page.locator('.summary-strip .stat-expense .stat-value').innerText())
    expect(strip).toBeCloseTo(30, 2)
  })

  test('non-member space card is not shown (foreign ?space= silent-dropped)', async ({
    page,
    twoActors,
  }) => {
    const { apiA, apiB } = twoActors
    const a = await apiA.createSpace('Owner Card Space')
    const foreign = await apiB.createSpace('Foreign Card Space')

    // Switch the browser to user A.
    const cookiesA = await apiA.cookies()
    await page.context().clearCookies()
    await page.context().addCookies(cookiesA)

    // A asks for their own space AND user B's foreign space id.
    await page.goto(`/dashboard?space=${a.id},${foreign.id}`)
    await page.waitForLoadState('networkidle')

    await expect(cardFor(page, a.id)).toBeVisible()
    // The foreign id is silently dropped — no card for it.
    await expect(cardFor(page, foreign.id)).toHaveCount(0)
    await expect(cards(page)).toHaveCount(1)
  })

  test('in/out bar segments are proportional to the card inflow/outflow', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Bar Proportion Space')
    // inflow 90, outflow 30 → ratio 3:1.
    await api.createExpense({ space: space.id, description: 'bar-inc', amount: 90, type: 'income', expense_date: MID_MONTH })
    await api.createExpense({ space: space.id, description: 'bar-exp', amount: 30, type: 'expense', expense_date: MID_MONTH })

    await page.goto(`/dashboard?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const card = cardFor(page, space.id)
    const bar = card.locator('[data-testid="inout-bar"]')
    await expect(bar).toBeVisible()

    const inGrow = Number(
      (await card.locator('[data-testid="inout-bar-in"]').getAttribute('style'))
        ?.match(/flex-grow:\s*([0-9.]+)/)?.[1] ?? '0',
    )
    const outGrow = Number(
      (await card.locator('[data-testid="inout-bar-out"]').getAttribute('style'))
        ?.match(/flex-grow:\s*([0-9.]+)/)?.[1] ?? '0',
    )
    // flex-grow takes the raw sums (90 and 30) → 3:1 ratio.
    expect(inGrow).toBeCloseTo(90, 1)
    expect(outGrow).toBeCloseTo(30, 1)
    expect(inGrow / outGrow).toBeCloseTo(3, 1)

    // The rendered green segment is visibly wider than the red one.
    const inBox = await card.locator('[data-testid="inout-bar-in"]').boundingBox()
    const outBox = await card.locator('[data-testid="inout-bar-out"]').boundingBox()
    expect(inBox && outBox && inBox.width > outBox.width).toBeTruthy()
  })

  test('in/out bar segments deep-link to the same rows as the figures', async ({
    page,
    loggedInPage,
  }) => {
    // The bar re-renders the card's two real sums; the figures right under it
    // are the deep-links. Clicking the inflow figure lands a list summing to the
    // green segment's value (no new number — bar + figure share inflow/outflow).
    const { api } = loggedInPage
    const space = await api.createSpace('Bar DeepLink Space')
    await api.createExpense({ space: space.id, description: 'bdl-inc-1', amount: 80, type: 'income', expense_date: MID_MONTH })
    await api.createExpense({ space: space.id, description: 'bdl-exp-1', amount: 20, type: 'expense', expense_date: MID_MONTH })

    await page.goto(`/dashboard?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const card = cardFor(page, space.id)
    const inflow = parseMoney(await card.locator('[data-testid="summary-figure-inflow"] .figure-value').innerText())
    expect(inflow).toBeCloseTo(80, 2)
    // The bar's green segment encodes the same inflow value.
    const inGrow = Number(
      (await card.locator('[data-testid="inout-bar-in"]').getAttribute('style'))
        ?.match(/flex-grow:\s*([0-9.]+)/)?.[1] ?? '0',
    )
    expect(inGrow).toBeCloseTo(80, 1)

    await card.locator('[data-testid="summary-figure-inflow"]').click()
    await page.waitForURL(/\/dashboard\/transactions\?/)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/type=income/)
    const stripIncome = parseMoney(
      await page.locator('.summary-strip .stat-income .stat-value').innerText(),
    )
    expect(stripIncome).toBeCloseTo(80, 2)
  })

  test('in/out bar renders a neutral state when both sums are 0', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Empty Bar Space')
    // No transactions seeded → inflow 0, outflow 0.

    await page.goto(`/dashboard?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const card = cardFor(page, space.id)
    await expect(card).toBeVisible()
    const bar = card.locator('[data-testid="inout-bar"]')
    await expect(bar).toHaveClass(/is-empty/)
    await expect(card.locator('[data-testid="inout-bar-empty"]')).toBeVisible()
    await expect(card.locator('[data-testid="inout-bar-in"]')).toHaveCount(0)
    await expect(card.locator('[data-testid="inout-bar-out"]')).toHaveCount(0)
  })
})
