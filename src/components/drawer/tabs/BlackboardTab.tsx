import type { RuntimeSnapshot } from "@runtime/types";

const readerLabel = (meta: RuntimeSnapshot["blackboardMeta"][string] | undefined) => {
  if (!meta?.reader) return "";
  const confidence = meta.confidence !== undefined ? ` ${Math.round((meta.confidence ?? 0) * 100)}%` : "";
  return ` · ${meta.reader}${confidence}`;
};

export const BlackboardTab = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div>
    <div className="font-medium mb-1">Blackboard</div>
    {Object.keys(snapshot.blackboard).length === 0 ? (
      <div className="text-xs opacity-70">No blackboard values yet.</div>
    ) : (
      <div data-so="blackboard-scroll" className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr><th className="text-left">Key</th><th className="text-left">Value</th><th className="text-left">Source</th></tr></thead>
        <tbody>
          {Object.entries(snapshot.blackboard).map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{String(value)}</td>
              <td title={snapshot.blackboardMeta[key]?.evidence ?? ""}>
                {snapshot.blackboardMeta[key]?.source}
                {readerLabel(snapshot.blackboardMeta[key])}
                {snapshot.blackboardMeta[key]?.latched ? " (locked)" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    )}
  </div>
);
