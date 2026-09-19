import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { buildSceneReadRequest, readScene, SCENE_MAX_REACHABLE, SCENE_TIMEOUT_MS, sceneTrackerText, toSceneRecord, type SceneFamilies, type SceneReadInput, type SceneReadRecord } from "@judge/index";
import type { JudgeRuntime } from "../judge";

export interface SceneCoordinatorDeps {
  judge: () => JudgeRuntime | null;
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getWindow: () => Array<{ speaker: string; text: string }>;
  getPlayerName: () => string;
  getLastMessageId: () => number;
  getScene: () => SceneReadRecord | null;
  setScene: (record: SceneReadRecord | null) => void;
  inject: (text: string | null) => void;
  now?: () => number;
}

export interface SceneReadRun {
  boundary: number;
  messageId: number;
  heuristicFired: boolean;
  scheduleRead: (reason: string) => void;
}

export const SCENE_JUDGE_READ_REASON = "scene:judge";

// v2.2 plan 03. Reads and injects; it never writes the spine: the one thing it causes is a P0
// shared read, which the LLM still has to confirm (union with the regex's text-pattern hits).
export class SceneCoordinator {
  private injected: string | null = null;

  constructor(private readonly deps: SceneCoordinatorDeps) {}

  families(): SceneFamilies {
    const judge = this.deps.judge();
    return { sceneBreak: Boolean(judge?.active("sceneTrigger")), tracker: Boolean(judge?.active("sceneTracker")), lookahead: Boolean(judge?.active("lookahead")) };
  }

  active(): boolean {
    const families = this.families();
    return Boolean(this.deps.getStory()) && (families.sceneBreak || families.tracker || families.lookahead);
  }

  input(families: SceneFamilies): SceneReadInput | null {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const checkpoint = story && state ? story.checkpointById[state.activeCheckpointId] : null;
    if (!story || !state || !checkpoint) return null;
    const locationQuality = story.qualityByKey.location;
    const locations = story.scene_read?.locations ?? (locationQuality?.type === "enum" ? locationQuality.values ?? [] : []);
    return {
      storyTitle: story.title,
      checkpointName: checkpoint.name,
      objective: checkpoint.objective,
      cast: story.roster.map((member) => ({ rosterId: member.id, name: member.name ?? member.id, ...(member.role ? { role: member.role } : {}) })),
      player: this.deps.getPlayerName(),
      ...(locations.length ? { locations } : {}),
      ...(story.scene_read?.times?.length ? { times: story.scene_read.times } : {}),
      ...(families.lookahead ? { reachable: reachableFrom(story, checkpoint.id) } : {}),
      window: this.deps.getWindow(),
      families,
    };
  }

  async run(context: SceneReadRun): Promise<SceneReadRecord | null> {
    const judge = this.deps.judge();
    const families = this.families();
    const input = judge && this.active() ? this.input(families) : null;
    if (!judge || !input || !input.window.length) return null;
    const request = buildSceneReadRequest(input);
    const result = await judge.ask("scene", request, {
      timeoutMs: SCENE_TIMEOUT_MS,
      summarize: (answers): Record<string, number> => {
        const p = answers ? readScene(answers, input).sceneBreak?.p : undefined;
        return p === undefined ? {} : { break: p };
      },
    });
    if (!result.answers || this.deps.getLastMessageId() !== context.messageId) return null;
    const at = new Date((this.deps.now ?? Date.now)()).toISOString();
    const record = toSceneRecord(readScene(result.answers, input), input, { at, boundary: context.boundary, messageId: context.messageId, model: result.model });
    if (families.sceneBreak && record.sceneBreak?.triggered && !context.heuristicFired) context.scheduleRead(SCENE_JUDGE_READ_REASON);
    this.deps.setScene(record);
    this.sync();
    return record;
  }

  // The block follows the stored read: a new read, a rollback that dropped it, a chat switch that
  // hydrated another one, or a flag switched off all land here through the manager's notify.
  sync() {
    const record = this.deps.getScene();
    if (record && !this.active()) {
      this.deps.setScene(null);
      return;
    }
    const story = this.deps.getStory();
    const text = record && story && this.families().tracker && story.scene_read?.inject !== false ? sceneTrackerText(record.facts) : null;
    if (text === this.injected) return;
    this.injected = text;
    this.deps.inject(text);
  }
}

// Checkpoints the graph can reach from here, one hop first, then two; never the active one.
export function reachableFrom(story: NormalizedStoryV2, from: string): Array<{ id: string; name: string; objective: string; hops: number }> {
  const next = (id: string) => (story.outgoingByCheckpoint[id] ?? []).map((transition) => transition.to);
  const one = [...new Set(next(from))].filter((id) => id !== from && story.checkpointById[id]);
  const two = [...new Set(one.flatMap(next))].filter((id) => id !== from && !one.includes(id) && story.checkpointById[id]);
  return [...one.map((id) => ({ id, hops: 1 })), ...two.map((id) => ({ id, hops: 2 }))]
    .slice(0, SCENE_MAX_REACHABLE)
    .map(({ id, hops }) => ({ id, name: story.checkpointById[id].name, objective: story.checkpointById[id].objective, hops }));
}
