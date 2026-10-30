import { useState } from "react";
import type { RuntimeSnapshot } from "@runtime/types";
import { blackboardRows, stateTable, type StateRow } from "@runtime/blackboardView";
import { STATE_GROUP_LABELS, STATE_GROUPS, type StateGroup } from "@runtime/authorConsole";
import { shownLife } from "@runtime/surfaceShown";
import { SearchField } from "@components/ui/SearchField";
import { Chip } from "@components/ui/Badge";
import { EmptyState } from "@components/ui/EmptyState";
import { CharacterLifePanel, type MeanwhileDecide } from "../CharacterLifePanel";
import { FactionsPanel } from "../FactionsPanel";
import ScenePanel from "../ScenePanel";
import { MessageCitation } from "../MessageCitation";

type Meta = RuntimeSnapshot["blackboardMeta"][string] | undefined;

const readerLabel = (meta: Meta) => {
  if (!meta?.reader) return "";
  const confidence = meta.confidence !== undefined ? ` ${Math.round((meta.confidence ?? 0) * 100)}%` : "";
  return ` · ${meta.reader}${confidence}`;
};

const EvidenceButton = ({ row, evidence }: { row: StateRow; evidence: string }) => {
  const [open, setOpen] = useState(false);
  const id = `so-evidence-${row.key}`;
  return (
    <span className="so-popover-anchor">
      <button type="button" className="so-link-btn" data-so="state-evidence" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>Evidence</button>
      {open && <span id={id} role="note" className="so-popover" data-so="state-evidence-text">{evidence}</span>}
    </span>
  );
};

const StateTableRow = ({ row, meta }: { row: StateRow; meta: Meta }) => (
  <tr data-so="blackboard-row" data-key={row.key} data-gate={row.gate ? "true" : undefined} data-group={row.group} data-fresh={row.fresh ? "true" : undefined}>
    <td data-label="Key">
      <span className="so-mono">{row.key}</span>
      {row.label !== row.key && <span className="so-muted"> {row.label}</span>}
    </td>
    <td data-label="Value">{row.set ? String(row.value) : <span className="so-muted">unset</span>}</td>
    <td data-label="Next turn" data-so="blackboard-pending">{row.pending ? `→ ${String(row.pending.value)}` : "—"}</td>
    <td data-label="Changed" data-so="state-changed">
      {row.changedAt ? <>boundary {row.changedAt.boundary} <MessageCitation messageId={row.changedAt.messageId} prefix="msg" /></> : <span className="so-muted">—</span>}
    </td>
    <td data-label="Source" className="so-state-source">
      {meta?.source}
      {readerLabel(meta)}
      {meta?.latched ? " (locked)" : ""}
      {meta?.evidence && <> <EvidenceButton row={row} evidence={meta.evidence} /></>}
    </td>
  </tr>
);

const StateTable = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<StateGroup | "all">("all");
  const rows = blackboardRows(snapshot);
  const meta = snapshot.consoleAuthor?.keys ?? {};
  const all = stateTable(rows, meta, snapshot.boundary);
  const groups = stateTable(rows, meta, snapshot.boundary, query, only);
  if (!rows.length) return <EmptyState icon="fa-table-list" title="No blackboard values yet.">Values appear once the story reads the chat or a checkpoint writes one.</EmptyState>;
  return (
    <div data-so="state-table" className="so-console-block">
      <div className="so-console-toolbar">
        <SearchField label="Search keys" value={query} onChange={setQuery} data-so="state-search" />
        <div className="so-chip-row" role="group" aria-label="Show group">
          <Chip selected={only === "all"} onClick={() => setOnly("all")} data-so="state-group-filter">All {rows.length}</Chip>
          {STATE_GROUPS.filter((group) => all.some((entry) => entry.group === group)).map((group) => (
            <Chip key={group} selected={only === group} onClick={() => setOnly(only === group ? "all" : group)} data-so="state-group-filter">
              {STATE_GROUP_LABELS[group]} {all.find((entry) => entry.group === group)?.rows.length ?? 0}
            </Chip>
          ))}
        </div>
      </div>
      {groups.length === 0 ? <p className="so-muted" data-so="state-no-match">No key matches.</p> : (
        <div data-so="blackboard-scroll" className="so-table-scroll">
          <table className="so-state-table">
            <thead><tr><th>Key</th><th>Value</th><th>Next turn</th><th>Changed</th><th className="so-state-source">Source</th></tr></thead>
            {groups.map((entry) => (
              <tbody key={entry.group} data-so="state-group" data-group={entry.group}>
                <tr className="so-state-group-row"><th colSpan={5} scope="rowgroup">{STATE_GROUP_LABELS[entry.group]}</th></tr>
                {entry.rows.map((row) => <StateTableRow key={row.key} row={row} meta={snapshot.blackboardMeta[row.key]} />)}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
};

const Tension = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div className="so-console-block" data-so="state-tension">
    <h4>Tension</h4>
    <p>Level: {snapshot.tension.level ?? "—"} {snapshot.tension.smoothed !== null && <span className="so-muted">({snapshot.tension.smoothed.toFixed(2)})</span>}
      {" · "}expected {snapshot.tension.expected !== null ? snapshot.tension.expected.toFixed(2) : "—"}</p>
    {snapshot.tension.hint && <p>Steering: {snapshot.tension.hint.direction} — {snapshot.tension.hint.text}</p>}
  </div>
);

const Convergence = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (snapshot.convergence.length ? (
  <div className="so-console-block" data-so="state-convergence">
    <h4>Convergence</h4>
    {snapshot.convergence.map((entry) => {
      const pct = entry.threshold > 0 ? Math.min(100, Math.round((entry.progress / entry.threshold) * 100)) : 100;
      return (
        <div key={entry.anchorId} className="so-meter-row">
          <span>{entry.anchorName}{entry.visited ? " · visited" : ""}{entry.reached ? " ✔" : ""}</span>
          <span className="so-meter" role="meter" aria-label={entry.anchorName} aria-valuemin={0} aria-valuemax={entry.threshold} aria-valuenow={entry.progress}>
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="so-muted">{entry.progress}/{entry.threshold}</span>
        </div>
      );
    })}
  </div>
) : null);

const PendingWrites = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (snapshot.pendingDeltas.length ? (
  <div className="so-console-block" data-so="state-pending">
    <h4>Pending writes</h4>
    <ul className="so-plain-list">{snapshot.pendingDeltas.map((pending) => <li key={pending.quality}><span className="so-mono">{pending.quality}</span> → {String(pending.value)}</li>)}</ul>
  </div>
) : null);

export const StateSection = ({ snapshot, onDecideMeanwhile }: { snapshot: RuntimeSnapshot; onDecideMeanwhile?: MeanwhileDecide }) => {
  const life = shownLife(snapshot);
  return (
    <div className="so-console-stack">
      <StateTable snapshot={snapshot} />
      <PendingWrites snapshot={snapshot} />
      <Tension snapshot={snapshot} />
      <Convergence snapshot={snapshot} />
      <ScenePanel scene={snapshot.scene} />
      {life ? <CharacterLifePanel life={life} onDecide={onDecideMeanwhile} cues={snapshot.cuesAuthor} /> : null}
      {snapshot.factionsAuthor ? <FactionsPanel factions={snapshot.factionsAuthor} /> : null}
    </div>
  );
};
