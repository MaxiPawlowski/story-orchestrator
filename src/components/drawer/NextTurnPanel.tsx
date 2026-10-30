import { formatShare, nextTurnCostText } from "@runtime/nextTurn";
import { promptBucketsText, type PromptBucketState } from "@runtime/promptBuckets";
import type { RuntimeSnapshot } from "@runtime/types";
import { tierOfKey, trimText } from "./memoryFate";
import { Button } from "@components/ui/Button";
import { StatusText } from "@components/ui/StatusText";

export type NextTurnOwnerTab = RuntimeSnapshot["nextTurn"][number]["ownerTab"];

export interface NextTurnActions {
  clearNote: () => void;
  rerunScene: () => Promise<void>;
}

const OWNER_LABELS: Record<NextTurnOwnerTab, string> = { memory: "Open Memory", state: "Open State", proposals: "Open Proposals", config: "Open settings", payload: "" };

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
    <details data-so="next-turn-foreign" className="border-t border-solid border-[var(--so-line)] pt-1">
      <summary className="cursor-pointer opacity-100">Other extensions ({rows.length} block{rows.length === 1 ? "" : "s"}{total === null ? "" : `, ${total} tokens`}) · read-only</summary>
      {rows.map((row) => (
        <div key={row.key} data-so="next-turn-foreign-row" data-key={row.key} className="pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="opacity-100">{row.label}</span>
            <span className="opacity-70">{row.positionLabel} · depth {row.depth} · role {row.role} · {tokenText(row.tokens, row.tokenSource, row.share)}</span>
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
    return <div data-so="next-turn-buckets" data-state="unavailable" className="opacity-70">Prompt buckets unavailable: {state.unavailable}</div>;
  }
  return (
    <div data-so="next-turn-buckets" data-state={state.matches ? "matches" : "mismatch"} className="opacity-80">
      {promptBucketsText(state)}
      {state.oursExceedsHistory && (
        <StatusText as="div" tone="warn" data-so="next-turn-buckets-tokenizers">
          Story Orchestrator&apos;s count is larger than ST&apos;s chat history: the two counts come from different tokenizers, so read ours as an estimate.
        </StatusText>
      )}
    </div>
  );
};

const TrimNote = ({ injection, rowKey }: { injection: RuntimeSnapshot["memoryInjection"]; rowKey: string }) => {
  const tier = tierOfKey(rowKey);
  const text = tier ? trimText(injection, tier) : null;
  return text ? <div data-so="next-turn-trim" className="opacity-70">{text}</div> : null;
};

export const NextTurnPanel = ({ snapshot, actions, onOpenOwner }: { snapshot: RuntimeSnapshot; actions: NextTurnActions; onOpenOwner: (tab: NextTurnOwnerTab) => void }) => {
  const rows = snapshot.nextTurn;
  const cost = snapshot.nextTurnCost;
  return (
    <div id="so-next-turn" className="flex flex-col gap-1">
      <div className="font-medium opacity-100">Next reply ({rows.length} contributor{rows.length === 1 ? "" : "s"})</div>
      <div data-so="next-turn-cost" data-budget={cost.budget ?? "unknown"} className="opacity-80">{nextTurnCostText(cost)}</div>
      <PromptBucketsLine state={snapshot.nextTurnBuckets} />
      {snapshot.nextTurnFold ? (
        <div data-so="next-turn-fold" className="opacity-80">
          {snapshot.nextTurnFold} earlier message{snapshot.nextTurnFold === 1 ? "" : "s"} summarized by the chronicle, left out of the prompt.
        </div>
      ) : null}
      {cost.lastGenerationBudget !== null && cost.budget !== null && cost.lastGenerationBudget !== cost.budget && (
        <StatusText as="div" tone="warn" data-so="next-turn-budget-drift">The last generation was handed {cost.lastGenerationBudget} tokens, not {cost.budget}: a setting changed since.</StatusText>
      )}
      {rows.length === 0 ? (
        <div className="opacity-70">Nothing is injected into the next reply.</div>
      ) : rows.map((row) => (
        <div key={`${row.key}:${row.target ?? ""}`} data-so="next-turn-row" data-key={row.key} className="border-t border-solid border-[var(--so-line)] pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="opacity-100">{row.label}</span>
            <span data-so="next-turn-tokens" className="opacity-70">depth {row.depth} · {row.characters} chars · {tokenText(row.tokens, row.tokenSource, row.share)}</span>
            {row.target && <span className="st-pill px-1 text-[10px]" title="Injected only for the member ST drafts">private → {row.target}</span>}
            {row.oneTurn && <span data-so="next-turn-one-turn" className="st-pill px-1 text-[10px]">one turn</span>}
            {row.freshness !== "live" && <StatusText as="span" tone="warn">{row.freshness}</StatusText>}
            {row.fallback && <StatusText as="span" tone="warn">fell back ({row.fallback})</StatusText>}
          </div>
          <div className="opacity-70">{row.owner}</div>
          <div className="whitespace-pre-wrap opacity-80">{row.preview}</div>
          <TrimNote injection={snapshot.memoryInjection} rowKey={row.key} />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {row.oneShot && (
              <Button data-so="next-turn-clear" size="sm" onClick={() => actions.clearNote()}>Clear the note</Button>
            )}
            {row.key === "story_orchestrator_scene" && (
              <Button data-so="next-turn-reread-scene" size="sm" onClick={() => void actions.rerunScene()}>Re-read the scene</Button>
            )}
            {row.ownerTab === "payload" ? (
              <span className="opacity-70">edited here, in the driver</span>
            ) : (
              <Button data-so="next-turn-open-owner" data-owner-tab={row.ownerTab} size="sm" onClick={() => onOpenOwner(row.ownerTab)}>{OWNER_LABELS[row.ownerTab]}</Button>
            )}
          </div>
        </div>
      ))}
      {snapshot.memoryInjection && <div className="opacity-70">Epistemic and ledger blocks keep their own caps; their rows have no fate here.</div>}
      <ForeignGroup snapshot={snapshot} />
    </div>
  );
};
