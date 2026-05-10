/**
 * Landing — Structural smoke tests (Phase 09)
 *
 * The phase doc explicitly waived deep visual E2E for the landing page
 * stories (9.5–9.9) because animation timing is fragile across viewports.
 * These three structural tests are the agreed backstop:
 *
 *   1. FAQ section exists and the nav anchor jumps to it.
 *   2. The "Try Now Free" CTA is present in multiple body locations
 *      (hero + mid CTA + final CTA + nav).
 *   3. The FAQ accordion has single-open semantics (covers Story 9.9).
 *
 * The pill-nav links are hidden on viewports <960px (see +page.svelte
 * media query), so on mobile-safari and tablet projects we reach #faq
 * by navigating directly to /#faq instead of clicking the nav link.
 */
import { test, expect } from '@playwright/test'

test.describe('Landing — structure', () => {
  test('landing renders the FAQ section anchored from the nav', async ({ page, viewport }) => {
    await page.goto('/')

    // The FAQ section markup must exist regardless of viewport.
    const faqSection = page.locator('section#faq')
    await expect(faqSection).toBeVisible()

    // The pill-nav FAQ link is hidden under 960px (CSS: .pill-nav-links { display: none }).
    // Fall back to direct hash navigation on smaller viewports.
    const isWide = (viewport?.width ?? 0) >= 960
    if (isWide) {
      const faqNavLink = page.locator('.pill-nav-links a[href="#faq"]')
      await expect(faqNavLink).toBeVisible()
      await faqNavLink.click()
    } else {
      await page.goto('/#faq')
    }

    await expect(page).toHaveURL(/#faq$/)

    // Section is in viewport after the anchor jump.
    await expect(faqSection).toBeInViewport()

    // First FAQ question copy from en.ts must be visible.
    await expect(
      page.getByText('Can my partner see my personal accounts?', { exact: true })
    ).toBeVisible()
  })

  test('Try Now Free CTA is present in both hero and the body', async ({ page }) => {
    await page.goto('/')

    // The CTA copy "Try Now Free" appears in four primary surfaces:
    //   1. nav pill (top-right .pill-nav-ctas .pill-btn-solid)
    //   2. hero big-cta (.hero .big-cta)
    //   3. mid CTA (.mid-cta .big-cta)
    //   4. final CTA (.final-cta .big-cta)
    // (A 5th occurrence lives in StickyCtaDock but is aria-hidden until the
    // reader scrolls past 90vh — covered by Story 9.5, not asserted here.)
    //
    // We assert each by location-specific selector rather than counting all
    // role=link matches, because the dock toggles in/out of the a11y tree
    // depending on initial scroll position and viewport.
    const navCta = page.locator('.pill-nav-ctas .pill-btn-solid', { hasText: 'Try Now Free' })
    const heroCta = page.locator('.hero .big-cta', { hasText: 'Try Now Free' })
    const midCta = page.locator('.mid-cta .big-cta', { hasText: 'Try Now Free' })
    const finalCta = page.locator('.final-cta .big-cta', { hasText: 'Try Now Free' })

    for (const cta of [navCta, heroCta, midCta, finalCta]) {
      await expect(cta).toHaveCount(1)
      await expect(cta).toHaveAttribute('href', '/signup')
    }

    // Hero CTA is rendered (displayed, not display:none / opacity:0).
    // We don't assert toBeInViewport because on mobile the orb illustration
    // is reordered above the hero text (order: -1 in the <960px media
    // query), pushing the hero CTA below the fold on iPhone 13.
    await expect(heroCta).toBeVisible()
  })

  test('clicking a FAQ item expands its answer; clicking another collapses the first', async ({
    page,
  }) => {
    await page.goto('/#faq')
    // Wait for SvelteKit hydration so on:click handlers are bound. Without
    // this, the first click fires on the SSR button before the client-side
    // `toggle(i)` listener attaches and the accordion never opens.
    await page.waitForLoadState('networkidle')

    const faqSection = page.locator('section#faq')
    await expect(faqSection).toBeInViewport()

    // FaqAccordion uses idPrefix="faq" by default, so concrete ids are
    // faq-header-{i} (the button) and faq-region-{i} (the body div, only
    // rendered while openIndex === i).
    const q1 = page.locator('#faq-header-0')
    const q2 = page.locator('#faq-header-1')

    // Both questions visible, both collapsed.
    await expect(q1).toBeVisible()
    await expect(q2).toBeVisible()
    await expect(q1).toHaveAttribute('aria-expanded', 'false')
    await expect(q2).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#faq-region-0')).toHaveCount(0)
    await expect(page.locator('#faq-region-1')).toHaveCount(0)

    // Open Q1 → its body region appears, aria-expanded flips.
    await q1.click()
    await expect(q1).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#faq-region-0')).toBeVisible()

    // Open Q2 → Q1 closes (single-open semantics), Q2 opens.
    await q2.click()
    await expect(q2).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#faq-region-1')).toBeVisible()
    await expect(q1).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#faq-region-0')).toHaveCount(0)
  })
})
