/**
 * Fixture-step pre-seed — runs as the `setup` project before every browser
 * project (playwright `dependencies`).
 *
 * WHY THIS EXISTS: global-setup FLUSHES the QA DB before every run, so the
 * shared `qa-fixture-*` Steps do not exist when the parallel test phase
 * starts. Player specs create them mid-run — and FIXTURE_TOPIC is
 * `smart-spending`, the ROOT of the prereq chain that saving / net-wealth /
 * interest / term-deposits specs chain-complete via `seed/level-state`. A
 * fixture Step INSERTED into that topic after a worker already completed its
 * levels makes the topic read incomplete again, which re-locks every
 * downstream topic for that worker's user (the interest specs flaked exactly
 * this way: zero `current` nodes, chain stuck `locked`).
 *
 * Seeding the curriculum tree + the FULL fixture set ONCE, before any browser
 * project, turns every in-test `seedPlayerFixtures` call into a pure
 * idempotent update on `(level, slug)` — no new Step rows can appear mid-run,
 * so chain completion can never be invalidated behind a running test.
 *
 * Any NEW fixture step added later MUST go into `seedPlayerFixtures` (not an
 * ad-hoc `seedStep` in a spec) so this pre-seed keeps covering the whole set.
 */
import { test } from '../../fixtures/index'
import { seedPlayerFixtures } from '../../helpers/curriculumFixtures'

test('pre-seed the curriculum tree + qa-fixture steps', async ({ loggedInPage }) => {
  const { api } = loggedInPage
  await seedPlayerFixtures(api) // getCurriculumMap inside also seeds the content tree
})
