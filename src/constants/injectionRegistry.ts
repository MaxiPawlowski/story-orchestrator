export const MEMORY_INJECTION_KEY_PREFIX = "story_orchestrator_memory_";

export interface InjectionSpec {
  readonly key: string;
  readonly depth: number;
  readonly writer: string;
  readonly dynamicDepth?: boolean;
  /** v2.3 plan 09: what the next-turn preview calls this block, instead of the raw key. */
  readonly label: string;
}

export const INJECTION_REGISTRY = {
  pacing: { key: "story_orchestrator_pacing", depth: 2, writer: "runtime/runtimeManager.applyPacingSteering" , label: "Pacing steering" },
  memoryFacts: { key: `${MEMORY_INJECTION_KEY_PREFIX}facts`, depth: 4, writer: "memory/inject.applyMemoryInjection", label: "Memory — established facts" },
  memorySessionDetails: { key: `${MEMORY_INJECTION_KEY_PREFIX}session_details`, depth: 3, writer: "memory/inject.applyMemoryInjection", label: "Memory — session details" },
  memoryShortTerm: { key: `${MEMORY_INJECTION_KEY_PREFIX}short_term`, depth: 2, writer: "memory/inject.applyMemoryInjection", label: "Memory — short term" },
  memorySceneHistory: { key: `${MEMORY_INJECTION_KEY_PREFIX}scene_history`, depth: 6, writer: "memory/inject.applyMemoryInjection", label: "Memory — scene history" },
  epistemic: { key: "story_orchestrator_epistemic", depth: 4, writer: "memory/inject.applyEpistemicInjection" , label: "What the speaker knows" },
  ledger: { key: "story_orchestrator_ledger", depth: 3, writer: "memory/inject.applyLedgerInjection" , label: "State ledger" },
  copilotNudge: { key: "story_copilot_nudge", depth: 4, writer: "runtime/runtimeManager.setCopilotNudge", dynamicDepth: true , label: "Author nudge" },
  sceneTracker: { key: "story_orchestrator_scene", depth: 1, writer: "runtime/coordinators/sceneCoordinator" , label: "Scene so far" },
  continuityNote: { key: "story_orchestrator_continuity", depth: 0, writer: "runtime/coordinators/stagecraftCoordinator" , label: "Continuity note" },
} as const satisfies Record<string, InjectionSpec>;

export const INJECTION_DEPTH_COLLISION_ALLOWLIST: ReadonlyArray<ReadonlySet<string>> = [
  new Set([INJECTION_REGISTRY.memoryFacts.key, INJECTION_REGISTRY.epistemic.key]),
  new Set([INJECTION_REGISTRY.memoryShortTerm.key, INJECTION_REGISTRY.pacing.key]),
  new Set([INJECTION_REGISTRY.memorySessionDetails.key, INJECTION_REGISTRY.ledger.key]),
];

const setsEqual = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((value) => b.has(value));

export function findInjectionRegistryProblems(): string[] {
  const specs = Object.values(INJECTION_REGISTRY) as InjectionSpec[];
  const problems: string[] = [];

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
