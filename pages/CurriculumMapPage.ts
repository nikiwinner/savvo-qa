import { Page, Locator, expect } from '@playwright/test'

/**
 * Page object for the curriculum **world map** (`/dashboard/learn`).
 *
 * Phase 28 rebuilt the map into a game-like world map: 9 chapter-islands
 * (sections) threaded along a road that snakes DOWN the page (islands alternate
 * hard left / hard right; the page itself scrolls — there is no inner scroller and
 * no separate mobile layout). Each island is hand-drawn art (`island-art`) plus
 * its floating rocks (`island-rock`), cut out of the same bitmap and drifting
 * independently. The two progress bars and Continue live in a sticky RAIL to the
 * right of the map (they unstack above it below 768px). Desktop DEFAULT = the
 * world map (no island focused); clicking an island's `island-toggle` ZOOMS into a focus mode
 * where the whole stage becomes that chapter's vertical level path (its topics +
 * level nodes), and a `focus-back` button returns to the world map. The
 * single-open contract is preserved: a section's `island-toggle` carries
 * `aria-expanded = (it is the focused chapter)` and its body (topics/nodes) is
 * shown ONLY while focused — every OTHER section's body stays in the DOM but
 * hidden (`display:none`), so attribute/count reads still work while a node
 * inside it must be FOCUSED before it can be interacted with. Node-open helpers
 * here focus the containing chapter first (`expandIslandFor` / `openCurrentNode`
 * / `revealFirstNodeByStatus`); `expandIslandFor` is kept as the historical name
 * for "focus the chapter that holds this topic" so its many callers are unchanged.
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
 */
export class CurriculumMapPage {
  readonly page: Page

  // Containers / degraded state
  readonly learnPage: Locator
  readonly map: Locator
  readonly error: Locator
  readonly retryButton: Locator

  /** The floating "Back to your lesson" pill — shown OFF Learn while a mission's
   *  deep-link excursion is open, hidden on Learn itself (the map reopens the
   *  step on its own). Rendered by the dashboard layout, not by the map. */
  readonly resumePill: Locator
  readonly resumeContinue: Locator

  // Tree
  readonly sections: Locator
  readonly sectionCrests: Locator
  readonly topics: Locator
  readonly topicCrests: Locator
  readonly levelNodes: Locator

  // World map (Phase 28) — Continue + per-island chrome + focus back button.
  // `chapterCard` (and therefore `sectionCrests` / `islandState` / `islandNext`,
  // which live INSIDE it) renders on the ACTIVE chapter ONLY — every other chapter
  // wears a quiet `chapter-nameplate`. Expect exactly ONE of each on the map.
  readonly continueCta: Locator
  readonly islandToggle: Locator
  readonly islandArt: Locator
  readonly islandRock: Locator
  readonly chapterCard: Locator
  readonly chapterNameplate: Locator
  readonly islandState: Locator
  readonly islandNext: Locator
  readonly focusBack: Locator

  // Two-bar topbar + streak
  readonly barKnowledge: Locator
  readonly xpTotal: Locator
  readonly barDoing: Locator
  readonly guideMessage: Locator
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

  readonly stepPlayerHost: Locator
  readonly stepHostClose: Locator

  // Step players (Phase 22)
  readonly stepPlayer: Locator
  readonly crestReveal: Locator

  readonly playerReaction: Locator

  // Completion / reward screen (Phase 27)
  readonly stepCompletion: Locator
  readonly completionXp: Locator
  readonly completionContinue: Locator

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
  /** The explanation shown under a MISSED question on the fail review. */
  readonly quizFeedback: Locator
  readonly quizRetry: Locator
  readonly quizNext: Locator
  readonly quizBack: Locator
  /** Phase 31 — the single practice control: step on, replay, or submit. */
  readonly quizAdvance: Locator
  /** Phase 31 — an `order` question is arranged, then committed with this. */
  readonly quizCheck: Locator
  /** Phase 31 — an `order` miss spells its sequence out; there is no option to mark. */
  readonly quizCorrectOrder: Locator
  /** Phase 31 — the lesson deck's review-round control. */
  readonly lessonReviewNext: Locator
  /** The interactive card's question line — the key `playLessonDeck` learns answers by. */
  readonly lessonCardPrompt: Locator

  // Scenario player (Phase 26 — 🎭 branching decision sim)
  readonly scenarioNode: Locator
  readonly scenarioOption: Locator
  readonly scenarioFeedback: Locator
  readonly scenarioContinue: Locator
  readonly scenarioDone: Locator

  // Sandbox player (Phase 26 — 🧮 labeled-hypothetical calculator)
  readonly sandboxBanner: Locator
  readonly sandboxCalculator: Locator
  readonly sandboxChart: Locator
  readonly sandboxDone: Locator

  // Mission player + verify snapshot (Phase 22/23)
  readonly missionVerify: Locator
  readonly missionDeeplink: Locator
  readonly missionSelfAttest: Locator
  readonly missionFailNote: Locator
  readonly verifierSnapshot: Locator
  readonly snapshotFigure: Locator
  readonly missionContinue: Locator

  // Guided-v2 mission flow (Phase 29 Amendment 1) — path chooser, per-screen
  // controls, the self-attest terminal + the two keyed completion leads.
  readonly missionPath: Locator
  readonly missionScreen: Locator
  readonly missionScreenOption: Locator
  readonly missionScreenInput: Locator
  readonly missionScreenNext: Locator
  readonly missionAttest: Locator
  // The Phase-30 accountability confirm on honour-based completions
  readonly attestConfirm: Locator
  readonly attestConfirmTitle: Locator
  readonly attestConfirmMessage: Locator
  readonly attestConfirmYes: Locator
  readonly attestConfirmNotYet: Locator
  readonly missionReportedLead: Locator
  readonly missionPassLead: Locator

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
    this.resumePill = page.getByTestId('learn-resume')
    this.resumeContinue = page.getByTestId('learn-resume-continue')

    this.sections = page.getByTestId('map-section')
    this.sectionCrests = page.getByTestId('section-crest')
    this.topics = page.getByTestId('map-topic')
    this.topicCrests = page.getByTestId('topic-crest')
    this.levelNodes = page.getByTestId('map-level-node')

    this.continueCta = page.getByTestId('continue-cta')
    this.islandToggle = page.getByTestId('island-toggle')
    this.islandArt = page.getByTestId('island-art')
    this.islandRock = page.getByTestId('island-rock')
    this.chapterCard = page.getByTestId('chapter-card')
    this.chapterNameplate = page.locator('.chapter-nameplate')
    this.islandState = page.getByTestId('island-state')
    this.islandNext = page.getByTestId('island-next')
    this.focusBack = page.getByTestId('focus-back')

    this.barKnowledge = page.getByTestId('bar-knowledge')
    this.xpTotal = page.getByTestId('xp-total')
    this.barDoing = page.getByTestId('bar-doing')
    this.guideMessage = page.getByTestId('guide-message')
    this.mapStreak = page.getByTestId('map-streak')

    this.netWealthFigure = page.getByTestId('net-wealth-figure')
    this.netWealthCompletenessHint = page.getByTestId('net-wealth-completeness-hint')
    this.netWealthScoreNote = page.getByTestId('net-wealth-score-note')
    this.netWealthBreakdown = page.getByTestId('net-wealth-breakdown')
    this.netWealthTotal = page.getByTestId('net-wealth-total')
    this.netWealthCompleteness = page.getByTestId('net-wealth-completeness')
    this.netWealthAccountList = page.getByTestId('net-wealth-account-list')
    this.netWealthAccountRows = page.getByTestId('net-wealth-account-row')

    this.stepPlayerHost = page.getByTestId('step-player-host')
    this.stepHostClose = page.getByTestId('step-host-close')

    this.stepPlayer = page.getByTestId('step-player')
    this.crestReveal = page.getByTestId('crest-reveal')

    this.playerReaction = page.getByTestId('player-reaction')

    this.stepCompletion = page.getByTestId('step-completion')
    this.completionXp = page.getByTestId('completion-xp')
    this.completionContinue = page.getByTestId('completion-continue')

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
    this.quizFeedback = page.getByTestId('quiz-feedback')
    this.quizRetry = page.getByTestId('quiz-retry')
    // The quiz "Next" / "Back" affordances carry no testid (only the last-question
    // "Submit" does), so they are addressed by their accessible names.
    this.quizNext = page.getByRole('button', { name: /Next/ })
    this.quizBack = page.getByRole('button', { name: 'Previous question' })
    this.quizAdvance = page.getByTestId('quiz-advance')
    this.quizCheck = page.getByTestId('quiz-check')
    this.quizCorrectOrder = page.getByTestId('quiz-correct-order')
    this.lessonReviewNext = page.getByTestId('lesson-review-next')
    this.lessonCardPrompt = page.getByTestId('lesson-card-prompt')

    this.scenarioNode = page.getByTestId('scenario-node')
    this.scenarioOption = page.getByTestId('scenario-option')
    this.scenarioFeedback = page.getByTestId('scenario-feedback')
    this.scenarioContinue = page.getByTestId('scenario-continue')
    this.scenarioDone = page.getByTestId('scenario-done')

    this.sandboxBanner = page.getByTestId('sandbox-banner')
    this.sandboxCalculator = page.getByTestId('sandbox-calculator')
    this.sandboxChart = page.getByTestId('sandbox-chart')
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

    this.missionPath = page.getByTestId('mission-path')
    this.missionScreen = page.getByTestId('mission-screen')
    this.missionScreenOption = page.getByTestId('mission-screen-option')
    this.missionScreenInput = page.getByTestId('mission-screen-input')
    this.missionScreenNext = page.getByTestId('mission-screen-next')
    this.missionAttest = page.getByTestId('mission-attest')
    // Located by testid, NOT by its title: the title is drawn at random from the
    // pool in `helpers/attestConfirm.ts` on every open. A role+name lookup is out
    // for the same reason, and a bare `getByRole('dialog')` is ambiguous — the
    // player host is a dialog too, and the confirm renders inside it.
    this.attestConfirm = page.getByTestId('confirm-dialog')
    this.attestConfirmTitle = this.attestConfirm.getByRole('heading')
    this.attestConfirmMessage = this.attestConfirm.locator('p.dialog-message')
    this.attestConfirmYes = this.attestConfirm.getByRole('button', { name: 'I did it' })
    this.attestConfirmNotYet = this.attestConfirm.getByRole('button', { name: 'Not yet — take me back' })
    this.missionReportedLead = page.getByTestId('mission-reported-lead')
    this.missionPassLead = page.getByTestId('mission-pass-lead')

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
   * If a chapter is currently in focus mode, click `focus-back` to return to the
   * world map (where the island toggles are visible + clickable). No-op on the
   * world map (the `focus-back` control is only rendered in focus mode).
   */
  async ensureWorldMode(timeout = 15_000): Promise<void> {
    if (await this.focusBack.isVisible().catch(() => false)) {
      await this.focusBack.click()
      await this.focusBack.waitFor({ state: 'hidden', timeout }).catch(() => {})
    }
  }

  /**
   * Focus a chapter-island so its level path is on-stage. No-op when it is already
   * the focused chapter (`aria-expanded="true"`); otherwise return to the world
   * map first (so the target island toggle is clickable), click it, and wait until
   * focus mode is up (`focus-back` visible). Single-open: focusing one chapter
   * un-focuses the rest.
   */
  private async focusSection(section: Locator, timeout = 15_000): Promise<void> {
    const toggle = section.getByTestId('island-toggle')
    if ((await toggle.getAttribute('aria-expanded')) === 'true') return
    await this.ensureWorldMode(timeout)
    await toggle.waitFor({ state: 'visible', timeout })
    await toggle.click()
    await this.focusBack.waitFor({ state: 'visible', timeout })
  }

  /**
   * Focus the chapter that CONTAINS `topicSlug`, then wait for that topic's body to
   * be revealed. Kept under its historical name — every player / mission /
   * net-wealth spec calls `expandIslandFor(topic)` then taps a node in the topic;
   * focusing the chapter makes those nodes visible + interactable exactly as the
   * old accordion expand did. A no-op when the chapter is already focused.
   */
  async expandIslandFor(topicSlug: string, timeout = 15_000): Promise<void> {
    const section = this.page
      .locator(`[data-testid="map-section"]:has([data-topic-slug="${topicSlug}"])`)
      .first()
    await this.focusSection(section, timeout)
    // Focus mode reveals the chapter's body (topics + nodes) — wait before use.
    await this.topic(topicSlug).first().waitFor({ state: 'visible', timeout })
  }

  /**
   * Focus the chapter holding the FIRST map node of a given derived status and
   * return that (now-visible) node locator. Used where a spec taps a node that may
   * live in a chapter other than the current one (e.g. a `coming_soon` or `locked`
   * node).
   */
  async revealFirstNodeByStatus(status: string, timeout = 15_000): Promise<Locator> {
    const section = this.page
      .locator(
        `[data-testid="map-section"]:has([data-testid="map-level-node"][data-node-status="${status}"])`,
      )
      .first()
    await this.focusSection(section, timeout)
    const node = section
      .locator(`[data-testid="map-level-node"][data-node-status="${status}"]`)
      .first()
    await node.waitFor({ state: 'visible', timeout })
    return node
  }

  /**
   * Open a topic's sole `current` node and wait for the step player to mount. The
   * containing chapter is focused first (Phase 28 world map), so the node is
   * interactable.
   */
  async openCurrentNode(topicSlug: string, timeout = 45_000): Promise<void> {
    await this.expandIslandFor(topicSlug, timeout)
    await this.nodesInTopic(topicSlug, 'current').first().click()
    await this.stepPlayerHost.waitFor({ state: 'visible', timeout })
    await this.stepPlayer.waitFor({ state: 'visible', timeout })
  }

  /**
   * Open ONE named level node and wait for the step player to mount.
   *
   * Phase 32 made `openCurrentNode` structurally too narrow: once missions stop
   * gating, the level holding a mission is usually NOT the `current` one — it is
   * a `completed` road level with an optional mission still inside, or an
   * `optional` side-quest level that is never `current` by design. Both are
   * reachable, so a spec that wants a specific level asks for it by slug.
   */
  async openLevelNode(topicSlug: string, levelSlug: string, timeout = 45_000): Promise<void> {
    await this.expandIslandFor(topicSlug, timeout)
    const node = this.topic(topicSlug).locator(
      `[data-testid="map-level-node"][data-level-slug="${levelSlug}"]`,
    )
    await node.waitFor({ state: 'visible', timeout })
    await node.click()
    await this.stepPlayerHost.waitFor({ state: 'visible', timeout })
    await this.stepPlayer.waitFor({ state: 'visible', timeout })
  }

  /** The derived `data-node-status` of ONE named level node. */
  async levelNodeStatus(topicSlug: string, levelSlug: string): Promise<string | null> {
    return this.topic(topicSlug)
      .locator(`[data-testid="map-level-node"][data-level-slug="${levelSlug}"]`)
      .getAttribute('data-node-status')
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
   *
   * The INITIAL attach gets a SHORT (2s) budget, NOT the full `timeout` (I2b): when
   * the completion swap wins the race and unmounts the just-active player before we
   * grab it, the old full-`timeout` `elementHandle` stalled the whole 45s waiting
   * for a player that will never appear. With the short budget a lost race falls
   * straight through to the settle path (reward screen / next player / already-
   * closed) and recovers immediately, while a player that IS still up is tracked
   * until it detaches (the level-close swap) exactly as before.
   */
  async absorbCompletionScreen(timeout = 45_000, { awaitUnmount = true } = {}): Promise<void> {
    // `awaitUnmount: false` for a caller that has ALREADY waited for the old
    // player to go. Otherwise this grabs whatever is mounted NOW — which by then
    // is the NEXT step's player — and waits the full timeout for it to
    // disconnect, swallowing the failure. That silent 45s is what made a
    // three-player test take 98s instead of 5s.
    const handle = awaitUnmount
      ? await this.stepPlayer
          .first()
          .elementHandle({ timeout: 2_000 })
          .catch(() => null)
      : null
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
   * Walk a guided-v2 mission flow (Phase 29 Amendment 1) from its first screen to
   * the terminal control — the `mission-attest` button (self-attest) or
   * `mission-verify` (row-verified) — handing control back to the caller there.
   *
   * `pathId` optionally picks a path first: the chooser (`mission-path`) renders
   * ONLY when the mission has >1 path (a single-path mission auto-selects and shows
   * no chooser), so this is a no-op on a single-path mission — call it bare.
   *
   * Per screen (`mission-screen`, keyed by `data-screen-kind`): a `choice` is a
   * FORMATIVE picker → tap the first option (any pick unlocks Next, no verdict); an
   * `input` gets one throwaway line (page-state only, never posted); an `action` is
   * just an instruction → the deep-link is NOT tapped (that would navigate away).
   * Then advance. It stops the instant the screen block is gone and the terminal is
   * up (the two are mutually exclusive Svelte branches).
   */
  async walkMissionFlow(pathId?: string): Promise<void> {
    if (pathId !== undefined) {
      const path = this.page.locator(`[data-testid="mission-path"][data-path-id="${pathId}"]`)
      await path.waitFor({ state: 'visible', timeout: 45_000 })
      await path.click()
    }
    // ≤3 screens + the terminal — the cap is a safety net against a stuck flow.
    for (let i = 0; i < 5; i++) {
      await this.missionScreen
        .or(this.missionAttest)
        .or(this.missionVerify)
        .first()
        .waitFor({ state: 'visible', timeout: 45_000 })
      // Terminal reached (the screen block is gone) — hand back to the caller.
      if ((await this.missionScreen.count()) === 0) return
      const kind = await this.missionScreen.getAttribute('data-screen-kind')
      if (kind === 'choice') {
        await this.missionScreenOption.first().click()
      } else if (kind === 'input') {
        await this.missionScreenInput.fill('QA note')
      } else if (kind !== 'action') {
        // A 4th screen kind must be walked deliberately, never blind-Nexted.
        throw new Error(`walkMissionFlow: unknown screen kind '${kind}' — extend the walker`)
      }
      await this.missionScreenNext.click()
    }
    throw new Error('mission flow never reached the attest/verify terminal within 5 screens')
  }

  /**
   * Tap a self-attest mission's terminal `mission-attest` button (the explicit
   * attestation NAMING the action). A reported pass then shows its OWN pass screen
   * (`mission-reported-lead` + Continue) — NOT the separate Phase-27 reward screen
   * (the mission `refresh` already marked the step done) — so the caller drives
   * `missionContinue` to close the host; there is no `absorbCompletionScreen` here.
   */
  async attestMission(): Promise<void> {
    await this.missionAttest.click()
    await this.answerAttestConfirm()
  }

  /**
   * Tap a v1 self-attest mission's "Mark done" (rendered on the `mission-verify`
   * button) and answer the Phase-30 accountability confirm with "I did it".
   * Row-verified missions never show the confirm — keep clicking
   * `missionVerify` directly for those.
   */
  async markDone(): Promise<void> {
    await this.missionVerify.click()
    await this.answerAttestConfirm()
  }

  /** Phase 30 (30.2): every honour-based completion asks once before it counts. */
  private async answerAttestConfirm(): Promise<void> {
    await this.attestConfirm.waitFor({ state: 'visible', timeout: 45_000 })
    await this.attestConfirmYes.click()
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
    // Phase 31 — walking a deck to its END now means clearing its review queue
    // too: a missed tap-card is replayed before the lesson can be marked read, so
    // "any answer proceeds" is no longer true. The right option is LEARNED from
    // the first reveal (`data-state="correct"`), keyed by the card's prompt,
    // because the authored key never reaches the DOM before an attempt.
    const learned = new Map<string, number>()

    const answerCurrentCard = async (): Promise<void> => {
      const prompt = (await this.lessonCardPrompt.innerText()).trim()
      const known = learned.get(prompt)
      await this.lessonOption.nth(known ?? 0).click()
      interactiveTapped++
      if (known === undefined) {
        // The reveal is what teaches the helper the key — WAIT for it. Reading
        // `data-state` straight after the click can catch the pre-render DOM,
        // learn nothing, and re-tap the same wrong option every round.
        await this.lessonCardFeedback.waitFor({ state: 'visible', timeout: 45_000 })
        const states = await this.lessonOption.evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).dataset.state ?? 'idle')
        )
        const correct = states.indexOf('correct')
        if (correct >= 0) learned.set(prompt, correct)
      }
    }

    // The cap is a safety net against a stuck deck (a real deck is a handful of
    // cards, plus at most a round or two of replay).
    for (let i = 0; i < 40; i++) {
      const reviewing = (await this.lessonReviewNext.count()) > 0
      const onLast = !reviewing && (await this.lessonDone.count()) > 0
      const advance = reviewing ? this.lessonReviewNext : onLast ? this.lessonDone : this.lessonNext
      await advance.waitFor({ state: 'visible', timeout: 45_000 })
      // A disabled advance control means EITHER an unanswered interactive card or
      // a save in flight (`disabled={submitting || needsAnswer}`). Only the first
      // wants a tap — clicking into the second lands on an already-answered,
      // disabled option and hangs until the test times out.
      if (await advance.isDisabled()) {
        const waitingOnAnswer =
          (await this.lessonOption.count()) > 0 && (await this.lessonOption.first().isEnabled())
        if (waitingOnAnswer) {
          await answerCurrentCard()
        } else {
          await expect
            .poll(async () => (await this.lessonCard.count()) === 0, { timeout: 45_000 })
            .toBe(true)
          if (absorbCompletion) await this.absorbCompletionScreen(45_000, { awaitUnmount: false })
          return interactiveTapped
        }
      }
      await advance.click()
      // Done either completes the lesson or OPENS the review round; the review
      // control either moves to the next queued card or completes. Which one is
      // decided by WAITING for whichever lands — never by a fixed sleep, which is
      // a guess between two outcomes and loses that bet on a slow WebKit run.
      if (onLast || reviewing) {
        // Wait for something that actually DISCRIMINATES. `step-player` is mounted
        // in every outcome, so waiting on it resolves instantly and decides nothing
        // — the deck either keeps the review round open, or the deck itself is
        // gone (completion screen, or the host advanced to the next step).
        await expect
          .poll(
            async () =>
              (await this.lessonReviewNext.count()) > 0 || (await this.lessonCard.count()) === 0,
            { timeout: 45_000 }
          )
          .toBe(true)
        if ((await this.lessonReviewNext.count()) > 0) continue
        // The poll above already waited out the unmount — see the note there.
        if (absorbCompletion) await this.absorbCompletionScreen(45_000, { awaitUnmount: false })
        return interactiveTapped
      }
    }
    // Falling out of the loop means the deck never ended. Returning quietly would
    // let the caller's next assertion blame the wrong thing.
    throw new Error(`playLessonDeck: deck did not finish within 40 steps (tapped ${interactiveTapped})`)
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
      // Phase 31 — a PRACTICE quiz checks ON the tap and then shows ONE control
      // that steps on, replays or submits; an assessment quiz still carries the
      // Next / Submit pair. Wait for whichever this quiz renders: in practice
      // nothing is on screen until the check comes back.
      await this.quizAdvance
        .or(this.quizSubmit)
        .or(this.quizNext)
        .first()
        .waitFor({ state: 'visible', timeout: 45_000 })
      if ((await this.quizAdvance.count()) > 0) {
        await this.quizAdvance.click()
      } else if (i < correctIndices.length - 1) {
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

  /**
   * The crest count integer shown inside Bar #1. Phase 32: it counts
   * knowledge-complete TOPICS, not completed checkpoint levels.
   */
  async crestCountValue(): Promise<number> {
    const text = (await this.barKnowledge.getByTestId('crest-count').innerText()).trim()
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

  /** ONE named level node, by topic + level slug (Phase 32 `data-level-slug`). */
  levelNode(topicSlug: string, levelSlug: string): Locator {
    return this.topic(topicSlug).locator(
      `[data-testid="map-level-node"][data-level-slug="${levelSlug}"]`,
    )
  }

  /** Side-quest nodes — every step in them is an optional real-world mission. */
  sideQuestNodes(topicSlug?: string): Locator {
    const sel = '[data-testid="map-level-node"][data-side-quest="true"]'
    return topicSlug ? this.topic(topicSlug).locator(sel) : this.page.locator(sel)
  }

  /** The current-streak integer parsed out of the `map-streak` readout. */
  async currentStreak(): Promise<number> {
    const text = (await this.mapStreak.innerText()).trim()
    const match = text.match(/(\d+)/)
    return match ? Number(match[1]) : NaN
  }
}
