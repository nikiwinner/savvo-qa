/**
 * "Spending breakdown" card — total + segmented proportion bar + ranked rows
 * (round-9 restructure; the SVG gauge donut died with it).
 *
 * The card body is one panel: a big exact total ("€105.87 total spent · June"),
 * a horizontal segbar whose segment N shares the color of ranked row N (the
 * shared `breakdown.ts` mapping), and rows of name / track bar / amount / pct.
 * We assert segment background-colors AGREE with the breakdown row dot colors
 * and are distinct — the palette hex values themselves live in $lib/theme.ts
 * and are deliberately NOT pinned here (a theme tweak must not break the
 * suite). The seg toggle drives `?donut_type` and flips the total caption
 * `total spent ↔ total received`. Income with no category renders the honest
 * single sprout segment (sprout IS pinned — it's the income semantic, not
 * decoration). The synthetic "Other" bucket wears a neutral non-palette gray.
 *
 * Backend endpoint `GET /api/analytics/spending-by-category/` is unchanged.
 * The panel still client-side rebuckets any slice <3% into a synthetic "Other"
 * entry (single-tail passthrough).
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date()
const YEAR = TODAY.getFullYear()
const MONTH = TODAY.getMonth() + 1
const TODAY_ISO = TODAY.toISOString().split('T')[0]

// The income-semantic sprout green (SPROUT in $lib/theme.ts). The ONE pinned
// color literal: "income = sprout" is a product semantic, not decoration.
// Category palette hues are asserted via seg↔row agreement, never by value.
const SPROUT_RGB = 'rgb(108, 212, 154)' // SPROUT #6CD49A

// The analytics period is driven by the shared pill's date range. Scope the
// breakdown to the current calendar month — the month the seeded rows live in.
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
const MONTH_FROM = `${YEAR}-${pad2(MONTH)}-01`
const MONTH_TO = `${YEAR}-${pad2(MONTH)}-${pad2(new Date(YEAR, MONTH, 0).getDate())}`
const THIS_MONTH_RANGE = `preset=custom&date_from=${MONTH_FROM}&date_to=${MONTH_TO}`

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed'
}

test.describe('Analytics spending breakdown (segbar + rows)', () => {
  test('segbar segments and ranked rows share one color mapping', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Segbar Home')

    // Seed three categories' worth of expenses, all >3% of total. Amounts pick
    // a deterministic descending sort: groceries (200) → transport (80) →
    // dining (50), so rows/segments rank 0/1/2 deterministically.
    const groceries = await api.findOrCreateCategory('Groceries-D1', 'shopping-cart')
    const transport = await api.findOrCreateCategory('Transport-D1', 'car')
    const dining = await api.findOrCreateCategory('Dining-D1', 'utensils')

    await api.createExpense({
      space: hh.id,
      description: 'Weekly grocery run',
      amount: 200,
      category: groceries.id,
      expense_date: TODAY_ISO,
    })
    await api.createExpense({
      space: hh.id,
      description: 'Train pass',
      amount: 80,
      category: transport.id,
      expense_date: TODAY_ISO,
    })
    await api.createExpense({
      space: hh.id,
      description: 'Sushi dinner',
      amount: 50,
      category: dining.id,
      expense_date: TODAY_ISO,
    })

    await page.goto(`/dashboard/analytics?space=${hh.id}&${THIS_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    const panel = page.getByTestId('breakdown-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('breakdown-segbar')).toBeVisible()

    // The exact total of the three seeded expenses (200 + 80 + 50).
    await expect(page.getByTestId('breakdown-total')).toContainText('330.00')

    // Three ranked rows (one per category) inside the same breakdown card.
    const rowG = page.getByTestId(`breakdown-row-${slug('Groceries-D1')}`)
    const rowT = page.getByTestId(`breakdown-row-${slug('Transport-D1')}`)
    const rowD = page.getByTestId(`breakdown-row-${slug('Dining-D1')}`)
    await expect(rowG).toBeVisible()
    await expect(rowT).toBeVisible()
    await expect(rowD).toBeVisible()

    // The segbar renders three segments, in the same order as the rows.
    const segs = panel.locator('[data-testid="segbar-seg"]')
    await expect(segs).toHaveCount(3)

    // Segment N background == row N dot color (the shared mapping) and the
    // three hues are pairwise distinct. No palette literals — the hex order
    // lives in $lib/theme.ts; seg↔row agreement is the contract under test.
    const rowsInOrder = [rowG, rowT, rowD]
    const segColors: string[] = []
    for (let i = 0; i < 3; i++) {
      const segColor = await segs.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor)
      await expect(rowsInOrder[i].locator('.dot')).toHaveCSS('background-color', segColor)
      segColors.push(segColor)
    }
    expect(new Set(segColors).size).toBe(3)
  })

  test('ranked row carries name + amount + percentage', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Row Format Home')

    // Single category — its share is 100.0% so we can assert exact text.
    const onlyCat = await api.findOrCreateCategory('Solo-Tip', 'star')
    await api.createExpense({
      space: hh.id,
      description: 'solo',
      amount: 123.45,
      category: onlyCat.id,
      expense_date: TODAY_ISO,
    })

    await page.goto(`/dashboard/analytics?space=${hh.id}&${THIS_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    // Full row text formatting: currency symbol + exact two-decimal amount
    // (fixture user currency is EUR) and the one-decimal percentage.
    const row = page.getByTestId(`breakdown-row-${slug('Solo-Tip')}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText('Solo-Tip')
    await expect(row).toContainText('€123.45')
    await expect(row).toContainText('100.0%')
  })

  test('Other bucket appears (neutral gray) when category totals fall under 3%', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Other Home')

    // 3 large categories + 2 tiny ones. Two tiny entries forces the rebucket
    // into a synthetic "Other" segment (single-tail passthrough keeps 1 tiny).
    const big1 = await api.findOrCreateCategory('Big-A', 'box')
    const big2 = await api.findOrCreateCategory('Big-B', 'box')
    const big3 = await api.findOrCreateCategory('Big-C', 'box')
    const tiny1 = await api.findOrCreateCategory('Tiny-A', 'box')
    const tiny2 = await api.findOrCreateCategory('Tiny-B', 'box')

    // Totals: 500 + 500 + 500 + 0.5 + 0.5 = 1501. Tiny share ≈ 0.033% each.
    await api.createExpense({ space: hh.id, description: 'big a', amount: 500, category: big1.id, expense_date: TODAY_ISO })
    await api.createExpense({ space: hh.id, description: 'big b', amount: 500, category: big2.id, expense_date: TODAY_ISO })
    await api.createExpense({ space: hh.id, description: 'big c', amount: 500, category: big3.id, expense_date: TODAY_ISO })
    await api.createExpense({ space: hh.id, description: 'tiny a', amount: 0.5, category: tiny1.id, expense_date: TODAY_ISO })
    await api.createExpense({ space: hh.id, description: 'tiny b', amount: 0.5, category: tiny2.id, expense_date: TODAY_ISO })

    await page.goto(`/dashboard/analytics?space=${hh.id}&${THIS_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    const panel = page.getByTestId('breakdown-panel')
    await expect(panel).toBeVisible()

    // Two tiny rows fold into one synthetic "Other" row whose neutral gray dot
    // is the DOM mirror of the gray "Other" segment. The gray itself is read
    // from the dot (not pinned): the contract is Other ≠ any palette hue AND
    // Other row dot == last segment.
    const otherRow = page.getByTestId('breakdown-row-other')
    await expect(otherRow).toBeVisible()
    const otherGray = await otherRow
      .locator('.dot')
      .evaluate((el) => getComputedStyle(el).backgroundColor)

    const bigA = page.getByTestId(`breakdown-row-${slug('Big-A')}`)
    await expect(bigA.locator('.dot')).not.toHaveCSS('background-color', otherGray)

    // The segbar has 4 segments (3 big + 1 Other); the LAST one wears the
    // same gray as the Other row's dot.
    const segs = panel.locator('[data-testid="segbar-seg"]')
    await expect(segs).toHaveCount(4)
    await expect(segs.last()).toHaveCSS('background-color', otherGray)
  })

  test('seg toggle drives ?donut_type and flips the total caption', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Toggle Home')

    const groceries = await api.findOrCreateCategory('Groceries-TG', 'shopping-cart')
    await api.createExpense({
      space: hh.id,
      description: 'groceries',
      amount: 90,
      category: groceries.id,
      expense_date: TODAY_ISO,
    })
    await api.createExpense({
      space: hh.id,
      description: 'salary',
      amount: 1000,
      type: 'income',
      expense_date: TODAY_ISO,
    })

    await page.goto(`/dashboard/analytics?space=${hh.id}&${THIS_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    const total = page.getByTestId('breakdown-total')
    await expect(total).toBeVisible()
    // Expense view: the total caption reads "total spent".
    await expect(total).toContainText('total spent')
    await expect(total).toContainText('90.00')
    await expect(page.getByTestId('breakdown-type-expense')).toHaveAttribute('aria-selected', 'true')

    // Flip to Income → URL gains ?donut_type=income and the page reloads.
    await page.getByTestId('breakdown-type-income').click()
    await page.waitForURL(/donut_type=income/)
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('donut_type=income')
    await expect(page.getByTestId('breakdown-type-income')).toHaveAttribute('aria-selected', 'true')
    // Caption switched to "total received" with the income total. NOTE: the
    // total is compact-formatted — ≥1000 drops the decimals ("1,000").
    await expect(page.getByTestId('breakdown-total')).toContainText('total received')
    await expect(page.getByTestId('breakdown-total')).toContainText('1,000')

    // Flip back to Expenses → ?donut_type drops out of the URL. Wait on the
    // URL itself, not networkidle — the client-side goto starts async and
    // networkidle can resolve before the navigation begins (race).
    await page.getByTestId('breakdown-type-expense').click()
    await page.waitForURL((u) => !u.searchParams.has('donut_type'))
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toContain('donut_type=income')
    await expect(page.getByTestId('breakdown-total')).toContainText('total spent')
  })

  test('income with no category renders the honest single sprout segment', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Income Single Home')

    // Income rows carry no category → the income breakdown is one Uncategorized
    // bucket drawn as a single dimmed sprout segment.
    await api.createExpense({
      space: hh.id,
      description: 'pay 1',
      amount: 1500,
      type: 'income',
      expense_date: TODAY_ISO,
    })
    await api.createExpense({
      space: hh.id,
      description: 'pay 2',
      amount: 300,
      type: 'income',
      expense_date: TODAY_ISO,
    })

    await page.goto(`/dashboard/analytics?space=${hh.id}&${THIS_MONTH_RANGE}&donut_type=income`)
    await page.waitForLoadState('networkidle')

    const panel = page.getByTestId('breakdown-panel')
    await expect(panel).toBeVisible()
    // Compact total: ≥1000 drops the decimals ("1,800", never "1,800.00").
    await expect(page.getByTestId('breakdown-total')).toContainText('total received')
    await expect(page.getByTestId('breakdown-total')).toContainText('1,800')

    // Exactly one segment, painted sprout green (the income semantic).
    const segs = panel.locator('[data-testid="segbar-seg"]')
    await expect(segs).toHaveCount(1)
    await expect(segs.first()).toHaveCSS('background-color', SPROUT_RGB)

    // The single honest row shows the sprout dot + the honest note.
    const row = page.getByTestId('breakdown-row-uncategorized')
    await expect(row).toBeVisible()
    await expect(row.locator('.dot')).toHaveCSS('background-color', SPROUT_RGB)
    await expect(page.getByTestId('breakdown-rows')).toContainText('one slice is the honest picture')
  })

  test('empty period renders no-data placeholder', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Empty Breakdown Home')

    // No expenses seeded. Use a date range far in the past where nothing exists.
    await page.goto(
      `/dashboard/analytics?space=${hh.id}&preset=custom&date_from=2000-01-01&date_to=2000-01-31`,
    )
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('breakdown-panel')).toBeVisible()
    await expect(page.getByTestId('breakdown-empty')).toBeVisible()
    await expect(page.getByTestId('breakdown-empty')).toContainText('No spending in this period')
  })
})
