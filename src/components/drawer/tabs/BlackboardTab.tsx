import type { RuntimeSnapshot } from "@runtime/types";

export const BlackboardTab = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div>
    <div className="font-medium mb-1">Blackboard</div>
    {Object.keys(snapshot.blackboard).length === 0 ? (
      <div className="text-xs opacity-70">No blackboard values yet.</div>
    ) : (
      <table className="w-full text-xs">
        <thead><tr><th className="text-left">Key</th><th className="text-left">Value</th><th className="text-left">Source</th></tr></thead>
        <tbody>
          {Object.entries(snapshot.blackboard).map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{String(value)}</td>
              <td title={snapshot.blackboardMeta[key]?.evidence ?? ""}>{snapshot.blackboardMeta[key]?.source}{snapshot.blackboardMeta[key]?.reader ? ` · ${snapshot.blackboardMeta[key]?.reader}${snapshot.blackboardMeta[key]?.confidence !== undefined ? ` ${Math.round((snapshot.blackboardMeta[key]?.confidence ?? 0) * 100)}%` : ""}` : ""}{snapshot.blackboardMeta[key]?.latched ? " (locked)" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);
