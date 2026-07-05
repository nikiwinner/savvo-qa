import { Page, Locator } from '@playwright/test'

/**
 * Page object for the Phase 21 curriculum **unit-map** (`/dashboard/learn`).
 *
 * The page keeps the Phase-18 `savvo_tz` cold-start contract (see
 * `+page.server.ts`): the VERY FIRST visit without a `savvo_tz` cookie returns
 * `needsTz` server-side and the CLIENT performs the tz-capturing
 * `GET /api/curriculum/map/?tz=<Intl>` before the map renders. So every reader
 * here waits for the final rendered state (`curriculum-map` visible) rather than
 * assuming SSR HTML.
 *
 * Testids mirror the map surface pinned in `mas/roadmap/phase_21.md`
 * (§"Layer Mapping → New / changed frontend") +
 * `frontend/src/lib/components/AuriCharacter.svelte`. `data-auri-mode="png|glyph"`
 * lives on the inner `.auri-character` (testid `auri-character`).
 */
export class CurriculumMapPage {
  readonly page: Page

  // Containers / degraded state
  readonly learnPage: Locator
  readonly map: Locator
  readonly error: Locator
  readonly retryButton: Locator

  // Tree
  readonly sections: Locator
  readonly sectionCrests: Locator
  readonly topics: Locator
  readonly topicCrests: Locator
  readonly levelNodes: Locator

  // Two-bar topbar + streak
  readonly barKnowledge: Locator
  readonly xpTotal: Locator
  readonly barDoing: Locator
  readonly mapStreak: Locator

  // Auri + step-player host
  readonly auriCharacter: Locator
  readonly stepPlayerHost: Locator
  readonly stepHostClose: Locator

  // Step players (Phase 22)
  readonly stepPlayer: Locator
  readonly crestReveal: Locator

  // Lesson player
  readonly lessonCard: Locator
  readonly lessonNext: Locator
  readonly lessonDone: Locator

  // Lesson player — interactive (tap) cards (Phase 24, Lesson Format v2)
  readonly lessonOption: Locator
  readonly lessonCardFeedback: Locator
  readonly lessonCardChoice: Locator
  readonly lessonCardThisOrThat: Locator
  readonly lessonCardSpotError: Locator

  // Quiz player
  readonly quizQuestion: Locator
  readonly quizOption: Locator
  readonly quizSubmit: Locator
  readonly quizResult: Locator
  readonly quizRetry: Locator
  readonly quizNext: Locator

  // Mission player + verify snapshot (Phase 22/23)
  readonly missionVerify: Locator
  readonly missionDeeplink: Locator
  readonly missionSelfAttest: Locator
  readonly missionFailNote: Locator
  readonly verifierSnapshot: Locator
  readonly snapshotFigure: Locator
  readonly missionContinue: Locator

  // Space picker (Phase 23 — binds_space missions only)
  readonly spacePicker: Locator
  readonly spacePickerEmpty: Locator
  readonly spacePickerError: Locator
  readonly spacePickerCreate: Locator
  readonly pickerRadios: Locator

  constructor(page: Page) {
    this.page = page

    this.learnPage = page.getByTestId('learn-page')
    this.map = page.getByTestId('curriculum-map')
    this.error = page.getByTestId('learn-error')
    this.retryButton = page.getByTestId('learn-retry')

    this.sections = page.getByTestId('map-section')
    this.sectionCrests = page.getByTestId('section-crest')
    this.topics = page.getByTestId('map-topic')
    this.topicCrests = page.getByTestId('topic-crest')
    this.levelNodes = page.getByTestId('map-level-node')

    this.barKnowledge = page.getByTestId('bar-knowledge')
    this.xpTotal = page.getByTestId('xp-total')
    this.barDoing = page.getByTestId('bar-doing')
    this.mapStreak = page.getByTestId('map-streak')

    this.auriCharacter = page.getByTestId('auri-character')
    this.stepPlayerHost = page.getByTestId('step-player-host')
    this.stepHostClose = page.getByTestId('step-host-close')

    this.stepPlayer = page.getByTestId('step-player')
    this.crestReveal = page.getByTestId('crest-reveal')

    this.lessonCard = page.getByTestId('lesson-card')
    this.lessonNext = page.getByTestId('lesson-next')
    this.lessonDone = page.getByTestId('lesson-done')

    this.lessonOption = page.getByTestId('lesson-option')
    this.lessonCardFeedback = page.getByTestId('lesson-card-feedback')
    this.lessonCardChoice = page.getByTestId('lesson-card-choice')
    this.lessonCardThisOrThat = page.getByTestId('lesson-card-this-or-that')
    this.lessonCardSpotError = page.getByTestId('lesson-card-spot-error')

    this.quizQuestion = page.getByTestId('quiz-question')
    this.quizOption = page.getByTestId('quiz-option')
    this.quizSubmit = page.getByTestId('quiz-submit')
    this.quizResult = page.getByTestId('quiz-result')
    this.quizRetry = page.getByTestId('quiz-retry')
    // The quiz "Next" affordance carries no testid (only the last-question
    // "Submit" does), so it is addressed by its accessible name.
    this.quizNext = page.getByRole('button', { name: /Next/ })

    this.missionVerify = page.getByTestId('mission-verify')
    this.missionDeeplink = page.getByTestId('mission-deeplink')
    this.missionSelfAttest = page.getByTestId('mission-self-attest')
    this.missionFailNote = page.getByTestId('mission-fail-note')
    this.verifierSnapshot = page.getByTestId('verifier-snapshot')
    this.snapshotFigure = page.getByTestId('snapshot-figure')
    // The row-verified PASS "Continue" button (advances/closes the host) has no
    // testid — addressed by its accessible name.
    this.missionContinue = page.getByRole('button', { name: /Continue/ })

    this.spacePicker = page.getByTestId('space-picker')
    this.spacePickerEmpty = page.getByTestId('space-picker-empty')
    this.spacePickerError = page.getByTestId('space-picker-error')
    this.spacePickerCreate = page.getByTestId('space-picker-create')
    this.pickerRadios = this.spacePicker.getByRole('radio')
  }

  /** Open a topic's sole `current` node and wait for the step player to mount. */
  async openCurrentNode(topicSlug: string, timeout = 45_000): Promise<void> {
    await this.nodesInTopic(topicSlug, 'current').first().click()
    await this.stepPlayerHost.waitFor({ state: 'visible', timeout })
    await this.stepPlayer.waitFor({ state: 'visible', timeout })
  }

  /**
   * Advance a Lesson deck to the end and mark it done. Card-count-agnostic
   * (works for a 2- or 4-card deck) AND interactive-card-aware (Phase 24, Lesson
   * Format v2): a `choice` / `this_or_that` / `spot_error` card keeps the advance
   * control DISABLED until an option is tapped, so on each card we detect the
   * disabled control and tap the first option (any answer proceeds — formative,
   * no XP, no fail) before advancing. Returns the number of interactive cards
   * that had to be answered (0 for an all-text deck).
   */
  async playLessonDeck(): Promise<number> {
    await this.lessonCard.waitFor({ state: 'visible', timeout: 45_000 })
    let interactiveTapped = 0
    // The cap is a safety net against a stuck deck (a real deck is a handful of
    // cards). Exactly one of lesson-next / lesson-done is rendered per card.
    for (let i = 0; i < 30; i++) {
      const onLast = (await this.lessonDone.count()) > 0
      const advance = onLast ? this.lessonDone : this.lessonNext
      await advance.waitFor({ state: 'visible', timeout: 45_000 })
      // A disabled advance control at deck-walk time means an unanswered
      // interactive card — tap an option to unlock it (any answer proceeds).
      if (await advance.isDisabled()) {
        await this.lessonOption.first().click()
        interactiveTapped++
      }
      await advance.click()
      if (onLast) return interactiveTapped
    }
    return interactiveTapped
  }

  /**
   * Answer a one-question-at-a-time MCQ / true-false quiz. `correctIndices` is
   * one option index per question (in order); the last click submits, every
   * earlier one advances. The answer key never reaches the DOM — the caller
   * knows the indices only because it (or the seed content) authored them.
   */
  async answerMcqQuiz(correctIndices: number[]): Promise<void> {
    await this.quizQuestion.waitFor({ state: 'visible', timeout: 45_000 })
    for (let i = 0; i < correctIndices.length; i++) {
      await this.quizOption.nth(correctIndices[i]).click()
      if (i < correctIndices.length - 1) {
        await this.quizNext.click()
      } else {
        await this.quizSubmit.click()
      }
    }
  }

  /** The crest count integer shown inside Bar #1 (the `.figure.crest` readout). */
  async crestCountValue(): Promise<number> {
    const text = (await this.barKnowledge.locator('.figure.crest').innerText()).trim()
    const match = text.match(/(\d+)/)
    return match ? Number(match[1]) : NaN
  }

  /** The current-XP integer parsed out of the `xp-total` readout (e.g. "15 XP" → 15). */
  async xpValue(): Promise<number> {
    const text = (await this.xpTotal.innerText()).trim()
    const match = text.match(/(\d+)/)
    return match ? Number(match[1]) : NaN
  }

  /**
   * Navigate to `/dashboard/learn` and wait for the map (or the degraded card)
   * to settle. The cold start (client tz fetch) resolves into one of these —
   * never assume SSR HTML.
   */
  async goto(settleTimeout = 30_000): Promise<void> {
    await this.page.goto('/dashboard/learn')
    await this.waitForSettled(settleTimeout)
  }

  /**
   * Wait until the map has resolved into a terminal state (rendered map OR the
   * error card). The cold-start client tz-fetch chain runs against the
   * single-threaded QA Django dev server, which under the suite's parallel load
   * can take well over 15s — hence the generous ceiling (the page itself renders
   * correctly; this only absorbs server contention).
   */
  async waitForSettled(timeout = 30_000): Promise<void> {
    await this.map.or(this.error).first().waitFor({ state: 'visible', timeout })
  }

  /** The `map-topic` element for a specific topic slug. */
  topic(slug: string): Locator {
    return this.page.locator(`[data-testid="map-topic"][data-topic-slug="${slug}"]`)
  }

  /** The `topic-crest` readout inside a specific topic. */
  topicCrest(slug: string): Locator {
    return this.topic(slug).getByTestId('topic-crest')
  }

  /** Level nodes inside a specific topic, optionally filtered by derived status. */
  nodesInTopic(slug: string, status?: string): Locator {
    const sel = status
      ? `[data-testid="map-level-node"][data-node-status="${status}"]`
      : '[data-testid="map-level-node"]'
    return this.topic(slug).locator(sel)
  }

  /** All level nodes on the map carrying a given derived `data-node-status`. */
  nodesByStatus(status: string): Locator {
    return this.page.locator(`[data-testid="map-level-node"][data-node-status="${status}"]`)
  }

  /** The current-streak integer parsed out of the `map-streak` readout. */
  async currentStreak(): Promise<number> {
    const text = (await this.mapStreak.innerText()).trim()
    const match = text.match(/(\d+)/)
    return match ? Number(match[1]) : NaN
  }
}
