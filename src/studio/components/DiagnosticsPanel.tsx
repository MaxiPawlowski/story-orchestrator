import React from "react";
import type { ValidationError } from "@engine/index";
import { useDraftStore } from "../draft";
import type { Diagnostic } from "../diagnostics";
import { placeOf, schemaConsequence } from "../schemaErrors";

// The plain consequence first, the technical line second. An author reads the first
// line to decide whether to care and the second to find the thing.
const DiagnosticRow: React.FC<{ label: string; message: string; path: string; tone: "error" | "warn" | "muted"; consequence?: string }> = ({ label, message, path, tone, consequence }) => (
  <li data-so="diagnostic" data-severity={tone} className={`st-subpanel flex flex-col gap-0.5 p-2 text-sm ${tone === "error" ? "st-alert-error" : ""}`}>
    <div className="flex items-start gap-2">
      <span className={`st-pill px-2 py-0.5 text-[10px] ${tone === "warn" ? "st-text-error" : ""}`}>{label}</span>
      <span className="flex flex-col gap-0.5">
        <span data-so="diagnostic-consequence">{consequence ?? message}</span>
        {consequence && <span className="text-[11px] st-muted">{message}</span>}
      </span>
    </div>
    <span data-so="diagnostic-place" className="text-[11px] st-muted">{path}</span>
  </li>
);

const DiagnosticsPanel: React.FC = () => {
  const diagnostics = useDraftStore((state) => state.diagnostics);
  const errors = useDraftStore((state) => state.errors);
  const draft = useDraftStore((state) => state.draft);
  const place = (path: string) => placeOf(draft, path);
  const blocking = diagnostics.filter((entry: Diagnostic) => entry.severity === "blocking");
  const warnings = diagnostics.filter((entry: Diagnostic) => entry.severity === "warning");
  const notes = diagnostics.filter((entry: Diagnostic) => entry.severity === "info");
  const issues = errors.length + blocking.length + warnings.length;
  const notesSection = notes.length ? (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold st-muted">Notes ({notes.length})</h3>
      <ul className="flex flex-col gap-1">
        {notes.map((entry, index) => <DiagnosticRow key={index} label={entry.code} message={entry.message} path={place(entry.path)} tone="muted" consequence={entry.consequence} />)}
      </ul>
    </section>
  ) : null;

  if (issues === 0) {
    return (
      <div className="flex flex-col gap-3" aria-label="Diagnostics">
        <div className="st-alert-success rounded px-3 py-2 text-sm">No issues — this story is ready to save.</div>
        {notesSection}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-label="Diagnostics">
      {errors.length ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold st-muted">Schema errors ({errors.length})</h3>
          <ul className="flex flex-col gap-1">
            {errors.map((error: ValidationError, index) => (
              <DiagnosticRow key={index} label="schema" message={error.message} path={place(error.path)} tone="error" consequence={schemaConsequence(error.message)} />
            ))}
          </ul>
        </section>
      ) : null}
      {blocking.length ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold st-muted">Blocking ({blocking.length})</h3>
          <ul className="flex flex-col gap-1">
            {blocking.map((entry, index) => <DiagnosticRow key={index} label={entry.code} message={entry.message} path={place(entry.path)} tone="error" consequence={entry.consequence} />)}
          </ul>
        </section>
      ) : null}
      {warnings.length ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold st-muted">Warnings ({warnings.length})</h3>
          <ul className="flex flex-col gap-1">
            {warnings.map((entry, index) => <DiagnosticRow key={index} label={entry.code} message={entry.message} path={place(entry.path)} tone="warn" consequence={entry.consequence} />)}
          </ul>
        </section>
      ) : null}
      {notesSection}
    </div>
  );
};

export default DiagnosticsPanel;
