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
  test('renders nine collapsed islands with one expanded by default', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const payload = await api.getCurriculumMap() // seeds the tree
    const active = findCanonicalCurrent(payload)
    expect(active).not.toBeNull()

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // Nine section-islands render in the adaptive grid.
    await expect(map.sections).toHaveCount(9)

    // Exactly ONE island is expanded (its toggle `aria-expanded=true`) — the one
    // holding the canonical current node.
    const expandedToggles = page.locator('[data-testid="island-toggle"][aria-expanded="true"]')
    await expect(expandedToggles).toHaveCount(1)
    await expect(map.mapSection(active!.sectionSlug).getByTestId('island-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    // Exactly one CURRENT node is visible (the active island's); the others sit in
    // collapsed islands whose bodies are `hidden` — present in the DOM but unpainted.
    const visibleCurrent = page.locator(
      '[data-testid="map-level-node"][data-node-status="current"]:visible',
    )
    await expect(visibleCurrent).toHaveCount(1)
    await expect(map.nodesInTopic(active!.topicSlug, 'current').first()).toBeVisible()

    // A collapsed island's topic body stays in the DOM (count reads) but hidden.
    const collapsedTopic = payload.sections
      .flatMap((s) => (s.slug === active!.sectionSlug ? [] : s.topics))
      .find((t) => t.status !== undefined)
    expect(collapsedTopic).toBeTruthy()
    await expect(map.topic(collapsedTopic!.slug)).toHaveCount(1)
    await expect(map.topic(collapsedTopic!.slug)).toBeHidden()
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

  test('an island expands and collapses on toggle', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const payload = await api.getCurriculumMap()
    const active = findCanonicalCurrent(payload)
    const activeSlug = active!.sectionSlug

    // Pick a COLLAPSED island (any section that isn't the active one) + one of its
    // topics, to prove the accordion reveals its nodes and closes the open island.
    const collapsedSection = payload.sections.find((s) => s.slug !== activeSlug)!
    const collapsedTopic = collapsedSection.topics[0]

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    const activeToggle = map.mapSection(activeSlug).getByTestId('island-toggle')
    const targetToggle = map.mapSection(collapsedSection.slug).getByTestId('island-toggle')

    // Baseline: the active island open, the target collapsed (its topic hidden).
    await expect(activeToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(targetToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(map.topic(collapsedTopic.slug)).toBeHidden()

    // Expand the target → its nodes reveal; the previously-open island collapses
    // (single-open accordion).
    await targetToggle.click()
    await expect(targetToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(map.topic(collapsedTopic.slug)).toBeVisible()
    await expect(activeToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(map.topic(active!.topicSlug)).toBeHidden()
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
