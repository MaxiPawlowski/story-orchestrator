import { INJECTION_REGISTRY, type InjectionSpec } from "@constants/injectionRegistry";
import { isSceneStale, type SceneReadRecord } from "@judge/index";

// The author's one place to see what the next
// reply will receive, composed from the SAME registry the injections are registered in and the blocks
// ST actually holds — not a second list that can drift from either. Read-only apart from the three
// controls the owning subsystems already expose.
//
// The order is ST's own (`readInjectedPromptBlocks` sorts by depth then key: that is the order the
// prompt is assembled in), so a preview that disagrees with a captured payload is a real disagreement
// rather than a sorting difference.

export type NextTurnFreshness = "live" | "stale" | "unknown";

export type TokenSource = "host" | "estimate";

export interface TokenCount {
  tokens: number;
  source: TokenSource;
}

export type NextTurnBudget = { ok: true; context: number; response: number; prompt: number; api: string | null } | { ok: false; reason: string };

export interface NextTurnContributor {
  key: string;
  label: string;
  /** The module that writes it — what "open the owning editor" navigates to. */
  owner: string;
  ownerTab: "scheduler" | "memory" | "payload" | "config";
  depth: number;
  role: number;
  characters: number;
  tokens: number | null;
  tokenSource: TokenSource | null;
  share: number | null;
  position: number | null;
  conditional: boolean;
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
  countOf?: (value: string) => TokenCount | null;
  budget?: NextTurnBudget | null;
}

export interface NextTurnSourceBlock {
  key: string;
  depth: number;
  role: number;
  value: string;
  position?: number;
  hasFilter?: boolean;
}

export interface NextTurnForeignRow {
  key: string;
  label: string;
  position: number;
  positionLabel: string;
  depth: number;
  role: number;
  conditional: boolean;
  tokens: number | null;
  tokenSource: TokenSource | null;
  share: number | null;
  firstLine: string;
}

export interface NextTurnCost {
  ownTokens: number | null;
  foreignTokens: number | null;
  counting: number;
  estimated: boolean;
  budget: number | null;
  context: number | null;
  response: number | null;
  budgetUnknown: string | null;
  share: number | null;
  lastGenerationBudget: number | null;
}

const SPECS: InjectionSpec[] = Object.values(INJECTION_REGISTRY) as InjectionSpec[];
const specFor = (key: string): InjectionSpec | null => SPECS.find((spec) => spec.key === key) ?? null;

// Which edits belong to which tab. A block the author cannot act on still says so rather than
// offering a control that does nothing.
const OWNER_TABS: Record<string, NextTurnContributor["ownerTab"]> = {
  "runtime/runtimeManager.applyPacingSteering": "config",
  "runtime/coordinators/pacingCoordinator": "config",
  "memory/inject.applyMemoryInjection": "memory",
  "memory/inject.applyEpistemicInjection": "memory",
  "memory/inject.applyLedgerInjection": "memory",
  "runtime/runtimeManager.setCopilotNudge": "payload",
  "runtime/coordinators/sceneCoordinator": "scheduler",
  "runtime/coordinators/stagecraftCoordinator": "scheduler",
};

const PREVIEW_CHARS = 240;
const FIRST_LINE_CHARS = 120;
const INJECT_PREFIX = "script_inject_";

const POSITION_LABELS: Record<number, string> = { [-1]: "not injected; macro only", 0: "in prompt", 1: "in chat", 2: "before prompt" };

export const positionLabel = (position: number): string => POSITION_LABELS[position] ?? `position ${position}`;

const shareOf = (counted: TokenCount | null, budget: NextTurnBudget | null | undefined): number | null =>
  counted && budget?.ok ? counted.tokens / budget.prompt : null;

const byAssembly = (left: NextTurnSourceBlock, right: NextTurnSourceBlock) => left.depth - right.depth || left.key.localeCompare(right.key);

const firstLineOf = (value: string): string => {
  const line = value.split("\n").map((part) => part.trim()).find((part) => part.length > 0) ?? "";
  return line.length <= FIRST_LINE_CHARS ? line : `${line.slice(0, FIRST_LINE_CHARS - 1)}…`;
};

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
    .sort(byAssembly)
    .map((block) => {
      const spec = specFor(block.key);
      const counted = facts.countOf?.(block.value) ?? null;
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
        tokens: counted?.tokens ?? null,
        tokenSource: counted?.source ?? null,
        share: shareOf(counted, facts.budget),
        position: block.position ?? null,
        conditional: block.hasFilter === true,
        target: isPrivate ? facts.draftedMember : null,
        oneShot: spec?.key === INJECTION_REGISTRY.continuityNote.key,
        freshness: isScene ? (facts.scene ? (isSceneStale(facts.scene) ? "stale" : "live") : "unknown") : "live",
        fallback: isScene ? facts.sceneFallback : null,
        preview: previewOf(block.value),
      };
    });

/** What the preview can act on: only the one-shot note has a clear, and only from this surface. */
export const clearableContributors = (rows: NextTurnContributor[]): NextTurnContributor[] => rows.filter((row) => row.oneShot);

/** What OTHER extensions put beside the story's blocks. Read-only: no owner, no control. */
export const buildForeignRows = (blocks: NextTurnSourceBlock[], countOf: (value: string) => TokenCount | null, budget: NextTurnBudget | null): NextTurnForeignRow[] =>
  [...blocks].sort(byAssembly).map((block) => {
    const counted = countOf(block.value);
    const position = block.position ?? 0;
    return {
      key: block.key,
      label: block.key.startsWith(INJECT_PREFIX) ? `/inject ${block.key.slice(INJECT_PREFIX.length)}` : block.key,
      position,
      positionLabel: positionLabel(position),
      depth: block.depth,
      role: block.role,
      conditional: block.hasFilter === true,
      tokens: counted?.tokens ?? null,
      tokenSource: counted?.source ?? null,
      share: position === -1 ? null : shareOf(counted, budget),
      firstLine: firstLineOf(block.value),
    };
  });

const total = (rows: Array<{ tokens: number | null }>): number | null =>
  rows.some((row) => row.tokens === null) ? null : rows.reduce((sum, row) => sum + (row.tokens ?? 0), 0);

/** The story blocks as a share of the main API's prompt budget. An unread budget is unknown, never 0. */
export function buildNextTurnCost(rows: NextTurnContributor[], foreign: NextTurnForeignRow[], budget: NextTurnBudget | null, lastGenerationBudget: number | null): NextTurnCost {
  const ownTokens = total(rows);
  const known = budget?.ok ? budget : null;
  return {
    ownTokens,
    foreignTokens: total(foreign.filter((row) => row.position !== -1)),
    counting: [...rows, ...foreign].filter((row) => row.tokens === null).length,
    estimated: [...rows, ...foreign].some((row) => row.tokenSource === "estimate"),
    budget: known?.prompt ?? null,
    context: known?.context ?? null,
    response: known?.response ?? null,
    budgetUnknown: budget ? (budget.ok ? null : budget.reason) : "the context size has not been read",
    share: ownTokens !== null && known ? ownTokens / known.prompt : null,
    lastGenerationBudget,
  };
}

const formatCount = (value: number): string => value.toLocaleString("en-US");

export const formatShare = (share: number | null): string => (share === null ? "" : `${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%`);

export function nextTurnCostText(cost: NextTurnCost): string {
  const tokens = cost.ownTokens === null ? `counting… (${cost.counting} left)` : `${formatCount(cost.ownTokens)} tokens`;
  if (cost.budget === null) return `Story blocks: ${tokens} · budget unknown (${cost.budgetUnknown ?? "not read"})${cost.estimated ? " · some counts estimated (chars/4)" : ""}`;
  const share = cost.share === null ? "" : ` · ${formatShare(cost.share)}`;
  return `Story blocks: ${tokens} of ${formatCount(cost.budget)} available (max context − response)${share}${cost.estimated ? " · some counts estimated (chars/4)" : ""}`;
}
