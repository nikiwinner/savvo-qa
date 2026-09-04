import type { Page } from '@playwright/test'

/**
 * The dashboard rail carries two worlds and shows one at a time, and every row
 * stays in the DOM in every state — the desktop filter hides the other world in
 * CSS so the phone tab bar can keep all five tabs. Counting `a` elements
 * therefore proves nothing about either surface; these two helpers read what is
 * actually on screen.
 */

/**
 * The rendered label of every nav row that has a layout box, in DOM order.
 *
 * This is a LAYOUT-BOX test, not a visibility test: a row hidden with
 * `opacity: 0` or `visibility: hidden` would still be counted. That is
 * deliberate — the rail's rows animate in with `opacity: 0` under a staggered
 * delay, and a strict visibility check would race that animation. Rows hidden
 * with `display: none` (which is how the world filter hides them) have no
 * rects and drop out, which is the distinction these tests need.
 *
 * `innerText` reads only the rendered label, so the same markup reports `Map`
 * on the desktop rail and `Learn` in the phone tab bar.
 */
export async function visibleNavLabels(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.nav-menu li'))
      .filter((li) => li.getClientRects().length > 0)
      .map((li) => (li.querySelector('a') as HTMLElement | null)?.innerText.trim() ?? ''),
  )
}

/**
 * Is the nav rendering as the phone tab bar?
 *
 * Read off the component's own CSS (`position: fixed` is what the compact block
 * gives `.nav-menu`), NEVER by re-typing its `(max-width: 768px)` breakpoint in
 * the spec. A re-typed breakpoint is the drift this repo has already been burned
 * by twice — move the query in CSS alone and a spec that owns its own copy keeps
 * measuring the branch that is no longer there, and passes.
 */
export async function navIsPhoneBar(page: Page): Promise<boolean> {
  return page.evaluate(
    () => getComputedStyle(document.querySelector('.nav-menu')!).position === 'fixed',
  )
}
