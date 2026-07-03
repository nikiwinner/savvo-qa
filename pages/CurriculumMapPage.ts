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
