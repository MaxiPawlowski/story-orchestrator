import React, { useMemo } from "react";
import { isValidationErrorList, parseStoryV2, type BlackboardSnapshot } from "@engine/index";
import { deriveScopeExplained } from "@extraction/scope";
import { useDraftStore } from "../draft";

const EMPTY_BLACKBOARD: BlackboardSnapshot = { values: {}, versions: {}, latched: {} };

const ScopePreview: React.FC<{ checkpointId: string }> = ({ checkpointId }) => {
  const draft = useDraftStore((state) => state.draft);
  const scope = useMemo(() => {
    const parsed = parseStoryV2(draft);
    if (isValidationErrorList(parsed)) return null;
    if (!parsed.checkpointById[checkpointId]) return [];
    return deriveScopeExplained(parsed, checkpointId, EMPTY_BLACKBOARD);
  }, [draft, checkpointId]);

  if (scope === null) return <div className="text-xs st-muted">Resolve validation errors to preview extraction scope.</div>;
  if (scope.length === 0) return <div className="text-xs st-muted">No extractor qualities in scope here.</div>;

  return (
    <ul aria-label="Scope preview" className="flex flex-col gap-1">
      {scope.map((entry) => (
        <li key={entry.key} className="st-subpanel p-2 text-sm">
          <div className="font-medium">{entry.key}</div>
          <div className="text-xs st-muted">{entry.pulledBy.map((pull) => pull.detail).join("; ")}</div>
          {entry.hints.length ? <div className="text-[11px] st-muted">hints: {entry.hints.join("; ")}</div> : null}
        </li>
      ))}
    </ul>
  );
};

export default ScopePreview;
