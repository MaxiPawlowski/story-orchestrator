import { MEMORY_INJECTION_KEY_PREFIX } from "@constants/injectionRegistry";
import type { MemoryFate, MemoryInjectionView, MemoryTier } from "@memory/index";

export const FATE_LABELS: Record<MemoryFate, string> = {
  injected: "in the prompt",
  quarantined: "held out: quarantined",
  superseded: "held out: superseded",
  folded: "held out: folded",
  "other-speaker": "held out: another speaker's",
  private: "held out: kept from the speaking character",
  "near-duplicate": "held out: a newer row says the same",
  "over-budget": "trimmed: over budget",
  "pinned-overflow": "trimmed: pinned, did not fit",
};

export const tierOfKey = (key: string): MemoryTier | null => (key.startsWith(MEMORY_INJECTION_KEY_PREFIX) ? (key.slice(MEMORY_INJECTION_KEY_PREFIX.length) as MemoryTier) : null);

export function trimText(view: MemoryInjectionView | null, tier: MemoryTier): string | null {
  const trim = view?.trim[tier];
  if (!trim) return null;
  const held = trim.filtered ? ` · ${trim.filtered} held out before the budget` : "";
  return `${trim.injected} of ${trim.candidates} rows · ${trim.tokensUsed} of ${trim.budget} budget tokens · ${trim.dropped} trimmed${held} · this session's largest ` +
    `${trim.highWater} (budget tokens are host counts where stored, else chars/4)`;
}
