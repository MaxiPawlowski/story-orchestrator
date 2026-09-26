import React, { useMemo } from "react";
import { useDraftStore } from "../draft";
import { draftEdges, qualitySignature, replayGate, type ReplayRow } from "../gateReplay";
import { useGateReplaySource } from "../replayContext";

const at = (row: ReplayRow) => `boundary ${row.boundary} (message ${row.messageId})`;

const rowText = (row: ReplayRow): string => {
  if (row.manual) return "manual activation, no gate evaluated";
  if (row.holds === "unknown") return "unknown";
  const verdict = row.wouldFire === true ? "would fire" : row.holds ? "holds, a higher-priority exit fires" : "does not hold";
  return row.recordedFire ? `${verdict} · recorded: fired` : verdict;
};

const GateReplayPanel: React.FC<{ index: number }> = ({ index }) => {
  const draft = useDraftStore((state) => state.draft);
  const source = useGateReplaySource();
  const transition = draft.transitions[index];
  const usable = Boolean(source && transition && draft.id && draft.id === source.storyId);
  const result = useMemo(() => {
    if (!source || !usable) return null;
    const edges = draftEdges(draft.transitions);
    return replayGate({ edge: edges[index], siblings: edges, history: source.history, declared: new Set(source.declared) });
  }, [source, usable, draft.transitions, index]);

  if (!source || !usable || !result) {
    return (
      <div data-so="gate-replay" data-state="unavailable" className="st-subpanel p-2 text-xs st-muted">
        Open the Studio from a chat that plays this story to replay its history.
      </div>
    );
  }

  const qualitiesEdited = qualitySignature(draft.qualities) !== source.qualitySignature;
  const cut = result.divergesAt ?? (result.manualAt !== null ? result.manualAt : null);
  const summary = result.firstHold
    ? `Would first hold at ${at(result.firstHold)}`
    : `Never held in the last ${result.window.boundaries} boundaries`;
  const recorded = result.recordedFire ? `recorded: fired at boundary ${result.recordedFire.boundary}` : "recorded: did not fire";
  const shown = result.rows.filter((row) => row.atSource || row.recordedFire || row.manual);

  return (
    <div data-so="gate-replay" data-state={result.firstHold ? "holds" : "never"} className="st-subpanel flex flex-col gap-1 p-2 text-xs">
      <div className="font-medium" data-so="gate-replay-summary">{summary} · {recorded}</div>
      {result.unknownQualities.length ? (
        <div data-so="gate-replay-unknown" className="st-muted">Unknown: this chat&apos;s story declares no {result.unknownQualities.join(", ")}, so boundaries that read it are not replayed.</div>
      ) : null}
      {cut !== null ? (
        <div data-so="gate-replay-cut" className="st-muted">
          {result.divergesAt !== null
            ? `Valid up to boundary ${cut}: the draft would have moved the story differently there.`
            : `Valid before boundary ${cut}: a manual activation changed the path there.`}
        </div>
      ) : null}
      {qualitiesEdited ? (
        <div data-so="gate-replay-limit" className="st-muted">Values were recorded after writes: changes to a quality&apos;s type, options, latching or monotonic setting are not replayed.</div>
      ) : null}
      <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto" aria-label="Replayed boundaries">
        {shown.map((row) => (
          <li key={row.boundary} data-so="gate-replay-row" data-boundary={row.boundary} className={row.afterDivergence ? "st-muted" : ""}>
            {source.jump ? (
              <button type="button" className="menu_button text-xs" data-so="gate-replay-jump" data-mesid={row.messageId} onClick={() => source.jump?.(row.messageId)}>{at(row)}</button>
            ) : at(row)}
            {" "}{rowText(row)}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GateReplayPanel;
