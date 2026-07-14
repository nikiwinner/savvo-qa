/**
 * Curriculum — island-hub map (Phase 27, Story 27.2)
 *
 * Phase 27 rebuilt `/dashboard/learn` from a ~15-screen scroll of fully-expanded
 * chapters into a COACHING HUB: 9 section-islands in an adaptive collapsed grid
 * with a single-open accordion. The island holding the canonical current node is
 * expanded by default; every other island's body stays in the DOM but `hidden`
 * (`display:none`) so QA attribute/count reads still work — only interactions need
 * expansion. A `continue-cta` hero above the grid resumes the current node. Every
 * island's `data-island-state` + `island-next` is DERIVED client-side from the
 * existing map payload (zero new API), so these specs recompute the expected state
 * from `GET /api/curriculum/map/` and assert the DOM matches.
 *
 * `test.slow()` + 45s waits absorb the single-threaded QA stack's cold-start; URLs
 * come from `process.env.BACKEND_URL/FRONTEND_URL` (via the ApiHelper / baseURL).
 */
import { test, expect } from '../../fixtures/index'
import type { CurriculumMapPayload, MapLevel, MapSection } from '../../helpers/api'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'

type IslandState = 'locked' | 'completed' | 'continue' | 'review' | 'start'

function byOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order)
}

/** The canonical current node = the FIRST `current` level in tree order. */
function findCanonicalCurrent(
  payload: CurriculumMapPayload,
): { sectionSlug: string; topicSlug: string; level: MapLevel } | null {
  for (const s of byOrder(payload.sections)) {
    for (const t of byOrder(s.topics)) {
      for (const l of byOrder(t.levels)) {
        if (l.status === 'current') return { sectionSlug: s.slug, topicSlug: t.slug, level: l }
      }
    }
  }
  return null
}

/** Mirror of the frontend island-state derivation (CurriculumMap.svelte). */
function islandState(section: MapSection, activeSlug: string | null): IslandState {
  if (section.slug === activeSlug) return 'continue'
  const c = section.crest
  if (c.levels_total_playable > 0 && c.levels_completed === c.levels_total_playable) return 'completed'
  if (section.topics.every((t) => t.status === 'locked')) return 'locked'
  if (c.levels_completed >= 1) return 'review'
  return 'start'
}

test.describe('Curriculum — island hub', () => {
  test('renders nine chapter-islands on the world map, none focused by default', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const payload = await api.getCurriculumMap() // seeds the tree
    const active = findCanonicalCurrent(payload)
    expect(active).not.toBeNull()

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // Nine chapter-islands render along the world-map road.
    await expect(map.sections).toHaveCount(9)

    // Default = the world map: NO chapter is focused (no `aria-expanded=true`),
    // and the focus-back control is absent (it exists only in focus mode).
    await expect(page.locator('[data-testid="island-toggle"][aria-expanded="true"]')).toHaveCount(0)
    await expect(map.focusBack).toHaveCount(0)

    // No level node is on-stage yet — every chapter's path lives inside its focus
    // mode, so all node bodies stay in the DOM but hidden.
    await expect(page.locator('[data-testid="map-level-node"]:visible')).toHaveCount(0)

    // The active chapter (the one holding the canonical current node) reads
    // `continue`; a non-active chapter's topic body is present in the DOM but hidden.
    await expect(map.mapSection(active!.sectionSlug)).toHaveAttribute('data-island-state', 'continue')
    const otherTopic = payload.sections.flatMap((s) =>
      s.slug === active!.sectionSlug ? [] : s.topics,
    )[0]
    expect(otherTopic).toBeTruthy()
    await expect(map.topic(otherTopic!.slug)).toHaveCount(1)
    await expect(map.topic(otherTopic!.slug)).toBeHidden()
  })

  test('island states derive from progress', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const payload = await api.getCurriculumMap()
    const active = findCanonicalCurrent(payload)
    const activeSlug = active?.sectionSlug ?? null

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // Every island's `data-island-state` equals the client-side derivation — the
    // full start/continue/review/completed/locked table (Story 27.2 DoD 27.2.4).
    const expected = new Map<string, IslandState>()
    for (const section of payload.sections) {
      expected.set(section.slug, islandState(section, activeSlug))
    }
    for (const [slug, state] of expected) {
      await expect(map.mapSection(slug)).toHaveAttribute('data-island-state', state)
    }

    // A fresh user must exercise the interesting states: the active island is
    // `continue`, at least one is `start`, and at least one is fully `locked`.
    const states = [...expected.values()]
    expect(states).toContain('continue')
    expect(states).toContain('start')
    expect(states).toContain('locked')
    expect(expected.get(activeSlug!)).toBe('continue')
  })

  test('a chapter zooms into focus and returns to the world map', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const payload = await api.getCurriculumMap()
    const active = findCanonicalCurrent(payload)!
    const activeSlug = active.sectionSlug

    // A SECOND chapter (with at least one topic) to prove focus switches islands.
    const other = payload.sections.find((s) => s.slug !== activeSlug && s.topics.length > 0)!
    const otherTopic = other.topics[0]

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    const activeToggle = map.mapSection(activeSlug).getByTestId('island-toggle')
    const otherToggle = map.mapSection(other.slug).getByTestId('island-toggle')

    // World map: nothing focused, both island toggles clickable, paths hidden.
    await expect(activeToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(otherToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(map.topic(active.topicSlug)).toBeHidden()

    // Click the active island → zoom into focus: its path is on-stage, back shows.
    await activeToggle.click()
    await expect(activeToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(map.topic(active.topicSlug)).toBeVisible()
    await expect(map.focusBack).toBeVisible()

    // Back → the world map: nothing focused, the path is hidden again.
    await map.focusBack.click()
    await expect(map.focusBack).toBeHidden()
    await expect(activeToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(map.topic(active.topicSlug)).toBeHidden()

    // Focus a DIFFERENT island → single-open: it is the only focused chapter.
    await otherToggle.click()
    await expect(otherToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(map.topic(otherTopic.slug)).toBeVisible()
    await expect(activeToggle).toHaveAttribute('aria-expanded', 'false')
  })

  test('Continue CTA resumes the current node', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const payload = await api.getCurriculumMap()
    const active = findCanonicalCurrent(payload)!

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // The hero CTA names the canonical current level and opens the host on it.
    await expect(map.continueCta).toBeVisible()
    await expect(map.continueCta).toContainText(active.level.title)

    await map.continueCta.click()
    await expect(map.stepPlayerHost).toBeVisible({ timeout: 45_000 })
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })

    // Its island is expanded behind the host.
    await expect(map.mapSection(active.sectionSlug).getByTestId('island-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  test('island-next names the next level', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const payload = await api.getCurriculumMap()
    const active = findCanonicalCurrent(payload)!

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // The active island's `island-next` names its own current level title.
    await expect(map.mapSection(active.sectionSlug).getByTestId('island-next')).toContainText(
      active.level.title,
    )
  })
})
