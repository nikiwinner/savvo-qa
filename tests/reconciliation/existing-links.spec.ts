/**
 * Reconciliation — Existing Links Section (Phase 08, Story 8.6)
 *
 * Verifies the third section ("Existing links") on /dashboard/reconciliation:
 *  - Lists every reconciliation link in the household (one card per link).
 *  - Unlink button removes a card; reload confirms the link is gone.
 *  - Empty-state copy renders verbatim when no links exist.
 *  - Paginates independently of the suggestions section via ?links_page=.
 */
import { test, expect } from '../../fixtures/index'

// Scope all assertions to the third section so they don't accidentally match
// rows in the Suggestions section above (which also uses .suggestion-sides).
const SECTION_SELECTOR = 'section[aria-labelledby="existing-links-heading"]'

/**
 * Seed N (expense, bank-transaction) pairs and link them via the API.
 * Each pair uses a distinct amount + date + description so they never collide
 * with each other or with the auto-suggester (we link them ourselves anyway).
 */
async function seedLinkedPairs(
  api: import('../../helpers/api').ApiHelper,
  hhId: number,
  catId: number,
  count: number,
  prefix: string,
): Promise<number[]> {
  const linkIds: number[] = []
  for (let i = 0; i < count; i++) {
    // Spread amounts so each pair is unambiguous; spread dates over 2026
    // (90-day suggestion window doesn't matter — we link directly via API).
    const amountValue = 100 + i
    const amountStr = `${amountValue}.00`
    const day = ((i % 28) + 1).toString().padStart(2, '0')
    const month = (((Math.floor(i / 28)) % 12) + 1).toString().padStart(2, '0')
    const date = `2026-${month}-${day}`

    const expense = await api.createExpense({
      household: hhId,
      description: `${prefix} expense ${i}`,
      amount: amountValue,
      category: catId,
      type: 'expense',
      expense_date: date,
    })
    const bankTxn = await api.createBankTransaction({
      description: `${prefix} BANK ${i}`,
      merchant_display_name: `${prefix} BANK ${i}`,
      amount: amountStr,
      type: 'expense',
      transaction_date: date,
      household_id: hhId,
      category_id: catId,
      currency: 'EUR',
    })
    const link = await api.createReconciliationLink(expense.id, bankTxn.id)
    linkIds.push(link.id)
  }
  return linkIds
}

test.describe('Existing links section', () => {
  test('existing links section lists every link in the household', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Existing Links List')
    const categories = await api.listCategories()
    const cat = categories[0]

    await seedLinkedPairs(api, hh.id, cat.id, 3, 'LIST')

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator(SECTION_SELECTOR)
    await expect(section).toBeVisible({ timeout: 5000 })

    // Heading + caption
    await expect(section.locator('h2#existing-links-heading')).toHaveText('Existing links')

    // Exactly 3 cards
    const cards = section.locator('.link-card')
    await expect(cards).toHaveCount(3, { timeout: 5000 })

    // Empty-state copy must NOT be rendered when links exist
    await expect(section.locator('.links-empty')).toHaveCount(0)

    // Each card carries an Unlink button
    const unlinkButtons = section.locator('button', { hasText: 'Unlink' })
    await expect(unlinkButtons).toHaveCount(3)

    // Each card mentions the seeded pair description on both sides
    for (let i = 0; i < 3; i++) {
      await expect(section).toContainText(`LIST expense ${i}`)
      await expect(section).toContainText(`LIST BANK ${i}`)
    }
  })

  test('unlink from existing-links section removes the link', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Existing Links Unlink')
    const categories = await api.listCategories()
    const cat = categories[0]

    await seedLinkedPairs(api, hh.id, cat.id, 3, 'UNLINK')

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator(SECTION_SELECTOR)
    const cards = section.locator('.link-card')
    await expect(cards).toHaveCount(3, { timeout: 5000 })

    // Pick the card containing "UNLINK expense 1" and click its Unlink button
    const targetCard = section.locator('.link-card', { hasText: 'UNLINK expense 1' })
    await expect(targetCard).toHaveCount(1)
    await targetCard.locator('button', { hasText: 'Unlink' }).click()

    // Card disappears optimistically (then invalidateAll refetches)
    await expect(targetCard).toHaveCount(0, { timeout: 5000 })
    await expect(cards).toHaveCount(2, { timeout: 5000 })

    // Reload — server-truth confirms the link is actually gone
    await page.reload()
    await page.waitForLoadState('networkidle')

    const sectionAfter = page.locator(SECTION_SELECTOR)
    await expect(sectionAfter.locator('.link-card')).toHaveCount(2, { timeout: 5000 })
    await expect(sectionAfter).not.toContainText('UNLINK expense 1')

    // Belt-and-braces: API agrees
    const links = await api.listReconciliationLinks(hh.id)
    expect(links.count).toBe(2)
  })

  test('empty state renders when no links exist', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Existing Links Empty')

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator(SECTION_SELECTOR)
    await expect(section).toBeVisible({ timeout: 5000 })

    // No cards
    await expect(section.locator('.link-card')).toHaveCount(0)

    // Exact empty-state copy (em-dash, not hyphen)
    const empty = section.locator('.links-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toHaveText('No links yet — confirm a suggestion to create one.')
  })

  test('pagination works on >25 links', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Existing Links Pagination')
    const categories = await api.listCategories()
    const cat = categories[0]

    // 27 pairs → page_size=25 → page 1 has 25, page 2 has 2
    await seedLinkedPairs(api, hh.id, cat.id, 27, 'PAGE')

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator(SECTION_SELECTOR)
    const cards = section.locator('.link-card')
    await expect(cards).toHaveCount(25, { timeout: 10000 })

    // Page indicator on the section reads "Page 1"
    const pageInfo = section.locator('.page-info')
    await expect(pageInfo).toHaveText('Page 1')

    // Click Next inside the section. Critical: must use the section-scoped Next,
    // not the suggestions-section Next (which uses ?page=, not ?links_page=).
    const nextLink = section.locator('a.btn-page', { hasText: 'Next' })
    await expect(nextLink).toBeVisible()
    const nextHref = await nextLink.getAttribute('href')
    expect(nextHref).toContain('links_page=2')
    // The suggestions ?page= must NOT be set (no suggestions exist for this hh
    // — pre-linked pairs don't generate suggestions). If `page=` appears at all
    // it must remain at its default of 1.
    if (nextHref?.includes('page=')) {
      // Allow links_page=2 obviously; just make sure no suggestions page=2 leak.
      expect(nextHref).not.toMatch(/(?<!links_)page=2/)
    }

    await nextLink.click()
    // Wait for SvelteKit nav to complete — section pagination updates
    const sectionAfter = page.locator(SECTION_SELECTOR)
    await expect(sectionAfter.locator('.page-info')).toHaveText('Page 2', { timeout: 10000 })
    await expect(sectionAfter.locator('.link-card')).toHaveCount(2, { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    // URL now contains links_page=2
    await expect
      .poll(() => new URL(page.url()).searchParams.get('links_page'), { timeout: 5000 })
      .toBe('2')
    // Suggestions pagination untouched (either absent or "1")
    const suggestionsPage = new URL(page.url()).searchParams.get('page')
    if (suggestionsPage !== null) {
      expect(suggestionsPage).toBe('1')
    }
  })
})
