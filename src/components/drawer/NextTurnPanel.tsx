import { formatShare, nextTurnCostText } from "@runtime/nextTurn";
import { promptBucketsText, type PromptBucketState } from "@runtime/promptBuckets";
import type { RuntimeSnapshot } from "@runtime/types";
import { tierOfKey, trimText } from "./memoryFate";

export type NextTurnOwnerTab = RuntimeSnapshot["nextTurn"][number]["ownerTab"];

export interface NextTurnActions {
  clearNote: () => void;
  rerunScene: () => Promise<void>;
}

const OWNER_LABELS: Record<NextTurnOwnerTab, string> = { memory: "Open Memory", scheduler: "Open Scheduler", config: "Open settings", payload: "" };

const tokenText = (tokens: number | null, source: "host" | "estimate" | null, share: number | null): string => {
  if (tokens === null) return "counting…";
  const shareText = share === null ? "" : ` · ${formatShare(share)}`;
  return `${tokens} tokens${source === "estimate" ? " (estimate)" : ""}${shareText}`;
};

const ForeignGroup = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const rows = snapshot.nextTurnForeign;
  if (!rows.length) return null;
  const total = snapshot.nextTurnCost.foreignTokens;
  return (
    <details data-so="next-turn-foreign" className="border-t border-solid border-white/10 pt-1">
      <summary className="cursor-pointer opacity-100">Other extensions ({rows.length} block{rows.length === 1 ? "" : "s"}{total === null ? "" : `, ${total} tokens`}) · read-only</summary>
      {rows.map((row) => (
        <div key={row.key} data-so="next-turn-foreign-row" data-key={row.key} className="pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="opacity-100">{row.label}</span>
            <span className="opacity-60">{row.positionLabel} · depth {row.depth} · role {row.role} · {tokenText(row.tokens, row.tokenSource, row.share)}</span>
            {row.conditional && <span className="st-pill px-1 text-[10px]" title="ST asks this block's own filter at assembly and may skip it">conditional</span>}
          </div>
          <div className="whitespace-pre-wrap opacity-70">{row.firstLine}</div>
        </div>
      ))}
    </details>
  );
};

const PromptBucketsLine = ({ state }: { state: PromptBucketState | undefined }) => {
  if (!state || ("unavailable" in state && state.quiet)) return null;
  if ("unavailable" in state) {
    return <div data-so="next-turn-buckets" data-state="unavailable" className="opacity-60">Prompt buckets unavailable: {state.unavailable}</div>;
  }
  return (
    <div data-so="next-turn-buckets" data-state={state.matches ? "matches" : "mismatch"} className="opacity-80">
      {promptBucketsText(state)}
      {state.oursExceedsHistory && (
        <div data-so="next-turn-buckets-tokenizers" className="text-yellow-300">Story Orchestrator&apos;s count is larger than ST&apos;s chat history: the two counts come from different tokenizers, so read ours as an estimate.</div>
      )}
    </div>
  );
};

export const NextTurnPanel = ({ snapshot, actions, onOpenOwner }: { snapshot: RuntimeSnapshot; actions: NextTurnActions; onOpenOwner: (tab: NextTurnOwnerTab) => void }) => {
  const rows = snapshot.nextTurn;
  const cost = snapshot.nextTurnCost;
  return (
    <div id="so-next-turn" className="flex flex-col gap-1">
      <div className="font-medium opacity-100">Next reply ({rows.length} contributor{rows.length === 1 ? "" : "s"})</div>
      <div data-so="next-turn-cost" data-budget={cost.budget ?? "unknown"} className="opacity-80">{nextTurnCostText(cost)}</div>
      <PromptBucketsLine state={snapshot.nextTurnBuckets} />
      {cost.lastGenerationBudget !== null && cost.budget !== null && cost.lastGenerationBudget !== cost.budget && (
        <div data-so="next-turn-budget-drift" className="text-yellow-300">The last generation was handed {cost.lastGenerationBudget} tokens, not {cost.budget}: a setting changed since.</div>
      )}
      {rows.length === 0 ? (
        <div className="opacity-70">Nothing is injected into the next reply.</div>
      ) : rows.map((row) => (
        <div key={row.key} data-so="next-turn-row" data-key={row.key} className="border-t border-solid border-white/10 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="opacity-100">{row.label}</span>
            <span data-so="next-turn-tokens" className="opacity-60">depth {row.depth} · {row.characters} chars · {tokenText(row.tokens, row.tokenSource, row.share)}</span>
            {row.target && <span className="st-pill px-1 text-[10px]" title="Injected only for the member ST drafts">private → {row.target}</span>}
            {row.oneShot && <span className="st-pill px-1 text-[10px]">one turn</span>}
            {row.freshness !== "live" && <span className="text-yellow-300">{row.freshness}</span>}
            {row.fallback && <span className="text-yellow-300">fell back ({row.fallback})</span>}
          </div>
          <div className="opacity-60">{row.owner}</div>
          <div className="whitespace-pre-wrap opacity-80">{row.preview}</div>
          {tierOfKey(row.key) && trimText(snapshot.memoryInjection, tierOfKey(row.key)!) && (
            <div data-so="next-turn-trim" className="opacity-60">{trimText(snapshot.memoryInjection, tierOfKey(row.key)!)}</div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {row.oneShot && (
              <button data-so="next-turn-clear" className="menu_button text-xs" onClick={() => actions.clearNote()}>Clear the note</button>
            )}
            {row.key === "story_orchestrator_scene" && (
              <button data-so="next-turn-reread-scene" className="menu_button text-xs" onClick={() => void actions.rerunScene()}>Re-read the scene</button>
            )}
            {row.ownerTab === "payload" ? (
              <span className="opacity-60">edited here, in the driver</span>
            ) : (
              <button data-so="next-turn-open-owner" data-owner-tab={row.ownerTab} className="menu_button text-xs" onClick={() => onOpenOwner(row.ownerTab)}>{OWNER_LABELS[row.ownerTab]}</button>
            )}
          </div>
        </div>
      ))}
      {snapshot.memoryInjection && <div className="opacity-60">Epistemic and ledger blocks keep their own caps; their rows have no fate here.</div>}
      <ForeignGroup snapshot={snapshot} />
    </div>
  );
};
