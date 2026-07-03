/**
 * Spaces — Archived excluded from ALL active read surfaces (Phase 12 Story 12.4)
 *
 * Archive must hide the space from every default active surface — selectors,
 * analytics, expenses list, per-space summary cards — while staying queryable
 * via `?archived=true` (Story 12.3) so the dedicated Archived view + restore
 * keep working. Restore reverses all of it.
 *
 * The analytics endpoints are stricter than the expenses + spaces/summary pair:
 * a comma list with ANY archived id returns 403 (cite the archived id) rather
 * than silently dropping it. Expenses + spaces/summary match the non-member-id
 * rule (silent drop). (The `GET /api/dashboard/totals/` endpoint was removed in
 * Phase 17 — the per-space numbers come from `GET /api/spaces/summary/`, now
 * rendered on the Spaces management page.)
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date()
const TODAY_ISO = TODAY.toISOString().split('T')[0]

// The analytics period is driven by the shared pill's date range
// (?preset=custom&date_from&date_to), not the old ?period=YYYY-MM param. These
// archived-exclusion tests don't actually depend on the period — they assert
// the archived space is excluded regardless — so we scope to the current month
// via an explicit custom range to keep the navigation deterministic.
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
const MONTH_FIRST = `${TODAY.getFullYear()}-${pad2(TODAY.getMonth() + 1)}-01`
const MONTH_LAST = `${TODAY.getFullYear()}-${pad2(TODAY.getMonth() + 1)}-${pad2(
  new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate(),
)}`
const CURRENT_MONTH_RANGE = `preset=custom&date_from=${MONTH_FIRST}&date_to=${MONTH_LAST}`

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'

test.describe('Archived exclusion (Phase 12 Story 12.4)', () => {
  test('analytics page does not render an archived space', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Analytics Archived H1')
    // Seed some analytics-worthy data so the page would have something to
    // show pre-archive. This makes the post-archive empty/error state a
    // meaningful contrast.
    await api.createExpense({
      space: h1.id,
      description: 'Pre-archive Spend',
      amount: 25.0,
      expense_date: TODAY_ISO,
    })

    // Archive H1.
    const archiveRes = await page.request.post(`${BACKEND_URL}/api/spaces/${h1.id}/archive/`, {
      headers: { 'X-CSRFToken': (await api.cookies()).find((c) => c.name === 'csrftoken')?.value ?? '' },
    })
    expect(archiveRes.ok()).toBeTruthy()

    // The analytics page must NOT crash. With H1 archived, the layout's
    // `parentData.spaces` is empty (H1 was the only space). The page renders
    // its 'no_space' / loadErrors path — section error placeholders OR the
    // resolveActiveSpaces redirect strips the archived id and falls back to
    // a no-param URL. Either way: no JS error, no rendered data for H1.
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await page.goto(`/dashboard/analytics?space=${h1.id}&${CURRENT_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    // Page heading still rendered — no crash. The analytics surface lives at
    // /dashboard/analytics, titled "Analytics".
    await expect(page.locator('.analytics-page h1')).toHaveText('Analytics')
    expect(jsErrors).toEqual([])

    // The archived id must NOT be a "live" filter. The user (archived-only)
    // is now in the empty-space branch: `parentData.spaces = []`,
    // `resolveActiveSpaces([])` short-circuits returning `[]`, and
    // `hasSpace=false` in the page so neither the section cards nor the
    // SpaceFilter render. The context line acknowledges this explicitly.
    //
    // Section-error placeholders only render when `hasSpace=true` AND a
    // section's `loadErrors[key]` is populated — this archived-only flow
    // doesn't reach that branch. What we care about is graceful degradation,
    // proven by: (1) no JS crash, (2) page title rendered, (3) the empty-space
    // context-line copy. Phase 17 reworded the merged-dashboard no-space copy
    // to "Set up a space to see your dashboard." (was "No space selected").
    const contextLine = page.getByTestId('analytics-context-line')
    await expect(contextLine).toBeVisible()
    const contextText = (await contextLine.textContent()) ?? ''
    expect(contextText.toLowerCase()).toContain('set up a space')

    // Belt-and-suspenders: NO KPI cards rendered (they only appear when
    // hasSpace=true) — guarantees there's no live "data" being shown for the
    // archived space.
    await expect(page.getByTestId('analytics-section-kpis')).toHaveCount(0)
  })

  test('restoring brings the space back to analytics', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Restore To Analytics')
    // Seed a second active space so the analytics page renders the
    // SpaceFilter modal trigger even while H1 is archived — without it the
    // page falls back to the "No space selected" empty state and there is
    // no filter to inspect.
    await api.createSpace('Bystander Active Space')
    await api.createExpense({
      space: h1.id,
      description: 'Restore Visible Expense',
      amount: 12.34,
      expense_date: TODAY_ISO,
    })

    const csrf = (await api.cookies()).find((c) => c.name === 'csrftoken')?.value ?? ''
    const archiveRes = await page.request.post(`${BACKEND_URL}/api/spaces/${h1.id}/archive/`, {
      headers: { 'X-CSRFToken': csrf },
    })
    expect(archiveRes.ok()).toBeTruthy()

    // After archive: the SpaceFilter modal must not show H1.
    await page.goto('/dashboard/analytics')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('space-filter-trigger').click()
    let modal = page.getByTestId('space-filter-modal')
    await expect(modal).toBeVisible()
    let optionLabels: string[] = await modal.locator('.space-option .option-label').allTextContents()
    expect(optionLabels).not.toContain('Restore To Analytics')
    // Close the modal.
    await page.getByTestId('space-filter-cancel').click()

    // Restore it.
    const restoreRes = await page.request.post(`${BACKEND_URL}/api/spaces/${h1.id}/restore/`, {
      headers: { 'X-CSRFToken': csrf },
    })
    expect(restoreRes.ok()).toBeTruthy()

    // After restore: H1 is in the SpaceFilter, and the dashboard renders its
    // sections without error placeholders.
    await page.goto(`/dashboard/analytics?space=${h1.id}&${CURRENT_MONTH_RANGE}`)
    await page.waitForLoadState('networkidle')

    await page.getByTestId('space-filter-trigger').click()
    modal = page.getByTestId('space-filter-modal')
    await expect(modal).toBeVisible()
    optionLabels = await modal.locator('.space-option .option-label').allTextContents()
    expect(optionLabels).toContain('Restore To Analytics')
  })

  test('archived space expenses drop out of the expenses list', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Archived Expenses H1')
    const h2 = await api.createSpace('Active Bystander H2')

    // Seed one expense in each space. After archiving H1, only H2's expense
    // should appear on the default (no `?space`) expenses list.
    await api.createExpense({
      space: h1.id,
      description: 'Drop From List',
      amount: 11.11,
      expense_date: TODAY_ISO,
    })
    await api.createExpense({
      space: h2.id,
      description: 'Stay In List',
      amount: 22.22,
      expense_date: TODAY_ISO,
    })

    const csrf = (await api.cookies()).find((c) => c.name === 'csrftoken')?.value ?? ''
    const archiveRes = await page.request.post(`${BACKEND_URL}/api/spaces/${h1.id}/archive/`, {
      headers: { 'X-CSRFToken': csrf },
    })
    expect(archiveRes.ok()).toBeTruthy()

    await page.goto('/dashboard/transactions')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr', { hasText: 'Stay In List' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Drop From List' })).not.toBeVisible()
  })

  test('archived space drops out of the Spaces summary cards', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Totals Archive H1')
    const h2 = await api.createSpace('Totals Active H2')

    // H1 → 100 income + 30 expense. H2 → 5 income + 1 expense. Phase 17 moved
    // the per-space summary numbers onto the Spaces management cards
    // (/dashboard/spaces); archiving H1 removes its card (the list endpoint
    // default-excludes archived).
    await api.createExpense({ space: h1.id, description: 'H1 Income', amount: 100, type: 'income', expense_date: TODAY_ISO })
    await api.createExpense({ space: h1.id, description: 'H1 Expense', amount: 30, expense_date: TODAY_ISO })
    await api.createExpense({ space: h2.id, description: 'H2 Income', amount: 5, type: 'income', expense_date: TODAY_ISO })
    await api.createExpense({ space: h2.id, description: 'H2 Expense', amount: 1, expense_date: TODAY_ISO })

    // The summary numbers live inside the management card (.space-card keyed by
    // data-space-id); the figure testids are unchanged.
    const h1Card = page.locator(`.space-card[data-space-id="${h1.id}"]`)
    const h2Card = page.locator(`.space-card[data-space-id="${h2.id}"]`)

    // Before archive: both spaces have a card (data dated today → this-month default).
    await page.goto('/dashboard/spaces')
    await page.waitForLoadState('networkidle')
    await expect(h1Card).toBeVisible()
    await expect(h2Card).toBeVisible()
    await expect(h1Card.locator('[data-testid="summary-figure-inflow"] .figure-value')).toContainText('100')
    await expect(h1Card.locator('[data-testid="summary-figure-outflow"] .figure-value')).toContainText('30')

    // Archive H1.
    const csrf = (await api.cookies()).find((c) => c.name === 'csrftoken')?.value ?? ''
    const archiveRes = await page.request.post(`${BACKEND_URL}/api/spaces/${h1.id}/archive/`, {
      headers: { 'X-CSRFToken': csrf },
    })
    expect(archiveRes.ok()).toBeTruthy()

    // After archive: H1's card is gone from the active grid; H2's remains.
    await page.goto('/dashboard/spaces')
    await page.waitForLoadState('networkidle')
    await expect(h1Card).toHaveCount(0)
    await expect(h2Card).toBeVisible()
    await expect(h2Card.locator('[data-testid="summary-figure-inflow"] .figure-value')).toContainText('5')

    // Restore re-includes H1's card.
    const restoreRes = await page.request.post(`${BACKEND_URL}/api/spaces/${h1.id}/restore/`, {
      headers: { 'X-CSRFToken': csrf },
    })
    expect(restoreRes.ok()).toBeTruthy()

    await page.goto('/dashboard/spaces')
    await page.waitForLoadState('networkidle')
    await expect(h1Card).toBeVisible()
    await expect(h1Card.locator('[data-testid="summary-figure-inflow"] .figure-value')).toContainText('100')
  })

  test('mixed ?space=active,archived returns only active data', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Mixed Active H1')
    const h2 = await api.createSpace('Mixed Will-Archive H2')

    await api.createExpense({
      space: h1.id,
      description: 'H1 Active Expense',
      amount: 9.99,
      expense_date: TODAY_ISO,
    })
    await api.createExpense({
      space: h2.id,
      description: 'H2 Archived Expense',
      amount: 19.99,
      expense_date: TODAY_ISO,
    })

    // Archive H2.
    const csrf = (await api.cookies()).find((c) => c.name === 'csrftoken')?.value ?? ''
    const archiveRes = await page.request.post(`${BACKEND_URL}/api/spaces/${h2.id}/archive/`, {
      headers: { 'X-CSRFToken': csrf },
    })
    expect(archiveRes.ok()).toBeTruthy()

    // Direct backend probe — the expenses list endpoint must silently drop
    // the archived id from the parsed comma list (matches the non-member-id
    // rule). Result: only H1's expense is returned, no 4xx.
    const expensesRes = await page.request.get(
      `${BACKEND_URL}/api/expenses/?space=${h1.id},${h2.id}`,
    )
    expect(expensesRes.ok()).toBeTruthy()
    const rows = (await expensesRes.json()) as Array<{ description: string }>
    const descriptions = rows.map((r) => r.description)
    expect(descriptions).toContain('H1 Active Expense')
    expect(descriptions).not.toContain('H2 Archived Expense')

    // Analytics is stricter — a mixed list with any archived id is 403
    // (with a body citing WHICH id was archived).
    const analyticsRes = await page.request.get(
      `${BACKEND_URL}/api/analytics/spending-by-category/?space=${h1.id},${h2.id}`,
    )
    expect(analyticsRes.status()).toBe(403)
    const errorBody = (await analyticsRes.json()) as { detail?: string }
    expect(errorBody.detail).toBeTruthy()
    expect(errorBody.detail).toContain(String(h2.id))
  })
})
