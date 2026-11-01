import type { RailroadView } from "@runtime/railroadView";
import { PACE_FORCED_FLOOR } from "@runtime/railroadView";
import { Badge } from "@components/ui/Badge";

const percent = (share: number | null) => (share === null ? "none yet" : `${Math.round(share * 100)}%`);

const LEAF_WORD = { lead: "what happened in play", pace: "only the turn count" } as const;

export const RailroadPanel = ({ view }: { view: RailroadView | null | undefined }) => {
  if (!view) return null;
  const branches = Object.entries(view.branches);
  return (
    <section id="so-railroad" data-so="railroad" className="so-console-block" aria-labelledby="so-railroad-title">
      <h4 id="so-railroad-title">How the written-ahead story moved</h4>
      <p className="so-muted">From this chat's boundary log. Author view only.</p>
      <ul className="so-plain-list">
        <li data-so="railroad-share">
          Turning points opened by the turn count alone: <strong>{view.pace}</strong> of {view.living} ({percent(view.paceShare)}){" "}
          {view.overFloor
            ? <Badge tone="warn">above {Math.round(PACE_FORCED_FLOOR * 100)}%</Badge>
            : view.paceShare !== null && <Badge tone="ok">within {Math.round(PACE_FORCED_FLOOR * 100)}%</Badge>}
        </li>
        <li data-so="railroad-leaves">Moved by what happened in play: {view.lead}</li>
        <li data-so="railroad-quiet">Quiet runs of two or more player turns at a turning point: {view.quietRuns} (longest {view.longestQuiet})</li>
        <li data-so="railroad-branches">{branches.length ? `Branches: ${branches.map(([from, count]) => `${from} ${count}`).join(", ")}` : "No branch opened yet."}</li>
      </ul>
      {view.rows.length > 0 && (
        <ol className="so-plain-list" data-so="railroad-rows">
          {view.rows.slice(-8).map((row) => (
            <li key={`${row.boundary}-${row.to}`} data-so="railroad-row" data-leaf={row.leaf}>
              <span className="so-muted">boundary {row.boundary}</span> {row.from} → {row.to}: {LEAF_WORD[row.leaf]}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

export default RailroadPanel;
