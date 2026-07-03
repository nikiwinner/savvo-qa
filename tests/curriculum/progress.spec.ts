/**
 * Curriculum — derived progress (Phase 21, Story 21.1)
 *
 * Progress is DERIVED on read from `StepCompletion` (no materialized tables).
 * These specs drive deterministic progress via the DEBUG seeds
 * (`seed/level-state/` + `seed/step-completion/`) and assert the map's derived
 * node/topic states + crests + streak. The streak now reads `StepCompletion`
 * (replacing the retired flat-loop `streak.spec.ts` day-counter test).
 *
 * Timezone: streak fixtures pin the program tz to `'UTC'` via
 * `getCurriculumMap('UTC')` BEFORE seeding (capture-once) and compute every
 * `completed_at` in UTC (utc*DaysAgo) so the suite never flakes near midnight —
 * the retired flat-loop program seed is gone; the map endpoint is the tz anchor now.
 *
 * Content facts used below trace to `backend/src/app/curriculum/content/`:
 *   - `smart-spending` (S2, no prereq) has 4 step-bearing levels — `catch-every-spend`
 *     is one of them.
 *   - `earning-money` (S1, no prereq) has EXACTLY 3 step-bearing levels
 *     (`earning-inventory`, `plant-one-new-stream`, `income-shows-up`); `career-choice`'s
 *     ONLY prerequisite is `earning-money`.
 *   - `saving` (S3, nature `applied`) is prereq-locked for a fresh user
 *     (saving ← budgeting ← smart-spending).
 */
import { test, expect } from '../../fixtures/index'
import { utcInstantDaysAgo } from '../../helpers/api'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'

// Step-content leak canaries — full instruction fragments from the seeded mission
// steps. NONE may appear on the map (the map payload carries no step content).
const STEP_CONTENT_CANARIES = ['connect your bank', 'Say it out loud', '24-hour pause', 'Sell something idle']

test.describe('Curriculum — derived progress', () => {
  test('completing every step in a level marks the node completed', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const map = new CurriculumMapPage(page)
    await map.goto() // seeds the tree + renders the fresh-state map

    // Before: the smart-spending topic has zero completed nodes.
    expect(await map.nodesInTopic('smart-spending', 'completed').count()).toBe(0)

    // Complete EVERY step in one step-bearing level of that topic.
    await api.seedLevelState({ topic_slug: 'smart-spending', level_slug: 'catch-every-spend' })

    await map.goto()

    // Exactly one node in the topic now reads completed …
    expect(await map.nodesInTopic('smart-spending', 'completed').count()).toBe(1)
    await expect(map.nodesInTopic('smart-spending', 'completed').first()).toHaveAttribute(
      'data-node-status',
      'completed',
    )
    // … and the topic-crest count incremented (1 of the 4 playable levels done).
    await expect(map.topicCrest('smart-spending')).toContainText('1')
  })

  test('seeded completions render the right streak on the map', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    // Pin the program tz to UTC (capture-once) BEFORE seeding so the backdated
    // completions are interpreted in UTC.
    await api.getCurriculumMap('UTC')

    // Five consecutive calendar-day completions ending YESTERDAY → current streak 5.
    // Each distinct step-bearing level supplies a distinct completion date (a level's
    // steps all share the seeded `completed_at`, so one level == one calendar day).
    await api.seedLevelState({
      topic_slug: 'smart-spending',
      level_slug: 'catch-every-spend',
      completed_at: utcInstantDaysAgo(5),
    })
    await api.seedLevelState({
      topic_slug: 'smart-spending',
      level_slug: 'name-what-you-buy',
      completed_at: utcInstantDaysAgo(4),
    })
    await api.seedLevelState({
      topic_slug: 'smart-spending',
      level_slug: 'the-pause-that-saves',
      completed_at: utcInstantDaysAgo(3),
    })
    await api.seedLevelState({
      topic_slug: 'smart-spending',
      level_slug: 'clean-week',
      completed_at: utcInstantDaysAgo(2),
    })
    await api.seedLevelState({
      topic_slug: 'saving',
      level_slug: 'a-home-for-savings',
      completed_at: utcInstantDaysAgo(1),
    })

    const map = new CurriculumMapPage(page)
    await map.goto()

    // The map-streak reads the current streak (5) — derived from StepCompletion.
    expect(await map.currentStreak()).toBe(5)

    // API parity — genuinely 5, not a stale render.
    const payload = await api.getCurriculumMap()
    expect(payload.streak.current).toBe(5)
    expect(payload.streak.best).toBe(5)
  })

  test('a prerequisite-locked topic stays locked until its prereq is complete', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const map = new CurriculumMapPage(page)
    await map.goto()

    // career-choice's only prerequisite is earning-money → locked for a fresh user.
    await expect(map.topic('career-choice')).toHaveAttribute('data-topic-status', 'locked')

    // Complete EVERY step-bearing level of earning-money → the topic completes.
    for (const level of ['earning-inventory', 'plant-one-new-stream', 'income-shows-up']) {
      await api.seedLevelState({ topic_slug: 'earning-money', level_slug: level })
    }

    await map.goto()

    // earning-money is now completed → career-choice unlocks to available.
    await expect(map.topic('earning-money')).toHaveAttribute('data-topic-status', 'completed')
    await expect(map.topic('career-choice')).toHaveAttribute('data-topic-status', 'available')
  })

  test('a locked topic exposes its nature but no step content', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()

    // saving (proving slice) is prereq-locked for a fresh user.
    const saving = map.topic('saving')
    await expect(saving).toHaveAttribute('data-topic-status', 'locked')
    // Its nature badge is exposed …
    await expect(saving).toHaveAttribute('data-topic-nature', 'applied')
    // … and its level scaffold still renders (the path ahead stays visible).
    expect(await map.nodesInTopic('saving').count()).toBeGreaterThan(0)

    // Leak-safe: no step-content string anywhere on the surface (the map payload
    // carries level titles only — never step content).
    const pageText = await map.learnPage.innerText()
    for (const canary of STEP_CONTENT_CANARIES) {
      expect(pageText).not.toContain(canary)
    }
  })
})
