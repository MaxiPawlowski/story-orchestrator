import { INJECTION_REGISTRY, type InjectionSpec } from "@constants/injectionRegistry";
import { isSceneStale, type SceneReadRecord } from "@judge/index";

// v2.3 plan 09 (integration review recommendation 3). The author's one place to see what the next
// reply will receive, composed from the SAME registry the injections are registered in and the blocks
// ST actually holds — not a second list that can drift from either. Read-only apart from the three
// controls the owning subsystems already expose.
//
// The order is ST's own (`readInjectedPromptBlocks` sorts by depth then key: that is the order the
// prompt is assembled in), so a preview that disagrees with a captured payload is a real disagreement
// rather than a sorting difference.

export type NextTurnFreshness = "live" | "stale" | "unknown";

export interface NextTurnContributor {
  key: string;
  label: string;
  /** The module that writes it — what "open the owning editor" navigates to. */
  owner: string;
  ownerTab: "scheduler" | "memory" | "payload" | "config";
  depth: number;
  role: number;
  characters: number;
  /** Set for a block injected privately to one speaker (a group's drafted member). */
  target: string | null;
  /** Cleared at the end of the generation it was written for (the continuity note). */
  oneShot: boolean;
  freshness: NextTurnFreshness;
  /** Why the contributor is not doing what it looks like it is doing, when that is known. */
  fallback: string | null;
  preview: string;
}

export interface NextTurnFacts {
  /** The member ST drafted for this generation, when the chat is a group. */
  draftedMember: string | null;
  scene: SceneReadRecord | null;
  /** The judge call that owns `sceneTracker` fell back, and why. */
  sceneFallback: string | null;
}

export interface NextTurnSourceBlock {
  key: string;
  depth: number;
  role: number;
  value: string;
}

const SPECS: InjectionSpec[] = Object.values(INJECTION_REGISTRY) as InjectionSpec[];
const specFor = (key: string): InjectionSpec | null => SPECS.find((spec) => spec.key === key) ?? null;

// Which edits belong to which tab. A block the author cannot act on still says so rather than
// offering a control that does nothing.
const OWNER_TABS: Record<string, NextTurnContributor["ownerTab"]> = {
  "runtime/runtimeManager.applyPacingSteering": "config",
  "memory/inject.applyMemoryInjection": "memory",
  "memory/inject.applyEpistemicInjection": "memory",
  "memory/inject.applyLedgerInjection": "memory",
  "runtime/runtimeManager.setCopilotNudge": "payload",
  "runtime/coordinators/sceneCoordinator": "scheduler",
  "runtime/coordinators/stagecraftCoordinator": "scheduler",
};

const PREVIEW_CHARS = 240;

const previewOf = (value: string): string => {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= PREVIEW_CHARS ? flat : `${flat.slice(0, PREVIEW_CHARS - 1)}…`;
};

/**
 * One row per block the next generation will carry, in the order ST will assemble them. A block the
 * registry does not know is reported with its raw key rather than dropped: something is injecting into
 * the prompt and the author is owed that fact.
 */
export const buildNextTurnPreview = (blocks: NextTurnSourceBlock[], facts: NextTurnFacts): NextTurnContributor[] =>
  [...blocks]
    .sort((left, right) => left.depth - right.depth || left.key.localeCompare(right.key))
    .map((block) => {
      const spec = specFor(block.key);
      const owner = spec?.writer ?? "unknown";
      const isScene = spec?.key === INJECTION_REGISTRY.sceneTracker.key;
      const isPrivate = spec?.key === INJECTION_REGISTRY.epistemic.key;
      return {
        key: block.key,
        label: spec?.label ?? block.key,
        owner,
        ownerTab: OWNER_TABS[owner] ?? "payload",
        depth: block.depth,
        role: block.role,
        characters: block.value.length,
        target: isPrivate ? facts.draftedMember : null,
        oneShot: spec?.key === INJECTION_REGISTRY.continuityNote.key,
        freshness: isScene ? (facts.scene ? (isSceneStale(facts.scene) ? "stale" : "live") : "unknown") : "live",
        fallback: isScene ? facts.sceneFallback : null,
        preview: previewOf(block.value),
      };
    });

/** What the preview can act on: only the one-shot note has a clear, and only from this surface. */
export const clearableContributors = (rows: NextTurnContributor[]): NextTurnContributor[] => rows.filter((row) => row.oneShot);
