import React from "react";
import type { ValidationError } from "@engine/index";
import { useDraftStore } from "../draft";
import type { Diagnostic } from "../diagnostics";

const DiagnosticRow: React.FC<{ label: string; message: string; path: string; tone: "error" | "warn" | "muted" }> = ({ label, message, path, tone }) => (
  <li className={`st-subpanel flex flex-col gap-0.5 p-2 text-sm ${tone === "error" ? "st-alert-error" : ""}`}>
    <div className="flex items-center gap-2">
      <span className={`st-pill px-2 py-0.5 text-[10px] ${tone === "warn" ? "st-text-error" : ""}`}>{label}</span>
      <span>{message}</span>
    </div>
    <span className="text-[11px] st-muted">{path}</span>
  </li>
);

const DiagnosticsPanel: React.FC = () => {
  const diagnostics = useDraftStore((state) => state.diagnostics);
  const errors = useDraftStore((state) => state.errors);
  const blocking = diagnostics.filter((entry: Diagnostic) => entry.severity === "blocking");
  const warnings = diagnostics.filter((entry: Diagnostic) => entry.severity === "warning");
  const total = errors.length + diagnostics.length;

  if (total === 0) {
    return <div className="st-alert-success rounded px-3 py-2 text-sm">No issues — this story is ready to save.</div>;
  }

  return (
    <div className="flex flex-col gap-3" aria-label="Diagnostics">
      {errors.length ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold st-muted">Schema errors ({errors.length})</h3>
          <ul className="flex flex-col gap-1">
            {errors.map((error: ValidationError, index) => <DiagnosticRow key={index} label="schema" message={error.message} path={error.path} tone="error" />)}
          </ul>
        </section>
      ) : null}
      {blocking.length ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold st-muted">Blocking ({blocking.length})</h3>
          <ul className="flex flex-col gap-1">
            {blocking.map((entry, index) => <DiagnosticRow key={index} label={entry.code} message={entry.message} path={entry.path} tone="error" />)}
          </ul>
        </section>
      ) : null}
      {warnings.length ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold st-muted">Warnings ({warnings.length})</h3>
          <ul className="flex flex-col gap-1">
            {warnings.map((entry, index) => <DiagnosticRow key={index} label={entry.code} message={entry.message} path={entry.path} tone="warn" />)}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

export default DiagnosticsPanel;
