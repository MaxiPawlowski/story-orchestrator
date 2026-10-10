import type { NormalizedStoryV2 } from "@engine/index";
import { storyRevision } from "./hash";
import { applyScanGate, emptyScanGateStats, scanGatePlan, type ScanEntry, type ScanGate, type ScanGateStats } from "./scanGatePlan";
import { earnedSwitches, earnedSwitchesKey, NO_EARNED_SWITCHES, releasePlan, type EarnedSwitches } from "./worldInfoGates";
import { bookKey } from "./worldInfoMatch";

export interface ScanGuardSources {
  openChat: () => string | null;
  storyChat: () => string | null;
  story: () => NormalizedStoryV2 | null;
  path: () => string[];
  values?: () => Readonly<Record<string, unknown>>;
  ready: () => boolean;
  library: () => unknown[];
  libraryRevision: () => string;
}

export type ScanGuardOwner = "story" | "story-not-ready" | "no-story";

export interface ScanGuardResult extends ScanGateStats {
  owner: ScanGuardOwner;
}

const releaseOnly = (library: unknown[], story: NormalizedStoryV2): ScanGate => {
  const gate: ScanGate = new Map();
  for (const plan of releasePlan(library, story)) {
    const key = bookKey(plan.lorebook);
    if (!key) continue;
    gate.set(key, { lorebook: plan.lorebook, entries: new Map(plan.disable.map((comment) => [comment, false])) });
  }
  return gate;
};

export const scanGuardGate = (library: unknown[], story: NormalizedStoryV2 | null, path: string[], owner: ScanGuardOwner, switches: EarnedSwitches = NO_EARNED_SWITCHES): ScanGate => {
  if (owner === "no-story" || !story) return scanGatePlan(library, null, []);
  return owner === "story" ? scanGatePlan(library, story, path, switches) : releaseOnly(library, story);
};

export class ScanGuard {
  private memo: { key: string; owner: ScanGuardOwner; gate: ScanGate } | null = null;

  constructor(private readonly sources: ScanGuardSources) {}

  owner(): ScanGuardOwner {
    const open = this.sources.openChat();
    const owned = Boolean(this.sources.story()) && Boolean(open) && open === this.sources.storyChat();
    if (!owned) return "no-story";
    return this.sources.ready() ? "story" : "story-not-ready";
  }

  gate(): { owner: ScanGuardOwner; gate: ScanGate } {
    const owner = this.owner();
    const story = owner === "no-story" ? null : this.sources.story();
    const path = owner === "story" ? this.sources.path() : [];
    const switches = owner === "story" ? earnedSwitches(story, this.sources.values?.() ?? {}) : NO_EARNED_SWITCHES;
    const key = [owner, this.sources.openChat() ?? "", story ? `${story.id ?? ""}@${storyRevision(story)}` : "", path.join(">"), earnedSwitchesKey(switches),
      this.sources.libraryRevision()].join("|");
    if (this.memo?.key !== key) this.memo = { key, owner, gate: scanGuardGate(this.sources.library(), story, path, owner, switches) };
    return { owner: this.memo.owner, gate: this.memo.gate };
  }

  apply(arrays: ScanEntry[][]): ScanGuardResult {
    const { owner, gate } = this.gate();
    if (!gate.size) return { ...emptyScanGateStats(), owner };
    return { ...applyScanGate(arrays, gate, () => true), owner };
  }
}
