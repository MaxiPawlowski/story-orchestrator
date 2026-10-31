import type { LoreBudgetView } from "@runtime/loreBudget";
import { Badge } from "@components/ui/Badge";

export const LoreBudgetPanel = ({ view }: { view: LoreBudgetView | null | undefined }) => {
  if (!view) return null;
  return (
    <section id="so-lore-budget" data-so="lore-budget" className="so-console-block" aria-labelledby="so-lore-budget-title">
      <h4 id="so-lore-budget-title">Cut by budget</h4>
      <p className="so-muted">
        Story lorebook entries that matched but did not fit SillyTavern's World Info budget, over the last {view.scans} replies. Author view only.
      </p>
      {view.lastCut.length ? (
        <ul className="so-plain-list" data-so="lore-budget-rows">
          {view.lastCut.map((row) => (
            <li key={`${row.book}.${row.uid}`} data-so="lore-budget-row" data-via={row.via}>
              {row.comment || `${row.book} ${row.uid}`} <span className="so-muted">({row.book})</span>{" "}
              {row.via === "forced" && <Badge tone="warn">picked for this scene</Badge>}
            </li>
          ))}
        </ul>
      ) : <p data-so="lore-budget-none">Nothing was cut on the last reply.</p>}
      {view.consumer && view.lastCut.length > 0 && <p data-so="lore-budget-consumer">Most of the budget went to "{view.consumer}".</p>}
      <p className="so-muted" data-so="lore-budget-cap">
        Budget cap: {view.cap === null ? "unknown" : view.cap === 0 ? "none" : `${view.cap} tokens`}; this story's lorebooks hold about {view.storyTokens} tokens.
      </p>
    </section>
  );
};

export default LoreBudgetPanel;
