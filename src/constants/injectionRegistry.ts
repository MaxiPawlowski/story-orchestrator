import { WITHHOLDING_TYPES } from "../runtime/generationLifecycle";

export const MEMORY_INJECTION_KEY_PREFIX = "story_orchestrator_memory_";

export type CarryMode = "keep" | "withhold";

export type CarryType = "quiet" | "impersonate";

export const CARRY_TYPES = [...WITHHOLDING_TYPES] as CarryType[];

export type InjectionCarry = Readonly<Record<CarryType, CarryMode>>;

export interface InjectionSpec {
  readonly key: string;
  /** What a quiet run (another tool's request) and an impersonate run (written as the player) may carry. */
  readonly carry: InjectionCarry;
  readonly depth: number;
  readonly writer: string;
  readonly dynamicDepth?: boolean;
  /** What the next-turn preview calls this block, instead of the raw key. */
  readonly label: string;
  /** May be added to the World Info scan buffer when the install switches memory scanning on. */
  readonly scannable?: true;
}

const KEEP: InjectionCarry = { quiet: "keep", impersonate: "keep" };
const WITHHOLD: InjectionCarry = { quiet: "withhold", impersonate: "withhold" };

export const INJECTION_REGISTRY = {
  pacing: { carry: WITHHOLD, key: "story_orchestrator_pacing", depth: 2, writer: "runtime/runtimeManager.applyPacingSteering" , label: "Pacing steering" },
  memoryFacts: { carry: KEEP, key: `${MEMORY_INJECTION_KEY_PREFIX}facts`, depth: 4, writer: "memory/inject.applyMemoryInjection", label: "Memory — established facts", scannable: true },
  memorySessionDetails: { carry: KEEP, key: `${MEMORY_INJECTION_KEY_PREFIX}session_details`, depth: 3, writer: "memory/inject.applyMemoryInjection", label: "Memory — session details" },
  memoryShortTerm: { carry: KEEP, key: `${MEMORY_INJECTION_KEY_PREFIX}short_term`, depth: 2, writer: "memory/inject.applyMemoryInjection", label: "Memory — short term" },
  memorySceneHistory: { carry: KEEP, key: `${MEMORY_INJECTION_KEY_PREFIX}scene_history`, depth: 4, writer: "memory/inject.applyMemoryInjection", label: "Memory — scene history", scannable: true },
  epistemic: { carry: WITHHOLD, key: "story_orchestrator_epistemic", depth: 4, writer: "memory/inject.applyEpistemicInjection" , label: "What the speaker knows" },
  ledger: { carry: KEEP, key: "story_orchestrator_ledger", depth: 4, writer: "memory/inject.applyLedgerInjection" , label: "State ledger" },
  copilotNudge: { carry: KEEP, key: "story_copilot_nudge", depth: 4, writer: "runtime/runtimeManager.setCopilotNudge", dynamicDepth: true , label: "Author nudge" },
  sceneTracker: { carry: KEEP, key: "story_orchestrator_scene", depth: 1, writer: "runtime/coordinators/sceneCoordinator" , label: "Scene so far" },
  continuityNote: { carry: WITHHOLD, key: "story_orchestrator_continuity", depth: 0, writer: "runtime/coordinators/stagecraftCoordinator" , label: "Continuity note" },
  checkpointGuidance: { carry: WITHHOLD, key: "story_orchestrator_guidance", depth: 4, writer: "runtime/coordinators/pacingCoordinator", label: "Checkpoint guidance", scannable: true },
  storySoFar: { carry: KEEP, key: "story_orchestrator_story_so_far", depth: 4, writer: "runtime/memoryInjector", label: "The story so far" },
  chapterBridge: { carry: WITHHOLD, key: "story_orchestrator_chapter_bridge", depth: 1, writer: "runtime/memoryInjector", label: "Chapter bridge" },
  cardOverlay: { carry: KEEP, key: "story_orchestrator_card_overlay", depth: 1, writer: "runtime/cardOverlayHost", label: "Current public character state" },
  playerRole: { carry: KEEP, key: "story_orchestrator_player_role", depth: 4, writer: "runtime/playerRoleHost", label: "Who the player is in this story" },
  checkOutcome: { carry: WITHHOLD, key: "story_orchestrator_check_outcome", depth: 0, writer: "runtime/checkOutcomeHost", label: "Outcomes the story decided" },
  awayNotice: { carry: WITHHOLD, key: "story_orchestrator_away_notice", depth: 0, writer: "runtime/awayNotice", label: "Who is not here" },
  previously: { carry: WITHHOLD, key: "story_orchestrator_previously", depth: 4, writer: "runtime/carryPort", label: "Previously" },
} as const satisfies Record<string, InjectionSpec>;

export const INJECTION_DEPTH_COLLISION_ALLOWLIST: ReadonlyArray<ReadonlySet<string>> = [
  new Set([INJECTION_REGISTRY.memoryFacts.key, INJECTION_REGISTRY.memorySceneHistory.key, INJECTION_REGISTRY.epistemic.key,
    INJECTION_REGISTRY.ledger.key, INJECTION_REGISTRY.checkpointGuidance.key, INJECTION_REGISTRY.storySoFar.key, INJECTION_REGISTRY.playerRole.key, INJECTION_REGISTRY.previously.key]),
  new Set([INJECTION_REGISTRY.memoryShortTerm.key, INJECTION_REGISTRY.pacing.key]),
  new Set([INJECTION_REGISTRY.sceneTracker.key, INJECTION_REGISTRY.chapterBridge.key, INJECTION_REGISTRY.cardOverlay.key]),
  new Set([INJECTION_REGISTRY.continuityNote.key, INJECTION_REGISTRY.checkOutcome.key, INJECTION_REGISTRY.awayNotice.key]),
];

const NEVER_SCANNABLE: ReadonlySet<string> = new Set(["epistemic", "ledger"]);
const SCANNABLE_ALLOWLIST: ReadonlySet<string> = new Set(["memoryFacts", "memorySceneHistory", "checkpointGuidance"]);

export const SCANNABLE_INJECTIONS: ReadonlySet<string> = new Set((Object.values(INJECTION_REGISTRY) as InjectionSpec[]).filter((spec) => spec.scannable).map((spec) => spec.key));

export const isScannableInjectionKey = (key: string): boolean => SCANNABLE_INJECTIONS.has(key);

const setsEqual = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((value) => b.has(value));

export const carriesInto = (spec: { readonly carry: InjectionCarry }, type: unknown): boolean =>
  !(CARRY_TYPES as readonly unknown[]).includes(type) || spec.carry[type as CarryType] === "keep";

export function findInjectionRegistryProblems(registry: Record<string, InjectionSpec> = INJECTION_REGISTRY): string[] {
  const specs = Object.values(registry);
  const problems: string[] = [];

  for (const spec of specs) {
    for (const type of CARRY_TYPES) {
      const mode: unknown = spec.carry?.[type];
      if (mode !== "keep" && mode !== "withhold") problems.push(`"${spec.key}" does not declare what a ${type} run carries`);
    }
  }

  for (const [name, spec] of Object.entries(registry)) {
    if (!spec.scannable) continue;
    if (NEVER_SCANNABLE.has(name)) problems.push(`"${spec.key}" may never be added to the World Info scan`);
    else if (!SCANNABLE_ALLOWLIST.has(name)) problems.push(`"${spec.key}" is not on the scannable allowlist`);
  }

  const seen = new Map<string, number>();
  for (const spec of specs) seen.set(spec.key, (seen.get(spec.key) ?? 0) + 1);
  for (const [key, count] of seen) if (count > 1) problems.push(`duplicate injection key "${key}" (${count} specs)`);

  const byDepth = new Map<number, string[]>();
  for (const spec of specs) {
    if (spec.dynamicDepth) continue;
    byDepth.set(spec.depth, [...(byDepth.get(spec.depth) ?? []), spec.key]);
  }
  for (const [depth, keys] of byDepth) {
    if (keys.length < 2) continue;
    const group = new Set(keys);
    if (!INJECTION_DEPTH_COLLISION_ALLOWLIST.some((allowed) => setsEqual(allowed, group))) {
      problems.push(`unlisted depth collision at ${depth}: ${keys.sort().join(", ")}`);
    }
  }

  return problems;
}
