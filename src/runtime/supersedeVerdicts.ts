import { askText } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import { applyVerdicts, askablePairs, buildVerdictPrompt, mergePending, planVerdicts, VERDICT_MAX_TOKENS, type VerdictPlan } from "@memory/supersedeVerdicts";
import type { UncertainPair } from "@memory/supersede";
import type { ChapterHost } from "./chapterPort";
import { beginRun, type RunGuard } from "./runToken";

interface VerdictSlot {
  pending: UncertainPair[];
  asking: boolean;
  ready: { plan: VerdictPlan; run: RunGuard } | null;
}

const slots = new WeakMap<ChapterHost, VerdictSlot>();

const slotOf = (host: ChapterHost): VerdictSlot => {
  const known = slots.get(host);
  if (known) return known;
  const slot: VerdictSlot = { pending: [], asking: false, ready: null };
  slots.set(host, slot);
  return slot;
};

export const verdictsOn = (host: ChapterHost): boolean => {
  const settings = host.memory().settings;
  return settings.enabled && settings.supersedeVerdicts !== false;
};

export function queueVerdictPairs(host: ChapterHost, uncertain: readonly UncertainPair[]): number {
  if (!verdictsOn(host) || !uncertain.length) return 0;
  const slot = slotOf(host);
  slot.pending = mergePending(slot.pending, uncertain);
  return slot.pending.length;
}

export const verdictWork = (host: ChapterHost): { askable: boolean; ready: boolean } => {
  const slot = slotOf(host);
  return { askable: !slot.asking && !slot.ready && askablePairs(host.memory().entries, slot.pending).length > 0, ready: slot.ready !== null };
};

export async function askVerdicts(host: ChapterHost, generating: () => boolean): Promise<number> {
  const slot = slotOf(host);
  if (!verdictsOn(host) || slot.asking || slot.ready || generating()) return 0;
  const pairs = askablePairs(host.memory().entries, slot.pending);
  if (!pairs.length) return 0;
  const run = beginRun(host.deps.ownership);
  slot.asking = true;
  try {
    const raw = await askText(host.deps.model, buildVerdictPrompt(host.memory().entries, pairs), {
      role: "synthesis", pass: "supersession", maxTokens: VERDICT_MAX_TOKENS, signal: run.signal,
    });
    if (!run.stillOwns()) return 0;
    const asked = new Set(pairs);
    slot.pending = slot.pending.filter((pair) => !asked.has(pair));
    slot.ready = { plan: planVerdicts(stripChannelNoise(raw), pairs), run };
    return pairs.length;
  } finally {
    slot.asking = false;
  }
}

export function applyReadyVerdicts(host: ChapterHost): { superseded: number; cleared: number } | null {
  const slot = slotOf(host);
  const ready = slot.ready;
  slot.ready = null;
  if (!ready || !verdictsOn(host) || !ready.run.stillOwns()) return null;
  const state = host.deps.getState();
  const memory = host.memory();
  const applied = applyVerdicts(memory, ready.plan, { messageId: state?.lastMessageId ?? -1, boundary: state?.boundary ?? 0 });
  if (!applied.superseded.length && !applied.cleared.length) return { superseded: 0, cleared: 0 };
  host.patch({ entries: applied.state.entries });
  if (applied.superseded.length) {
    host.record({ kind: "dedup", inputs: applied.superseded.flatMap((pair) => [pair.candidateId, pair.existingId]), removed: [] });
  }
  host.coordinator.updateInjection();
  host.deps.journal?.("supersession-verdicts", `${applied.superseded.length} older ${applied.superseded.length === 1 ? "memory" : "memories"} retired, ${applied.cleared.length} kept as separate`);
  void host.save();
  return { superseded: applied.superseded.length, cleared: applied.cleared.length };
}
