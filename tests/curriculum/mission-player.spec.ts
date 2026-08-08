/**
 * Curriculum — Mission player + verify write-path (Phase 22, Story 22.6 / 22.3)
 *
 * The ★ Mission player is the first production caller of the Phase-20 verifier.
 * A `self_attest` mission completes on an honest "nothing to verify but you"
 * label; a row-verified mission (`space_exists`) FAILS without real data and
 * PASSES once the row exists, rendering a `verifier-snapshot` whose every figure
 * taps through to the source rows (no-fake-numbers). Verification is strictly
 * `request.user`-scoped — a non-owner's rows never leak into the snapshot, and an
 * anonymous verify is rejected.
 *
 * The row-verified fixture lands in the pollution-safe
 * `smart-spending / name-what-you-buy` level (see `helpers/curriculumFixtures.ts`);
 * the `self_attest` case reuses the real single-mission `earning-inventory` node.
 * `test.slow()` + 45s waits absorb the QA stack's cold-start window.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import { CELEBRATES } from '../../helpers/reactions'
import {
  seedPlayerFixtures,
  makeFixtureLevelPlayable,
  unlockFixtureLevel,
  MISSION_XP,
} from '../../helpers/curriculumFixtures'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'

test.describe('Curriculum — mission player', () => {
  test('a self_attest mission walks its guided flow and reports on honour', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // seed the tree
    // Phase 29 A1: earning-money's L2 `your-earning-inventory` is now a guided-v2
    // self_attest mission (choice → input → attest). L1 (`income-is-a-number`) leads
    // with a lesson, so seed-complete L1 + the L2 `what-you-already-own` lesson
    // (per-step, writes NO XP) so `earning-inventory` (L2) is current and opens
    // directly to the mission (it mounts after its teach-first lesson).
    await api.seedLevelState({ topic_slug: 'earning-money', level_slug: 'income-is-a-number' })
    await api.seedStepCompletion({ level_slug: 'earning-inventory', step_slug: 'what-you-already-own' })

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // `earning-inventory` (L2) is now the `current` node; its lesson is done, so the
    // host opens directly on the lone `your-earning-inventory` self_attest mission
    // (in a collapsed island — expand it first).
    await map.expandIslandFor('earning-money')
    await map.nodesInTopic('earning-money', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')

    // Single-path mission → no chooser; walk the guided screens (choice → input) to
    // the attest terminal.
    await map.walkMissionFlow()

    // The terminal is an explicit attestation NAMING the action, alongside the
    // honest "nothing to verify but you" note — and NO fabricated row check.
    await expect(map.missionSelfAttest).toBeVisible()
    await expect(map.missionAttest).toBeVisible()
    await expect(map.verifierSnapshot).toHaveCount(0)

    // Attest → a REPORTED pass, honoured on the user's word ("Done — on your
    // honour."), with NO verifier snapshot; the player celebrates in words + real XP.
    await map.attestMission()
    await expect(map.missionReportedLead).toBeVisible({ timeout: 45_000 })
    await expect(map.missionPassLead).toHaveCount(0)
    await expect(map.verifierSnapshot).toHaveCount(0)
    await expect(map.playerReaction).toHaveText(CELEBRATES)
    await expect(map.completionXp).toBeVisible()

    // A reported pass shows its OWN pass screen (no separate reward screen) →
    // Continue closes the host; the real XP rose from the Bar #1 ledger.
    await map.missionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBeGreaterThan(0)
  })

  test('a row-verified mission fails without data then passes with it', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { mission } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, mission.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    await map.expandIslandFor('smart-spending')
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    // Row-verified — NOT a self_attest label; there's a real "Verify" action + a
    // deep link that names where it goes (there is no generic "Open Savvo"
    // fallback any more — it landed on the page the reader was already on).
    await expect(page.getByTestId('mission-self-attest')).toHaveCount(0)
    await expect(page.getByTestId('mission-deeplink')).toBeVisible()
    await expect(page.getByTestId('mission-deeplink')).toHaveAttribute('href', /\/dashboard\/spaces/)

    // No space yet → honest FAIL, no completion.
    await page.getByTestId('mission-verify').click()
    await expect(page.getByTestId('mission-fail-note')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('verifier-snapshot')).toHaveCount(0)

    // Do the real thing, then verify again → PASS against real rows.
    const space = await api.createSpace('QA Mission Home')
    await page.getByTestId('mission-verify').click()

    // The snapshot: a tappable figure carrying the real space id → its source rows.
    await expect(page.getByTestId('verifier-snapshot')).toBeVisible({ timeout: 45_000 })
    const figure = page.getByTestId('snapshot-figure').first()
    await expect(figure).toBeVisible()
    await expect(figure).toContainText(String(space.id))
    await expect(figure).toHaveAttribute('href', /\/dashboard\/spaces/)

    // XP awarded on the real pass (traceable to the ledger).
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBe(MISSION_XP)
  })

  test('verify is user-scoped and blocks a non-owner’s data', async ({ twoActors, playwright }) => {
    test.slow()
    const { apiA, apiB } = twoActors

    const { mission } = await seedPlayerFixtures(apiA)
    await unlockFixtureLevel(apiA) // make the fixture level playable for A

    // A has no space → honest FAIL, snapshot names zero spaces.
    const noData = await apiA.verifyStep(mission.step_id)
    expect(noData.passed).toBe(false)
    expect((noData.snapshot['space_exists'] as { space_ids: number[] }).space_ids).toEqual([])

    // B owns a space — it must NEVER appear in A's snapshot.
    const bSpace = await apiB.createSpace('B private space')
    const stillFail = await apiA.verifyStep(mission.step_id)
    expect(stillFail.passed).toBe(false)
    const bLeak = (stillFail.snapshot['space_exists'] as { space_ids: number[] }).space_ids
    expect(bLeak).not.toContain(bSpace.id)
    expect(bLeak).toEqual([])

    // A creates its OWN space → PASS, snapshot carries A's id and not B's.
    const aSpace = await apiA.createSpace('A private space')
    const pass = await apiA.verifyStep(mission.step_id)
    expect(pass.passed).toBe(true)
    const aIds = (pass.snapshot['space_exists'] as { space_ids: number[] }).space_ids
    expect(aIds).toContain(aSpace.id)
    expect(aIds).not.toContain(bSpace.id)

    // A logged-out verify is rejected (session auth + IsAuthenticated → 403).
    const anon = await playwright.request.newContext()
    const res = await anon.post(`${BACKEND_URL}/api/steps/${mission.step_id}/verify/`, { data: {} })
    expect(res.status()).toBe(403)
    await anon.dispose()
  })

  test('a row-verified mission celebrates once via its snapshot', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { mission } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, mission.step_id)
    // Create the real Space up front so the very first verify PASSES against rows.
    await api.createSpace('QA Celebrate Home')

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('smart-spending')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')

    // Verify → PASS → the ENRICHED snapshot phase celebrates in ONE screen: a
    // celebrating line + a real +XP chip alongside the row-verified snapshot.
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    await expect(map.playerReaction).toBeVisible()
    await expect(map.playerReaction).toHaveText(CELEBRATES)
    await expect(map.completionXp).toBeVisible()
    await expect(map.completionXp).toContainText(String(MISSION_XP))
    // A row-verified mission NEVER shows the separate reward screen — the snapshot
    // IS the celebration (no double screen).
    await expect(map.stepCompletion).toHaveCount(0)

    // Continue closes the host; the real XP rose by exactly the mission award.
    await map.missionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + MISSION_XP)
  })
})
