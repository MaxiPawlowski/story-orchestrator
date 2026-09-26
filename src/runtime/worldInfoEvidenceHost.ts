import { gatedWorldInfo, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { loadedEntries, observeWorldInfoScans, type HostEntriesLoaded } from "@services/STAPI";
import { lorebookFileId } from "@utils/string";
import type { RunContext } from "./runToken";
import { loreEvidence, type EntryRef, type LoreEvidence, type LoreFlag, type ScanInput } from "./worldInfoEvidence";
import { sameLorebook } from "./worldInfoMatch";
import { withholds } from "./generationLifecycle";

export const isLoudGeneration = (type: string | null) => type === null || !withholds(type);

export interface LoreEvidenceWiring {
  chatId: () => string | null;
  context: () => RunContext;
  story: () => NormalizedStoryV2 | null;
  state: () => EngineState | null;
  mirrorBook: () => string | null;
  lastMessageId: () => number;
  /** The innermost generation open when a scan fires: its type tags the scan, and a quiet one is not the reply. */
  innermostType: () => string | null;
  journal: (flag: LoreFlag) => void;
  notify: () => void;
  evidence?: LoreEvidence;
}

export interface LoreEvidenceControls {
  opened: (type: string | null) => void;
  settled: (rendered: boolean) => void;
  forced: (picks: EntryRef[]) => void;
  reassert: () => void;
  dispose: () => void;
}

// Every book the story reads from: what it requires, what it gates, what lore-select may force, and
// this chat's own memory mirror. These are the books a foreign scan filter could hide from the model.
export function storyBooks(story: NormalizedStoryV2 | null, mirrorBook: string | null): string[] {
  const books = [
    ...(story?.requirements?.lorebooks ?? []),
    ...(story ? [...gatedWorldInfo([story]).keys()] : []),
    ...(story?.lore_select?.lorebooks ?? []),
    ...(mirrorBook ? [mirrorBook] : []),
  ];
  const seen = new Set<string>();
  return books.filter((book) => {
    const key = lorebookFileId(book).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const worldsOf = (payload: HostEntriesLoaded): ScanInput[] => loadedEntries(payload).map((entry) => ({ world: entry.world }));

// The host half. A slot opens with the outermost LOUD generation and
// closes when it settles, rendered or not; a quiet outermost is not a reply and records nothing.
export function startLoreEvidence(deps: LoreEvidenceWiring): LoreEvidenceControls {
  const evidence = deps.evidence ?? loreEvidence;
  evidence.attach({ chatId: deps.chatId, context: deps.context });
  let open = false;
  let firstView: ScanInput[] | null = null;
  let mirror: string | null = null;
  let watched: string[] = [];
  const observation = observeWorldInfoScans({
    activated: (entries) => {
      if (!open) return;
      const type = deps.innermostType();
      evidence.scanned(entries, type ?? "normal", isLoudGeneration(type));
    },
    loadedFirst: (payload) => {
      if (open) firstView = worldsOf(payload);
    },
    loadedLast: (payload) => {
      if (!open) return;
      const entries = loadedEntries(payload);
      if (firstView) evidence.filtered(watched, firstView, entries);
      firstView = null;
      evidence.loadedView(entries.filter((entry) => watched.some((book) => sameLorebook(book, entry.world))));
    },
  });
  return {
    opened: (type) => {
      if (!isLoudGeneration(type)) return;
      open = true;
      firstView = null;
      mirror = deps.mirrorBook();
      watched = storyBooks(deps.story(), mirror);
      evidence.opened({ type });
    },
    settled: (rendered) => {
      if (!open) return;
      open = false;
      const state = deps.state();
      const flags = evidence.settled({ rendered, lastMessageId: deps.lastMessageId(), story: deps.story(), path: state?.visitedPath ?? [], mirrorBook: mirror });
      for (const flag of flags) deps.journal(flag);
      deps.notify();
    },
    forced: (picks) => evidence.forced(picks),
    reassert: () => observation.reassert(),
    dispose: () => {
      observation.dispose();
      evidence.attach(null);
    },
  };
}
