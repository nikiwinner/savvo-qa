import { Page, Locator } from '@playwright/test'

/**
 * Page object for the Phase 18 coach **Today** surface (`/dashboard/today`).
 *
 * The page has a tz-cookie cold-start contract (see `+page.server.ts`): the
 * VERY FIRST visit without a `savvo_tz` cookie returns `needsTz` server-side and
 * the CLIENT performs the program-creating `GET /api/missions/today/?tz=<Intl>`
 * before the card renders. So every reader here waits for the final rendered
 * state (`missionCard` / `celebration` visible) rather than assuming SSR HTML.
 *
 * Testids mirror `frontend/src/routes/dashboard/today/+page.svelte` +
 * `frontend/src/lib/components/AuriCharacter.svelte`. `data-auri-mode="png|glyph"`
 * lives on the inner `.auri-character` (testid `auri-character`).
 */
export class TodayPage {
  readonly page: Page

  // Containers / state markers
  readonly todayPage: Locator
  readonly auriBlock: Locator
  readonly auriCharacter: Locator
  readonly missionCard: Locator
  readonly celebration: Locator
  readonly error: Locator
  readonly retryButton: Locator

  // Mission card content
  readonly missionTitle: Locator
  readonly missionSteps: Locator
  readonly missionStep: Locator
  readonly startButton: Locator
  readonly completeButton: Locator

  // Progress / streak / recovery / tomorrow
  readonly dayProgress: Locator
  readonly streakCount: Locator
  readonly tomorrowType: Locator
  readonly recoveryBadge: Locator

  constructor(page: Page) {
    this.page = page

    this.todayPage = page.getByTestId('today-page')
    this.auriBlock = page.getByTestId('auri-block')
    this.auriCharacter = page.getByTestId('auri-character')
    this.missionCard = page.getByTestId('mission-card')
    this.celebration = page.getByTestId('celebration')
    this.error = page.getByTestId('today-error')
    this.retryButton = page.getByTestId('today-retry')

    this.missionTitle = page.getByTestId('mission-title')
    this.missionSteps = page.getByTestId('mission-steps')
    this.missionStep = page.getByTestId('mission-step')
    this.startButton = page.getByTestId('start-button')
    this.completeButton = page.getByTestId('complete-button')

    // day-progress + streak-count render in BOTH the active card and the
    // celebration card. `.first()` keeps a single match either way.
    this.dayProgress = page.getByTestId('day-progress').first()
    this.streakCount = page.getByTestId('streak-count').first()
    this.tomorrowType = page.getByTestId('tomorrow-type')
    this.recoveryBadge = page.getByTestId('recovery-badge')
  }

  /**
   * Navigate to `/dashboard/today` and wait for the page to settle into either
   * the active mission card, the celebration card, or the error card. The cold
   * start (client tz fetch) resolves into one of these — never assume SSR HTML.
   */
  async goto(): Promise<void> {
    await this.page.goto('/dashboard/today')
    await this.waitForSettled()
  }

  /**
   * Wait until the loading spinner has resolved into a terminal state. The
   * cold-start client tz-fetch chain (signup → me → spaces → inbox → today)
   * runs against the single-threaded QA Django dev server, which under the
   * suite's parallel load can take well over 15s — hence the generous ceiling
   * (the page itself renders correctly; this only absorbs server contention).
   */
  async waitForSettled(): Promise<void> {
    await this.missionCard
      .or(this.celebration)
      .or(this.error)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
  }

  /** Tap Complete and wait for the in-place celebration transition. */
  async complete(): Promise<void> {
    await this.completeButton.click()
    await this.celebration.waitFor({ state: 'visible', timeout: 30_000 })
  }

  /** Tap Start (best-effort — never blocks Complete). */
  async start(): Promise<void> {
    await this.startButton.click()
  }

  /** The `data-auri-mode` attribute on the Auri block: `'png'` or `'glyph'`. */
  async auriMode(): Promise<string | null> {
    return this.auriCharacter.getAttribute('data-auri-mode')
  }

  /** Raw "Day X / Y" text from the visible progress row. */
  async dayProgressText(): Promise<string> {
    return (await this.dayProgress.innerText()).trim()
  }

  /** Raw streak readout text (e.g. "3-day streak"). */
  async streakText(): Promise<string> {
    return (await this.streakCount.innerText()).trim()
  }

  /** Parse the current-streak integer out of the "<N>-day streak" readout. */
  async currentStreak(): Promise<number> {
    const text = await this.streakText()
    const match = text.match(/(\d+)/)
    return match ? Number(match[1]) : NaN
  }

  /** Parse the active day number out of "Day X / Y". */
  async currentDay(): Promise<number> {
    const text = await this.dayProgressText()
    const match = text.match(/Day\s+(\d+)\s*\/\s*(\d+)/i)
    return match ? Number(match[1]) : NaN
  }

  /** Parse the program length (the "/ Y" total) out of "Day X / Y". */
  async totalDays(): Promise<number> {
    const text = await this.dayProgressText()
    const match = text.match(/Day\s+(\d+)\s*\/\s*(\d+)/i)
    return match ? Number(match[2]) : NaN
  }

  /** Tomorrow-type chip text from the celebration card (e.g. "Track mission"). */
  async tomorrowTypeText(): Promise<string> {
    return (await this.tomorrowType.innerText()).trim()
  }
}
