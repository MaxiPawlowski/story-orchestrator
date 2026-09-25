import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import {
  buildSceneReadRequest, confirmedSceneFacts, readScene, SCENE_MAX_REACHABLE, SCENE_TIMEOUT_MS, isSceneStale,
  sceneTrackerText, toSceneRecord, type SceneFamilies, type SceneReadInput, type SceneReadRecord,
} from "@judge/index";
import type { WriteResult } from "@utils/writeResult";
import type { JudgeRuntime } from "../judge";
import { beginRun, type RunOwnership } from "../runToken";

export interface SceneCoordinatorDeps {
  judge: () => JudgeRuntime | null;
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getWindow: () => Array<{ speaker: string; text: string }>;
  getPlayerName: () => string;
  getLastMessageId: () => number;
  getScene: () => SceneReadRecord | null;
  setScene: (record: SceneReadRecord | null) => void;
  inject: (text: string | null) => WriteResult<{ changed: boolean }>;
  applied?: () => string | null;
  journal?: (summary: string, note: string) => void;
  withheldFields?: () => ReadonlySet<string>;
  // v2.3 plan 03 (C1, the "scene" surface). Optional: an unwired caller never lapses.
  ownership?: RunOwnership;
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
  private refused: string | null | undefined = undefined;

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

  /** v2.3 plan 09: the author asked for a fresh read from the next-turn preview. Same path as a
   *  boundary, with the reason recorded so the call ring shows who asked for it. */
  async rerun() {
    const state = this.deps.getState();
    return this.run({
      boundary: state?.boundary ?? 0,
      messageId: this.deps.getLastMessageId(),
      heuristicFired: false,
      // The manual path never schedules a read: the author is looking at the result.
      scheduleRead: () => undefined,
    });
  }

  async run(context: SceneReadRun): Promise<SceneReadRecord | null> {
    const judge = this.deps.judge();
    const families = this.families();
    const input = judge && this.active() ? this.input(families) : null;
    if (!judge || !input || !input.window.length) return null;
    const request = buildSceneReadRequest(input);
    // C1, the "scene" surface. The existing `getLastMessageId() !== context.messageId` check below
    // only asks whether the chat moved ON; it passes unchanged across a chat switch or a story
    // swap that happens to land on the same message index — which is the v2.1 plan 08 shape, and
    // it was reachable here.
    const run = beginRun(this.deps.ownership, { from: input.window.length ? context.messageId - input.window.length + 1 : context.messageId, to: context.messageId });
    const result = await judge.ask("scene", request, {
      timeoutMs: SCENE_TIMEOUT_MS,
      summarize: (answers): Record<string, number> => {
        const p = answers ? readScene(answers, input).sceneBreak?.p : undefined;
        return p === undefined ? {} : { break: p };
      },
    });
    // C2: a read that does not answer used to return here silently, leaving the previous record
    // live and injected. A miss is recorded on the record itself, so the tracker can say it is no
    // longer confirmed instead of presenting a stale place as current.
    if (!result.answers) {
      // v2.3 plan 03 §Abort and cleanup: the FAILURE path is a write too, and it was running
      // unguarded. A read that started in chat A and came back empty after the world moved aged
      // whichever scene record is current now — so a dead backend in one chat marked another
      // chat's tracker unconfirmed, and two such misses withheld a scene that was never asked
      // about. Cleanup belongs to the epoch that owns it.
      if (run.stillOwns()) this.ageStoredScene();
      return null;
    }
    if (!run.stillOwns()) return null;
    // A read that answered about a window the chat has already moved past is not a failure of the
    // judge, so it does not age the record — it is simply late, and the next read supersedes it.
    if (this.deps.getLastMessageId() !== context.messageId) return null;
    const at = new Date((this.deps.now ?? Date.now)()).toISOString();
    const record = toSceneRecord(readScene(result.answers, input), input, { at, boundary: context.boundary, messageId: context.messageId, model: result.model });
    if (families.sceneBreak && record.sceneBreak?.triggered && !context.heuristicFired) context.scheduleRead(SCENE_JUDGE_READ_REASON);
    this.deps.setScene(record);
    this.sync();
    return record;
  }

  /** Record one failed read against the stored scene. Keeps the facts; marks them unconfirmed. */
  private ageStoredScene() {
    const record = this.deps.getScene();
    if (!record) return;
    const at = new Date((this.deps.now ?? Date.now)()).toISOString();
    const previous = record.freshness;
    this.deps.setScene({
      ...record,
      freshness: {
        failures: (previous?.failures ?? 0) + 1,
        staleSince: previous?.staleSince ?? at,
        confirmedBoundary: previous?.confirmedBoundary ?? record.boundary,
      },
    });
    this.sync();
  }

  /** True once the judge has failed to confirm this scene often enough to stop asserting it. */
  static isStale(record: SceneReadRecord | null): boolean {
    return isSceneStale(record);
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
    // A scene nothing has confirmed for SCENE_STALE_AFTER reads is withheld rather than injected:
    // naming a place the story may have left is worse than naming none.
    const stale = SceneCoordinator.isStale(record);
    const facts = stale ? null : confirmedSceneFacts(record, this.deps.withheldFields?.());
    const text = facts && story && this.families().tracker && story.scene_read?.inject !== false ? sceneTrackerText(facts) : null;
    if (text === (this.deps.applied ? this.deps.applied() : this.injected)) return;
    const result = this.deps.inject(text);
    if (result.ok) {
      this.injected = text;
      this.refused = undefined;
      return;
    }
    if (this.refused === text) return;
    this.refused = text;
    this.deps.journal?.(text === null ? "The scene tracker could not be removed from the prompt" : "The scene tracker was not added to the prompt", `${result.reason}. Retried on the next update.`);
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
