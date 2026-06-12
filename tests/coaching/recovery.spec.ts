/**
 * Coaching — Recovery flow (Phase 18, Story 18.3)
 *
 * Uses the DEBUG seed endpoints (`seed/program-state/` + `seed/completion/`) to
 * build deterministic gaps — never wall-clock waits. The program tz is pinned to
 * `'UTC'` in every spec and every seeded date is computed in UTC (utc*DaysAgo) so
 * the suite never flakes near midnight.
 *
 * Recovery semantics (engine.resolve_today + compute_streak):
 *   - last completion ≥2 calendar days ago (program tz) + unfinished current day
 *     → the active mission is flagged `is_recovery` (support Auri), recovery badge.
 *   - completing the recovery dates the completion at "now" (= today, UTC), which
 *     BRIDGES the gap: the streak drops by exactly 1 (floored at 0), not to 0.
 *   - an N-day gap still yields exactly ONE recovery (no stacking).
 *   - a fresh user with zero completions is NEVER recovery (cold start = Day 1).
 */
import { test, expect } from '../../fixtures/index'
import { utcDateDaysAgo, utcInstantDaysAgo } from '../../helpers/api'
import { TodayPage } from '../../pages/TodayPage'

test.describe('Coaching — Recovery', () => {
  test('missing a day shows the Recovery mission', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    // Pin the program to UTC, started 6 days ago, sitting on an unfinished Day 4.
    await api.seedProgramState({ timezone: 'UTC', start_date: utcDateDaysAgo(6), current_day: 4 })
    // Last completion was Day 3, three calendar days ago → ≥2-day gap → recovery.
    await api.seedCompletion({ day_number: 3, completed_at: utcInstantDaysAgo(3) })

    const today = new TodayPage(page)
    await today.goto()

    // Recovery badge + the support-Auri emotion + the gentle catch-up copy.
    await expect(today.missionCard).toBeVisible()
    await expect(today.recoveryBadge).toBeVisible()
    await expect(today.recoveryBadge).toContainText(/catch-up/i)
    // The active mission card carries the recovery styling class.
    await expect(today.missionCard).toHaveClass(/recovery/)

    // Sanity: the API agrees this is a recovery (defends against a CSS-only badge).
    const payload = await api.getMissionToday()
    expect(payload.is_recovery).toBe(true)
    expect(payload.auri_emotion).toBe('06_support')
  })

  test('completing Recovery keeps the streak (−1, not reset) and returns to flow', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // Seed a known prior 3-day consecutive streak (Days 1-3 on three consecutive
    // calendar dates ending 3 days ago), then sit on an unfinished Day 4. The
    // last completion is 3 days ago → recovery.
    await api.seedProgramState({ timezone: 'UTC', start_date: utcDateDaysAgo(5), current_day: 4 })
    await api.seedCompletion({ day_number: 1, completed_at: utcInstantDaysAgo(5) })
    await api.seedCompletion({ day_number: 2, completed_at: utcInstantDaysAgo(4) })
    await api.seedCompletion({ day_number: 3, completed_at: utcInstantDaysAgo(3) })

    const today = new TodayPage(page)
    await today.goto()
    await expect(today.recoveryBadge).toBeVisible()

    // Complete the recovery: it dates "today", bridging the 3-day gap. The prior
    // run was 3 → recovery costs exactly one → streak = 2 (NOT reset to 0).
    await today.complete()
    await expect(today.celebration).toBeVisible()

    expect(await today.currentStreak()).toBe(2)
    // The day advanced (current_day 4 → 5), and the completed Day 4 is displayed.
    expect(await today.currentDay()).toBe(4)

    // API parity — the streak is genuinely 2, not a stale render.
    const payload = await api.getMissionToday()
    expect((payload.streak as { current: number }).current).toBe(2)
  })

  test('missing several days still shows one Recovery (no stack)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // A 3-day gap (last completion 3 days ago), unfinished Day 5.
    await api.seedProgramState({ timezone: 'UTC', start_date: utcDateDaysAgo(8), current_day: 5 })
    await api.seedCompletion({ day_number: 4, completed_at: utcInstantDaysAgo(3) })

    const today = new TodayPage(page)
    await today.goto()

    // Exactly ONE recovery mission is presented — recovery is a single boolean on
    // the resumed active day regardless of gap size (no stacking).
    await expect(today.recoveryBadge).toHaveCount(1)
    await expect(today.recoveryBadge).toBeVisible()

    const payload = await api.getMissionToday()
    expect(payload.is_recovery).toBe(true)
    // Completing it bridges the whole multi-day gap as a single −1, not N penalties.
    await today.complete()
    const after = await api.getMissionToday()
    // Prior live run was just Day 4 (streak 1) → after one bridged recovery: max(1-1,0)=0.
    expect((after.streak as { current: number }).current).toBe(0)
  })

  test('a fresh user with zero completions is never Recovery', async ({ page, loggedInPage }) => {
    const today = new TodayPage(page)
    await today.goto()

    await expect(today.missionCard).toBeVisible()
    await expect(today.recoveryBadge).toHaveCount(0)
    await expect(today.missionCard).not.toHaveClass(/recovery/)
  })
})
