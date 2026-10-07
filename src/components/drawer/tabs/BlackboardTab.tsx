import type { RuntimeSnapshot } from "@runtime/types";
import { blackboardRows } from "@runtime/blackboardView";
import { CharacterLifePanel } from "../CharacterLifePanel";

const readerLabel = (meta: RuntimeSnapshot["blackboardMeta"][string] | undefined) => {
  if (!meta?.reader) return "";
  const confidence = meta.confidence !== undefined ? ` ${Math.round((meta.confidence ?? 0) * 100)}%` : "";
  return ` · ${meta.reader}${confidence}`;
};

export const BlackboardTab = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const rows = blackboardRows(snapshot);
  return (
    <div>
      <div className="font-medium mb-1">Blackboard</div>
      {rows.length === 0 ? (
        <div className="text-xs opacity-70">No blackboard values yet.</div>
      ) : (
        <div data-so="blackboard-scroll" className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr><th className="text-left">Key</th><th className="text-left">Value</th><th className="text-left">Next turn</th><th className="text-left">Source</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-so="blackboard-row" data-key={row.key} data-gate={row.gate ? "true" : undefined}>
                <td>{row.key}{row.gate ? <span className="opacity-70" title="Read by a gate out of the active checkpoint"> · gate</span> : null}</td>
                <td>{row.set ? String(row.value) : <span className="opacity-70">unset</span>}</td>
                <td data-so="blackboard-pending">{row.pending ? `→ ${String(row.pending.value)}` : ""}</td>
                <td title={snapshot.blackboardMeta[row.key]?.evidence ?? ""}>
                  {snapshot.blackboardMeta[row.key]?.source}
                  {readerLabel(snapshot.blackboardMeta[row.key])}
                  {snapshot.blackboardMeta[row.key]?.latched ? " (locked)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {snapshot.lifeAuthor ? <CharacterLifePanel life={snapshot.lifeAuthor} /> : null}
    </div>
  );
};
