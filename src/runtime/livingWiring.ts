import { isValidationErrorList, parseStoryV2, type EngineState, type NormalizedStoryV2, type StoryEngine } from "@engine/index";
import type { ModelCall } from "@extraction/index";
import { getPlayerName } from "@services/STAPI";
import { LivingPort } from "./livingPort";
import type { ExpansionCoordinator } from "./coordinators/expansionCoordinator";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import type { JournalRecordKind } from "./journal";
import { livingInputs } from "./livingInputs";
import type { JudgeRuntime } from "./judge";
import type { RunOwnership } from "./runToken";
import { findStoryRecord, saveStoryRecord } from "./storyLibrary";
import type { LoadedStory, RuntimeExtras } from "./types";

export interface LivingWiring {
  view: { getStory: () => NormalizedStoryV2 | null; getState: () => EngineState | null };
  lifecycle: { persist: () => Promise<void>; notify: () => void; ownership: RunOwnership; model: ModelCall };
  engine: StoryEngine;
  loaded: () => LoadedStory | null;
  extras: () => RuntimeExtras;
  memory: MemoryCoordinator;
  expansion: ExpansionCoordinator;
  replaceStory: (story: NormalizedStoryV2) => void;
  refused: () => string | null;
  journal: (kind: JournalRecordKind, summary: string, note?: string) => void;
  judge: () => JudgeRuntime | null;
  chatRows: () => unknown[];
}

const rebuildFailure = (parsed: ReturnType<typeof parseStoryV2> | null): string => (parsed && isValidationErrorList(parsed) ? parsed[0]?.message ?? "" : "");

const divergence = () => import("@generation/living/divergence");

export function wireLiving(wiring: LivingWiring): LivingPort {
  const { engine, expansion } = wiring;
  return new LivingPort({
    ...wiring.view, ...wiring.lifecycle,
    loaded: () => {
      const loaded = wiring.loaded();
      return loaded ? { raw: loaded.record.raw, hash: loaded.record.hash, storyId: loaded.record.id } : null;
    },
    getLiving: () => wiring.extras().living,
    setLiving: (next) => { wiring.extras().living = next; },
    setPlayedRaw: (raw) => {
      const loaded = wiring.loaded();
      const parsed = loaded ? parseStoryV2(raw) : null;
      if (!loaded || !parsed || isValidationErrorList(parsed)) return void wiring.journal("story", "living story could not rebuild its graph", rebuildFailure(parsed));
      loaded.record = { ...loaded.record, raw };
      wiring.replaceStory(expansion.mergedStoryOrBase(raw, { ...parsed, id: loaded.record.id }));
    },
    pruneExpansion: (story) => expansion.pruneMissing(story),
    discardUnknownPending: () => engine.discardPendingUnknown(),
    ensureActive: () => engine.ensureActiveCheckpoint(),
    historyFloor: () => (wiring.loaded() ? engine.historyFrom().boundary : null),
    enabled: () => wiring.extras().stagecraft.settings.livingEnabled !== false,
    branching: () => wiring.extras().stagecraft.settings.branchingEnabled !== false,
    prefetch: () => wiring.extras().stagecraft.settings.prefetchEnabled !== false,
    recentTurns: async () => {
      const { windowLines, windowText } = await divergence();
      return windowText(windowLines(wiring.chatRows()));
    },
    chatRows: () => wiring.chatRows(),
    askDivergence: async (story, activeId) => {
      const judge = wiring.judge();
      if (!judge?.active("divergence")) return null;
      const { buildDivergenceRequest, DIVERGENCE_TIMEOUT_MS, exitDescriptions, readDivergence, windowLines } = await divergence();
      const request = buildDivergenceRequest(exitDescriptions(story, activeId), windowLines(wiring.chatRows()), getPlayerName() || "the player");
      const summarize = (answers: Parameters<typeof readDivergence>[0]) => {
        const read = readDivergence(answers);
        return { fit: read?.p ?? "none", commits: read?.commits ?? "none" };
      };
      const result = await judge.ask("divergence", request, { timeoutMs: DIVERGENCE_TIMEOUT_MS, summarize });
      return readDivergence(result.answers);
    },
    authorView: () => wiring.extras().ui.authorView,
    sealsOn: () => wiring.extras().memory.settings.chapters?.seal !== false,
    inputs: () => livingInputs({ memory: wiring.memory, state: wiring.view.getState, refused: wiring.refused, playerName: () => getPlayerName() }),
    saveRecord: (raw) => {
      const saved = saveStoryRecord(raw);
      if (isValidationErrorList(saved)) return { ok: false, reason: saved[0]?.message ?? "the story did not validate" };
      return { ok: true, id: saved.record.id, title: saved.record.title };
    },
    storyIdTaken: (id) => Boolean(findStoryRecord(id)),
    journal: (summary, note) => wiring.journal("story", summary, note),
  });
}
