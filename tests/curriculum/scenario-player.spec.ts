/**
 * Curriculum — Scenario player mechanics (Phase 26, Story 26.2/26.6)
 *
 * The 🎭 Scenario is a branching decision-sim: tapping an option reveals that
 * option's FORMATIVE narrative `scenario-feedback` — there is NO score, NO fail
 * state and NO correct/incorrect verdict. A "Continue" advances to the option's
 * `next` node; on a terminal option a "Done" (`scenario-done`) mark-completes the
 * step (empty body, like a lesson) → `StepCompletion` + XP.
 *
 * Pollution-safety (gotcha #26): the scenario fixture lands in the already-step-
 * bearing, unlocked `smart-spending / name-what-you-buy` level (seeded as the 6th
 * fixture in the SAME `seedPlayerFixtures` set every player spec seeds), so the
 * level "completes on the last step" race-free and the map crest counts stay
 * stable. `test.slow()` + 45s waits absorb the QA stack's cold-start window.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import { seedPlayerFixtures, makeFixtureLevelPlayable, SCENARIO_CONTENT, SCENARIO_XP } from '../../helpers/curriculumFixtures'

const ENTRY = SCENARIO_CONTENT.nodes[0]
const SECOND = SCENARIO_CONTENT.nodes[1]

test.describe('Curriculum — scenario player', () => {
  test('a scenario branches and gives per-node feedback', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { scenario } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, scenario.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'scenario', { timeout: 45_000 })

    // The entry node renders its prompt + tappable options; no feedback yet.
    await expect(map.scenarioNode.first()).toBeVisible()
    await expect(map.stepPlayer).toContainText(ENTRY.prompt)
    await expect(map.scenarioOption).toHaveCount(ENTRY.options.length)
    await expect(map.scenarioFeedback).toHaveCount(0)

    // Tap an option → its formative feedback appears and a "Continue" is offered.
    await map.scenarioOption.first().click()
    await expect(map.scenarioFeedback).toBeVisible()
    await expect(map.scenarioFeedback).toContainText(ENTRY.options[0].feedback)
    // There is NO fail state — a tap is never "wrong" (no fail note, no verdict).
    await expect(map.missionFailNote).toHaveCount(0)
    await expect(map.scenarioContinue).toBeVisible()

    // Continue advances to the next node (its prompt), and the feedback resets.
    await map.scenarioContinue.click()
    await expect(map.stepPlayer).toContainText(SECOND.prompt)
    await expect(map.scenarioFeedback).toHaveCount(0)
  })

  test('reaching a terminal node completes the scenario', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { scenario } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, scenario.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'scenario', { timeout: 45_000 })

    // Walk the graph to a terminal node and mark it done.
    await map.playScenarioToEnd()

    // Terminal Done → the level completes → the host closes + XP lands on the map.
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + SCENARIO_XP)

    // API parity — the number on screen traces to a real ledger row.
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBe(SCENARIO_XP)
  })

  test('a scenario leaks no answer key or score', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { scenario } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, scenario.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'scenario', { timeout: 45_000 })

    // Tap an option so the feedback (the ONLY response) renders.
    await map.scenarioOption.first().click()
    await expect(map.scenarioFeedback).toBeVisible()

    // The scenario is formative-only: NO quiz-style graded result, NO right/wrong
    // verdict marks, NO "X / Y" score anywhere in the DOM.
    await expect(page.getByTestId('quiz-result')).toHaveCount(0)
    await expect(map.stepPlayer.locator('[data-correct]')).toHaveCount(0)
    const surface = await map.stepPlayer.innerText()
    expect(surface).not.toMatch(/\bincorrect\b/i)
    expect(surface).not.toMatch(/\b\d+\s*\/\s*\d+\b/)
  })
})
