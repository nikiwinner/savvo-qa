/**
 * Phase 11 Story 11.5 — Spending-by-category donut chart.
 *
 * Backend endpoint `GET /api/analytics/spending-by-category/` is live from
 * Story 11.1. The donut component (CategoryDonut.svelte) renders the items,
 * client-side rebuckets any slice <3% into a synthetic "Other" entry, and
 * surfaces an empty placeholder when the period has no spend.
 *
 * What we validate:
 *   • Donut renders with seeded category data (canvas + legend present).
 *   • "Other" bucket appears when a category total is under 3%.
 *   • Legend `title` attribute carries category + amount + percentage —
 *     chart.js tooltip lives on a canvas overlay that Playwright cannot
 *     easily introspect; the legend title is a stable DOM mirror keyed by
 *     the same formatter, so asserting on it covers the formatting contract.
 *   • Empty period renders the no-data placeholder.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date()
const YEAR = TODAY.getFullYear()
const MONTH = TODAY.getMonth() + 1
const PERIOD = `${YEAR}-${String(MONTH).padStart(2, '0')}`
const TODAY_ISO = TODAY.toISOString().split('T')[0]

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed'
}

test.describe('Analytics spending donut (Story 11.5)', () => {
  test('donut renders with seeded category data', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Donut Home')

    // Seed three categories' worth of expenses, all >3% of total.
    const groceries = await api.createCategory('Groceries-D1', 'shopping-cart')
    const transport = await api.createCategory('Transport-D1', 'car')
    const dining = await api.createCategory('Dining-D1', 'utensils')

    await api.createExpense({
      household: hh.id,
      description: 'Weekly grocery run',
      amount: 200,
      category: groceries.id,
      expense_date: TODAY_ISO,
    })
    await api.createExpense({
      household: hh.id,
      description: 'Train pass',
      amount: 80,
      category: transport.id,
      expense_date: TODAY_ISO,
    })
    await api.createExpense({
      household: hh.id,
      description: 'Sushi dinner',
      amount: 50,
      category: dining.id,
      expense_date: TODAY_ISO,
    })

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${PERIOD}`)
    await page.waitForLoadState('networkidle')

    const donut = page.getByTestId('category-donut')
    await expect(donut).toBeVisible()
    // svelte-chartjs renders a <canvas> via its Chart wrapper.
    await expect(donut.locator('canvas')).toBeVisible()

    // Three legend entries (one per category).
    await expect(page.getByTestId(`donut-legend-${slug('Groceries-D1')}`)).toBeVisible()
    await expect(page.getByTestId(`donut-legend-${slug('Transport-D1')}`)).toBeVisible()
    await expect(page.getByTestId(`donut-legend-${slug('Dining-D1')}`)).toBeVisible()
  })

  test('Other bucket appears when category total under 3%', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Other Home')

    // 3 large categories + 2 tiny ones. Two tiny entries forces the rebucket
    // (single-tail passthrough rule: 1 tiny stays as-is).
    const big1 = await api.createCategory('Big-A', 'box')
    const big2 = await api.createCategory('Big-B', 'box')
    const big3 = await api.createCategory('Big-C', 'box')
    const tiny1 = await api.createCategory('Tiny-A', 'box')
    const tiny2 = await api.createCategory('Tiny-B', 'box')

    // Totals: 500 + 500 + 500 + 0.5 + 0.5 = 1501. Tiny share ≈ 0.033% each.
    await api.createExpense({ household: hh.id, description: 'big a', amount: 500, category: big1.id, expense_date: TODAY_ISO })
    await api.createExpense({ household: hh.id, description: 'big b', amount: 500, category: big2.id, expense_date: TODAY_ISO })
    await api.createExpense({ household: hh.id, description: 'big c', amount: 500, category: big3.id, expense_date: TODAY_ISO })
    await api.createExpense({ household: hh.id, description: 'tiny a', amount: 0.5, category: tiny1.id, expense_date: TODAY_ISO })
    await api.createExpense({ household: hh.id, description: 'tiny b', amount: 0.5, category: tiny2.id, expense_date: TODAY_ISO })

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${PERIOD}`)
    await page.waitForLoadState('networkidle')

    const donut = page.getByTestId('category-donut')
    await expect(donut).toBeVisible()

    // The synthetic "Other" bucket has a stable testid: donut-legend-other.
    await expect(page.getByTestId('donut-legend-other')).toBeVisible()
    // The two tiny categories must NOT appear as their own legend entries.
    await expect(page.getByTestId(`donut-legend-${slug('Tiny-A')}`)).toHaveCount(0)
    await expect(page.getByTestId(`donut-legend-${slug('Tiny-B')}`)).toHaveCount(0)
  })

  test('tooltip text shows category + amount + percentage', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Tooltip Home')

    // Single category — its share is 100.0% so we can assert exact text.
    const onlyCat = await api.createCategory('Solo-Tip', 'star')
    await api.createExpense({
      household: hh.id,
      description: 'solo',
      amount: 123.45,
      category: onlyCat.id,
      expense_date: TODAY_ISO,
    })

    await page.goto(`/dashboard/analytics?household=${hh.id}&period=${PERIOD}`)
    await page.waitForLoadState('networkidle')

    // chart.js renders the real tooltip on a canvas overlay (impossible to
    // inspect from DOM). We mirror the same formatting onto the legend item's
    // `title` attribute — assert there to cover the formatting contract.
    const legendItem = page.getByTestId(`donut-legend-${slug('Solo-Tip')}`)
    await expect(legendItem).toBeVisible()
    const title = await legendItem.getAttribute('title')
    expect(title).not.toBeNull()
    expect(title!).toContain('Solo-Tip')
    expect(title!).toContain('123.45')
    expect(title!).toContain('100.0%')
  })

  test('empty period renders no-data placeholder', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Empty Donut Home')

    // No expenses seeded. Use a month far in the past where nothing exists.
    await page.goto(`/dashboard/analytics?household=${hh.id}&period=2000-01`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('category-donut')).toBeVisible()
    await expect(page.getByTestId('category-donut-empty')).toBeVisible()
    await expect(page.getByTestId('category-donut-empty')).toContainText('No spending in this period')
  })
})
