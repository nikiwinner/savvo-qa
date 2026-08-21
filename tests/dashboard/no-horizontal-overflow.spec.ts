/**
 * The page is never wider than the screen — anywhere, on any device.
 *
 * Requested 2026-08-21, verbatim: "There is unintended horizontal overflow
 * across the app on mobile: the entire page can be dragged left and right. […]
 * The page itself must never be wider than the viewport. […] Only specific
 * components such as wide data tables may scroll horizontally inside their own
 * container. The entire page must never scroll sideways."
 *
 * The bug that started it: one Space named with an UNBROKEN token (an IBAN
 * pasted as a name) made the grid track's min-content 607px, which dragged the
 * page +247px sideways on an iPhone SE. A bare `1fr` is `minmax(auto, 1fr)`,
 * and `auto` floors a track at its widest min-content — so the fix is
 * `minmax(0, 1fr)` plus a heading that can actually shrink.
 *
 * Two assertions per page, and the second is the one that matters:
 *   1. the document is not wider than the viewport;
 *   2. NOTHING is held in only by the app's `overflow-x: clip` safety net.
 *      Every element that does stick out must be clipped or scrolled by its
 *      OWN container — a wide table inside its scrolling card, the map's
 *      decorative clouds inside their masked layer. Otherwise the net would be
 *      hiding a real defect, which the same brief explicitly forbids: "do not
 *      merely hide the problem if content is still being clipped."
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/index'
import type { ApiHelper } from '../../helpers/api'

// Never a hardcoded DEV port — one once ran the whole suite against the dev
// database and polluted it (CLAUDE.md #26). The fallback is the QA backend
// :8001 that `playwright.config.ts` starts, exactly like every other spec and
// `helpers/api.ts`; :8000 is the dev stack and must never be reachable here.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'

/** The devices named in the brief, plus 320px as the floor. */
const DEVICES = [
  ['320', 320, 568],
  ['iPhone SE', 375, 667],
  ['iPhone SE landscape', 667, 375],
  ['iPhone 14 Pro Max', 430, 932],
  ['iPhone 14 Pro Max landscape', 932, 430],
  ['iPhone 16 Pro Max', 440, 956],
  ['iPad mini', 744, 1133],
  ['iPad mini landscape', 1133, 744],
  ['iPad Pro 11', 834, 1194],
  ['iPad Pro 13', 1024, 1366],
  ['iPad Pro 13 landscape', 1366, 1024],
] as const

/** One per layout family: grid of cards, two-column, wide table, art, list.
    `spaces/archived` is a SECOND card grid — it carried the identical bare-`1fr`
    defect and was missed by the first sweep, so it earns its own row here. */
const ROUTES = [
  '/dashboard/spaces',
  '/dashboard/spaces/archived',
  '/dashboard/analytics',
  '/dashboard/transactions',
  '/dashboard/learn',
  '/dashboard/settings',
]

/**
 * The token that started this: an IBAN pasted as a name. No spaces, no hyphens,
 * nothing a browser may break on — so it IS the min-content of whatever holds
 * it, and any `auto`-floored track inherits that width.
 */
const UNBREAKABLE = 'PT50000201231234567890154BENEFICIARIOPRINCIPAL'

/**
 * Fill the account before measuring.
 *
 * This is the whole reason the sweep is worth running. `loggedInPage` signs up a
 * FRESH user, so without this every route renders its empty state: no rows, no
 * cards, no names — and every element is trivially narrow. The first manual
 * sweep of this app found nothing for exactly that reason, and the bug it missed
 * shipped. A guard that only sees empty states guards nothing.
 */
async function seedWideContent(
  api: ApiHelper,
  request: APIRequestContext,
): Promise<void> {
  const csrf = (await api.cookies()).find((c) => c.name === 'csrftoken')?.value ?? ''

  const live = await api.createSpace(UNBREAKABLE)

  // Deliberately NO category is seeded here. `Category.name` is globally UNIQUE
  // and categories are shared across every user, so a long-token category from
  // this spec would land in other specs' lists and in their counts. The
  // unbreakable stress this sweep needs is carried by per-user rows instead:
  // the Space name and the expense descriptions.
  const today = new Date(Date.UTC(2026, 0, 15)).toISOString().slice(0, 10)
  for (let i = 0; i < 6; i++) {
    await api.createExpense({
      space: live.id,
      description: i % 2 === 0 ? `${UNBREAKABLE}-${i}` : `Ordinary purchase ${i}`,
      amount: 10 + i * 37.5,
      expense_date: today,
    })
  }

  // The archived view needs its own row, and the same unbreakable name.
  const archived = await api.createSpace(`${UNBREAKABLE}ARCHIVED`)
  const res = await request.post(`${BACKEND_URL}/api/spaces/${archived.id}/archive/`, {
    headers: { 'X-CSRFToken': csrf },
  })
  if (!res.ok()) throw new Error(`archive failed (${res.status()}): ${await res.text()}`)
}

/**
 * Returns the elements that stick out past the right edge AND whose nearest
 * clipping ancestor is the document itself — i.e. the ones the global net is
 * covering for. A component that scrolls or masks its own overflow is fine and
 * is not reported.
 */
const AUDIT = () => {
  const de = document.documentElement
  const vw = de.clientWidth
  const masked: { s: string; over: number }[] = []
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue
    if (getComputedStyle(el).position === 'fixed') continue
    if (r.right <= vw + 1) continue
    let n: Element | null = el.parentElement
    let guard: Element | null = null
    while (n) {
      if (getComputedStyle(n).overflowX !== 'visible') {
        guard = n
        break
      }
      n = n.parentElement
    }
    if (!guard || guard === document.body || guard === de) {
      const bits: string[] = []
      let m: Element | null = el
      for (let d = 0; m && d < 4; d++) {
        const cls =
          typeof m.className === 'string'
            ? m.className
                .trim()
                .split(/\s+/)
                .filter((c) => c && !/^s-[\w-]+$/.test(c))
                .slice(0, 3)
            : []
        bits.unshift(m.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : ''))
        m = m.parentElement
      }
      masked.push({ s: bits.join(' > '), over: Math.round(r.right - vw) })
    }
  }
  return { over: de.scrollWidth - vw, masked: masked.slice(0, 4) }
}

test.describe('No horizontal overflow', () => {
  test('no page can be dragged sideways on any named device', async ({
    page,
    loggedInPage,
  }, testInfo) => {
    // Two engines is the point; the `tablet` project would only repeat
    // WebKit at viewports this test sets for itself anyway.
    testInfo.skip(testInfo.project.name === 'tablet', 'Duplicate engine for a self-sized sweep.')
    test.setTimeout(300_000)
    await seedWideContent(loggedInPage.api, page.request)

    const failures: string[] = []
    for (const [device, w, h] of DEVICES) {
      await page.setViewportSize({ width: w, height: h })
      for (const route of ROUTES) {
        await page.goto(route)
        await page.waitForLoadState('networkidle')
        const r = await page.evaluate(AUDIT)
        if (r.over > 1) failures.push(`${device} ${w}px ${route}: page is ${r.over}px too wide`)
        for (const m of r.masked) {
          failures.push(`${device} ${w}px ${route}: +${m.over}px held in only by the net — ${m.s}`)
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  test('a Space named with an unbreakable token does not widen the page', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    // The exact shape of the original report: no spaces to break on.
    await api.createSpace(UNBREAKABLE)

    for (const [device, w, h] of [
      ['iPhone SE', 375, 667],
      ['iPhone 16 Pro Max', 440, 956],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/dashboard/spaces')
      await page.waitForLoadState('networkidle')
      // Both assertions, not just the first. The page not being draggable is
      // only half the claim — the card must also not be sticking out under the
      // net, which is the state this whole file exists to forbid.
      const r = await page.evaluate(AUDIT)
      expect(r.over, `${device}: page ${r.over}px too wide`).toBeLessThanOrEqual(1)
      expect(
        r.masked,
        `${device}: held in only by the net — ${r.masked.map((m) => m.s).join(', ')}`,
      ).toEqual([])
    }
  })

  test('the safety net is clip, not hidden — sticky must keep working', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard/settings/categories')
    await page.waitForLoadState('networkidle')

    // `overflow-x: hidden` on body would make it a scroll container and break
    // every `position: sticky` in the app, the settings rail included.
    const overflow = await page.evaluate(() => {
      const cs = getComputedStyle(document.body)
      return { x: cs.overflowX, y: cs.overflowY }
    })
    expect(overflow.x).toBe('clip')
    expect(overflow.y).toBe('visible')
    expect(await page.locator('.settings-rail').evaluate((el) => getComputedStyle(el).position)).toBe(
      'sticky',
    )
  })

  test('the bottom tab bar fills the screen exactly, with equal cells', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage
    for (const [device, w, h] of [
      ['320', 320, 568],
      ['iPhone SE', 375, 667],
      ['iPhone 16 Pro Max', 440, 956],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('/dashboard/transactions')
      await page.waitForLoadState('networkidle')

      const bar = await page.evaluate(() => {
        const nav = document.querySelector('.nav-menu')!
        const r = nav.getBoundingClientRect()
        const cells = Array.from(nav.querySelectorAll('.nav-link')).map((e) =>
          Math.round(e.getBoundingClientRect().width),
        )
        const cs = getComputedStyle(nav)
        return {
          position: cs.position,
          left: Math.round(r.left),
          right: Math.round(r.right),
          vw: document.documentElement.clientWidth,
          distinctCellWidths: Array.from(new Set(cells)).length,
          padding: [cs.paddingLeft, cs.paddingRight],
        }
      })
      expect(bar.position, `${device}: tab bar is not the fixed bar`).toBe('fixed')
      expect(bar.left, `${device}: tab bar left`).toBe(0)
      expect(bar.right, `${device}: tab bar right`).toBe(bar.vw)
      expect(bar.distinctCellWidths, `${device}: cells are not equal`).toBe(1)
      expect(bar.padding[0], `${device}: asymmetric padding`).toBe(bar.padding[1])
    }
  })
})
