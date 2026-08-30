/**
 * Phase 32 — seeding the ROAD without touching a single mission.
 *
 * Every other fixture helper reaches for `seedLevelState`, which completes EVERY
 * step in a level, missions included. That cannot express the one state this
 * phase is about: the learner who finished the lessons and quizzes and has done
 * no real-world action at all. These helpers walk a topic's levels in order and
 * complete only the non-mission steps, using the leak-safe manifest to tell one
 * from the other — the manifest is readable because each level opens as soon as
 * the previous level's REQUIRED steps are done.
 */
import type { ApiHelper, CurriculumMapPayload, ManifestStep, MapLevel, MapTopic } from './api'

/** The topic node for a slug, wherever it sits in the tree. */
export function topicOf(payload: CurriculumMapPayload, slug: string): MapTopic {
  for (const section of payload.sections) {
    for (const topic of section.topics) {
      if (topic.slug === slug) return topic
    }
  }
  throw new Error(`topic ${slug} not in the map payload`)
}

/** One level node inside a topic. */
export function levelOf(
  payload: CurriculumMapPayload,
  topicSlug: string,
  levelSlug: string,
): MapLevel {
  const level = topicOf(payload, topicSlug).levels.find((l) => l.slug === levelSlug)
  if (!level) throw new Error(`level ${topicSlug}/${levelSlug} not in the map payload`)
  return level
}

/**
 * Complete the NON-mission steps of every level of `topicSlug`, in order.
 * Returns how many steps were written. Levels with no required step (pure side
 * quests) and unauthored levels are skipped untouched, so every mission in the
 * topic is left open.
 */
export async function completeRequiredSteps(api: ApiHelper, topicSlug: string): Promise<number> {
  const payload = await api.getCurriculumMap()
  let written = 0
  for (const level of [...topicOf(payload, topicSlug).levels].sort((a, b) => a.order - b.order)) {
    if (level.required_step_count === 0) continue
    // Reachable by construction: only an unfinished ROAD level closes the
    // sequence, and every earlier one was just completed. `fetchLevel` throws on
    // the 403 if that ever stops being true, rather than skipping silently.
    const manifest = await api.fetchLevel(topicSlug, level.slug)
    for (const step of manifest.steps as ManifestStep[]) {
      if (step.kind === 'mission') continue
      await api.seedStepCompletion({ step_id: step.id })
      written += 1
    }
  }

  // Self-verify against a fresh map read, the way every sibling chain-completer
  // does — a helper that quietly writes nothing is how a test ends up asserting
  // nothing.
  const after = await api.getCurriculumMap()
  const road = topicOf(after, topicSlug).levels.filter((l) => l.required_step_count > 0)
  const unfinished = road.filter((l) => l.required_steps_completed < l.required_step_count)
  if (unfinished.length > 0) {
    throw new Error(
      `completeRequiredSteps(${topicSlug}) left ${unfinished.map((l) => l.slug).join(', ')} unfinished`,
    )
  }
  return written
}
