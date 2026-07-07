import { Page, Locator } from '@playwright/test'

/**
 * Page object for the curriculum **island-hub** map (`/dashboard/learn`).
 *
 * Phase 27 rebuilt the map into an island hub: 9 section-islands in an adaptive
 * collapsed grid with a single-open accordion. The active island (the one holding
 * the canonical current node) is expanded by default; every OTHER island's body
 * stays in the DOM but `hidden` (`display:none`) — so attribute/count reads still
 * work, but a node inside a collapsed island must be EXPANDED before it can be
 * interacted with. Node-open helpers here expand the containing island first
 * (`expandIslandFor` / `openCurrentNode`).
 *
 * Phase 27 also interposed a completion / reward screen (`step-completion`) inside
 * the host after a lesson / quiz / scenario / sandbox step or a self-attest
 * mission finishes a level — BEFORE the host closes. Its `completion-continue`
 * button emits the terminal close. The terminal player helpers here ABSORB that
 * screen (click Continue when it appears) so the legacy `host-hidden` / `xpValue`
 * assertions keep working; a NON-terminal step (the level has more steps) shows
 * the next player instead and the absorb is a no-op. Row-verified missions keep
 * their own enriched `verifier-snapshot` phase and never reach this screen.
 *
 * The page keeps the Phase-18 `savvo_tz` cold-start contract (see
 * `+page.server.ts`): the VERY FIRST visit without a `savvo_tz` cookie returns
 * `needsTz` server-side and the CLIENT performs the tz-capturing
 * `GET /api/curriculum/map/?tz=<Intl>` before the map renders. So every reader
 * here waits for the final rendered state (`curriculum-map` visible) rather than
 * assuming SSR HTML.
 *
 * The map hero keeps the DOM-unique `auri-character` testid; the mini-Auri inside
 * a player is `player-auri`, and the celebration Auri on the reward screen is
 * `completion-auri`.
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

  // Island hub (Phase 27) — Continue CTA + per-island accordion chrome
  readonly continueCta: Locator
  readonly islandToggle: Locator
  readonly islandState: Locator
  readonly islandNext: Locator

  // Two-bar topbar + streak
  readonly barKnowledge: Locator
  readonly xpTotal: Locator
  readonly barDoing: Locator
  readonly mapStreak: Locator

  // Bar #2 (Net Wealth) live readout + tap-through breakdown (Phase 25)
  readonly netWealthFigure: Locator
  readonly netWealthCompletenessHint: Locator
  readonly netWealthScoreNote: Locator
  readonly netWealthBreakdown: Locator
  readonly netWealthTotal: Locator
  readonly netWealthCompleteness: Locator
  readonly netWealthAccountList: Locator
  readonly netWealthAccountRows: Locator

  // Auri (map hero) + step-player host
  readonly auriCharacter: Locator
  readonly stepPlayerHost: Locator
  readonly stepHostClose: Locator

  // Step players (Phase 22)
  readonly stepPlayer: Locator
  readonly crestReveal: Locator

  // Player-Auri + reaction line (Phase 27) — DOM-distinct from the map hero
  readonly playerAuri: Locator
  readonly playerReaction: Locator

  // Completion / reward screen (Phase 27)
  readonly stepCompletion: Locator
  readonly completionXp: Locator
  readonly completionContinue: Locator
  readonly completionAuri: Locator

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
  readonly quizBack: Locator

  // Scenario player (Phase 26 — 🎭 branching decision sim)
  readonly scenarioNode: Locator
  readonly scenarioOption: Locator
  readonly scenarioFeedback: Locator
  readonly scenarioContinue: Locator
  readonly scenarioDone: Locator

  // Sandbox player (Phase 26 — 🧮 labeled-hypothetical calculator)
  readonly sandboxBanner: Locator
  readonly sandboxCalculator: Locator
  readonly sandboxDone: Locator

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

    this.continueCta = page.getByTestId('continue-cta')
    this.islandToggle = page.getByTestId('island-toggle')
    this.islandState = page.getByTestId('island-state')
    this.islandNext = page.getByTestId('island-next')

    this.barKnowledge = page.getByTestId('bar-knowledge')
    this.xpTotal = page.getByTestId('xp-total')
    this.barDoing = page.getByTestId('bar-doing')
    this.mapStreak = page.getByTestId('map-streak')

    this.netWealthFigure = page.getByTestId('net-wealth-figure')
    this.netWealthCompletenessHint = page.getByTestId('net-wealth-completeness-hint')
    this.netWealthScoreNote = page.getByTestId('net-wealth-score-note')
    this.netWealthBreakdown = page.getByTestId('net-wealth-breakdown')
    this.netWealthTotal = page.getByTestId('net-wealth-total')
    this.netWealthCompleteness = page.getByTestId('net-wealth-completeness')
    this.netWealthAccountList = page.getByTestId('net-wealth-account-list')
    this.netWealthAccountRows = page.getByTestId('net-wealth-account-row')

    this.auriCharacter = page.getByTestId('auri-character')
    this.stepPlayerHost = page.getByTestId('step-player-host')
    this.stepHostClose = page.getByTestId('step-host-close')

    this.stepPlayer = page.getByTestId('step-player')
    this.crestReveal = page.getByTestId('crest-reveal')

    this.playerAuri = page.getByTestId('player-auri')
    this.playerReaction = page.getByTestId('player-reaction')

    this.stepCompletion = page.getByTestId('step-completion')
    this.completionXp = page.getByTestId('completion-xp')
    this.completionContinue = page.getByTestId('completion-continue')
    this.completionAuri = page.getByTestId('completion-auri')

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
    // The quiz "Next" / "Back" affordances carry no testid (only the last-question
    // "Submit" does), so they are addressed by their accessible names.
    this.quizNext = page.getByRole('button', { name: /Next/ })
    this.quizBack = page.getByRole('button', { name: 'Previous question' })

    this.scenarioNode = page.getByTestId('scenario-node')
    this.scenarioOption = page.getByTestId('scenario-option')
    this.scenarioFeedback = page.getByTestId('scenario-feedback')
    this.scenarioContinue = page.getByTestId('scenario-continue')
    this.scenarioDone = page.getByTestId('scenario-done')

    this.sandboxBanner = page.getByTestId('sandbox-banner')
    this.sandboxCalculator = page.getByTestId('sandbox-calculator')
    this.sandboxDone = page.getByTestId('sandbox-done')

    this.missionVerify = page.getByTestId('mission-verify')
    this.missionDeeplink = page.getByTestId('mission-deeplink')
    this.missionSelfAttest = page.getByTestId('mission-self-attest')
    this.missionFailNote = page.getByTestId('mission-fail-note')
    this.verifierSnapshot = page.getByTestId('verifier-snapshot')
    this.snapshotFigure = page.getByTestId('snapshot-figure')
    // The row-verified PASS "Continue" button (advances/closes the host) has no
    // testid — addressed by its accessible name, SCOPED to the host so it never
    // collides with the map's `continue-cta` hero (whose name also has "Continue").
    this.missionContinue = this.stepPlayerHost.getByRole('button', { name: /Continue/ })

    this.spacePicker = page.getByTestId('space-picker')
    this.spacePickerEmpty = page.getByTestId('space-picker-empty')
    this.spacePickerError = page.getByTestId('space-picker-error')
    this.spacePickerCreate = page.getByTestId('space-picker-create')
    this.pickerRadios = this.spacePicker.getByRole('radio')
  }

  /** The `map-section` island for a specific section slug. */
  mapSection(slug: string): Locator {
    return this.page.locator(`[data-testid="map-section"][data-section-slug="${slug}"]`)
  }

  /**
   * The single-open accordion collapses every non-active island body to
   * `display:none`, so a node inside a collapsed island can't be clicked until its
   * island is expanded. Locate the `map-section` that CONTAINS `topicSlug`, click
   * its `island-toggle` when `aria-expanded` is not already `true`, then wait for
   * the topic's body to be revealed. A no-op when the island is already open.
   */
  async expandIslandFor(topicSlug: string, timeout = 15_000): Promise<void> {
    const section = this.page
      .locator(`[data-testid="map-section"]:has([data-topic-slug="${topicSlug}"])`)
      .first()
    const toggle = section.getByTestId('island-toggle')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click()
    }
    // Removing the `hidden` attribute un-hides the body (display:none → flex), so
    // the topic (and its nodes) becomes visible — wait for that before interacting.
    await this.topic(topicSlug).first().waitFor({ state: 'visible', timeout })
  }

  /**
   * Expand the island holding the FIRST map node of a given derived status and
   * return that (now-visible) node locator. Used where a spec taps a node that may
   * live in a collapsed island (e.g. a `coming_soon` or `locked` node not in the
   * default-open active island).
   */
  async revealFirstNodeByStatus(status: string, timeout = 15_000): Promise<Locator> {
    const section = this.page
      .locator(
        `[data-testid="map-section"]:has([data-testid="map-level-node"][data-node-status="${status}"])`,
      )
      .first()
    const toggle = section.getByTestId('island-toggle')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click()
    }
    const node = section
      .locator(`[data-testid="map-level-node"][data-node-status="${status}"]`)
      .first()
    await node.waitFor({ state: 'visible', timeout })
    return node
  }

  /**
   * Open a topic's sole `current` node and wait for the step player to mount. The
   * containing island is expanded first (Phase 27 accordion), so the node is
   * interactable even when it sits in a collapsed island.
   */
  async openCurrentNode(topicSlug: string, timeout = 45_000): Promise<void> {
    await this.expandIslandFor(topicSlug)
    await this.nodesInTopic(topicSlug, 'current').first().click()
    await this.stepPlayerHost.waitFor({ state: 'visible', timeout })
    await this.stepPlayer.waitFor({ state: 'visible', timeout })
  }

  /**
   * Absorb the Phase-27 completion / reward screen after a terminal player action.
   *
   * The host settles into ONE of three states after a lesson / quiz / scenario /
   * sandbox player (or a self-attest mission) finishes: (a) the reward screen
   * (`step-completion`) — the level finished, dismiss it via `completion-continue`;
   * (b) the next step's player — the level has more steps, leave it; (c) the host
   * already closed (defensive). We grab the just-active player, wait until it is
   * replaced, then click Continue ONLY when the reward screen is what came up.
   * Row-verified missions celebrate in their own snapshot phase and never land here.
   */
  async absorbCompletionScreen(timeout = 45_000): Promise<void> {
    const handle = await this.stepPlayer
      .first()
      .elementHandle({ timeout })
      .catch(() => null)
    if (handle) {
      await this.page
        .waitForFunction((el) => !(el as Element).isConnected, handle, { timeout })
        .catch(() => {})
      await handle.dispose().catch(() => {})
    }
    // Settle into the post-action state (the reward screen OR the next player)
    // before deciding — catches the reward screen's same-tick mount without a sleep.
    await this.stepCompletion
      .or(this.stepPlayer)
      .first()
      .waitFor({ state: 'visible', timeout })
      .catch(() => {})
    if (await this.stepCompletion.isVisible().catch(() => false)) {
      await this.completionContinue.click()
    }
  }

  /**
   * Advance a Lesson deck to the end and mark it done. Card-count-agnostic
   * (works for a 2- or 4-card deck) AND interactive-card-aware (Phase 24, Lesson
   * Format v2): a `choice` / `this_or_that` / `spot_error` card keeps the advance
   * control DISABLED until an option is tapped, so on each card we detect the
   * disabled control and tap the first option (any answer proceeds — formative,
   * no XP, no fail) before advancing. Returns the number of interactive cards
   * that had to be answered (0 for an all-text deck).
   *
   * When the lesson is the level's terminal step the host interposes the Phase-27
   * completion screen; by default this helper ABSORBS it (clicks Continue) so
   * `host-hidden` / `xpValue` assertions keep working. Pass `absorbCompletion:
   * false` to leave the reward screen up (e.g. a spec asserting on it).
   */
  async playLessonDeck({ absorbCompletion = true }: { absorbCompletion?: boolean } = {}): Promise<number> {
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
      if (onLast) {
        if (absorbCompletion) await this.absorbCompletionScreen()
        return interactiveTapped
      }
    }
    return interactiveTapped
  }

  /**
   * Answer a one-question-at-a-time MCQ / true-false quiz. `correctIndices` is
   * one option index per question (in order); the last click submits, every
   * earlier one advances. The answer key never reaches the DOM — the caller
   * knows the indices only because it (or the seed content) authored them.
   *
   * A passing submission on the level's terminal step raises the Phase-27
   * completion screen; this helper absorbs it (no-op when the quiz is a mid-level
   * step and the host advances to the next player instead).
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
    await this.absorbCompletionScreen()
  }

  /**
   * Walk a 🎭 Scenario from its entry node to a terminal and mark it done. At
   * each node it taps the FIRST option (any choice advances — a scenario has no
   * fail state), waits for that option's formative `scenario-feedback`, then
   * either clicks `scenario-done` (a terminal option → completes the step) or
   * `scenario-continue` to advance to the next node. Depth-agnostic (works for a
   * 2-node fixture or the 5-node term-deposits boss). The terminal `Done` finishes
   * the level, so the Phase-27 completion screen is absorbed at the end.
   */
  async playScenarioToEnd(): Promise<void> {
    await this.scenarioNode.first().waitFor({ state: 'visible', timeout: 45_000 })
    for (let i = 0; i < 25; i++) {
      await this.scenarioOption.first().click()
      await this.scenarioFeedback.first().waitFor({ state: 'visible', timeout: 45_000 })
      if ((await this.scenarioDone.count()) > 0) {
        await this.scenarioDone.click()
        await this.absorbCompletionScreen()
        return
      }
      await this.scenarioContinue.click()
    }
    throw new Error('scenario never reached a terminal node within 25 hops')
  }

  /**
   * Complete a 🧮 Sandbox step: assert the mandatory hypothetical banner is
   * present (it must render before any interaction), then click "Done" and absorb
   * the Phase-27 completion screen when the sandbox is the level's terminal step
   * (a no-op when the level advances to the next player).
   */
  async completeSandbox(): Promise<void> {
    await this.sandboxBanner.waitFor({ state: 'visible', timeout: 45_000 })
    await this.sandboxDone.click()
    await this.absorbCompletionScreen()
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
   * Tap the live Bar #2 (Net Wealth) figure and wait for the per-account
   * breakdown modal to open (Phase 25). Only valid when `bar-doing` is `live`.
   */
  async openNetWealthBreakdown(timeout = 45_000): Promise<void> {
    await this.barDoing.click()
    await this.netWealthBreakdown.waitFor({ state: 'visible', timeout })
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
