import React, { useState } from "react";
import { describeProvisioningOp, validateProvisioningOp, type ExistingEntry, type ProvisioningEnvironment, type ProvisioningOp } from "@wizard/index";

export interface ProvisioningCardProps {
  op: ProvisioningOp;
  environment: ProvisioningEnvironment;
  applied?: boolean;
  result?: string | null;
  failed?: boolean;
  busy?: boolean;
  // Undefined until the runtime has read the entry: "not asked yet" and "nothing there" are
  // different answers and only one of them is safe to show as "new entry".
  existing?: ExistingEntry | null;
  onApply: (op: ProvisioningOp) => void;
}

type FieldSpec = { key: string; label: string; kind: "text" | "area" | "list" | "bool" };

const FIELDS: Record<ProvisioningOp["kind"], FieldSpec[]> = {
  createCharacterCard: [
    { key: "name", label: "Name", kind: "text" },
    { key: "role", label: "Role in this story (for speaker direction)", kind: "text" },
    { key: "description", label: "Description", kind: "area" },
    { key: "personality", label: "Personality", kind: "area" },
    { key: "scenario", label: "Scenario", kind: "area" },
    { key: "first_mes", label: "First message", kind: "area" },
    { key: "mes_example", label: "Example dialogue", kind: "area" },
    { key: "tags", label: "Tags", kind: "list" },
  ],
  createStoryLorebook: [{ key: "name", label: "Lorebook name", kind: "text" }],
  upsertLorebookEntry: [
    { key: "lorebook", label: "Lorebook", kind: "text" },
    { key: "comment", label: "Entry title", kind: "text" },
    { key: "keys", label: "Keywords", kind: "list" },
    { key: "content", label: "Content", kind: "area" },
    { key: "constant", label: "Always in context", kind: "bool" },
  ],
  createGroup: [
    { key: "name", label: "Group name", kind: "text" },
    { key: "members", label: "Members", kind: "list" },
  ],
  grantLorebook: [
    { key: "lorebook", label: "Lorebook this story may write into", kind: "text" },
    { key: "revoke", label: "Revoke this story's write permission", kind: "bool" },
  ],
};

const KIND_LABELS: Record<ProvisioningOp["kind"], string> = {
  createCharacterCard: "new character card",
  createStoryLorebook: "new lorebook",
  upsertLorebookEntry: "lorebook entry",
  createGroup: "new group",
  grantLorebook: "write permission",
};

const asText = (value: unknown, kind: FieldSpec["kind"]): string => {
  if (kind === "list") return Array.isArray(value) ? value.join(", ") : "";
  return typeof value === "string" ? value : "";
};

// Every provisioning step is editable before it runs (ST-Copilot's edit-before-apply pattern): the
// model drafts, the author corrects, and only then does anything touch the install.
const applyLabel = (draft: ProvisioningOp, applied: boolean, busy: boolean) => {
  if (applied) return draft.kind === "grantLorebook" ? "Confirmed" : "Created";
  if (busy) return "Working…";
  if (draft.kind === "grantLorebook") return draft.revoke ? "Revoke permission" : "Confirm permission";
  return "Create it";
};

const ProvisioningCard: React.FC<ProvisioningCardProps> = ({ op, environment, applied = false, result = null, failed = false, busy = false, existing, onApply }) => {
  const [draft, setDraft] = useState<ProvisioningOp>(op);
  const fields = FIELDS[draft.kind];
  const record = draft as unknown as Record<string, unknown>;
  const validation = validateProvisioningOp(draft, environment);

  const patch = (key: string, value: unknown) => setDraft((previous) => ({ ...previous, [key]: value }) as ProvisioningOp);

  return (
    <section data-so="provisioning-card" className="st-subpanel flex flex-col gap-2 p-2" aria-label={`Provisioning: ${describeProvisioningOp(draft).label}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="st-pill px-2 py-0.5 text-[10px]">{KIND_LABELS[draft.kind]}</span>
        <span className="text-sm">{describeProvisioningOp(draft).label}</span>
      </div>
      {fields.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-xs">
          <span className="st-muted">{field.label}</span>
          {field.kind === "bool" ? (
            <input type="checkbox" checked={Boolean(record[field.key])} disabled={applied} onChange={(event) => patch(field.key, event.target.checked)} />
          ) : field.kind === "area" ? (
            <textarea className="text_pole st-input min-h-[48px]" value={asText(record[field.key], field.kind)} disabled={applied} onChange={(event) => patch(field.key, event.target.value)} />
          ) : (
            <input
              className="text_pole st-input"
              value={asText(record[field.key], field.kind)}
              disabled={applied}
              onChange={(event) => patch(field.key, field.kind === "list" ? event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean) : event.target.value)}
            />
          )}
        </label>
      ))}
      {draft.kind === "grantLorebook" ? (
        <div className="st-alert-warning rounded px-2 py-1 text-[11px]">
          This is an existing lorebook. Confirming lets this story’s wizard update entries in it. The permission is saved only in this wizard session and can be revoked here.
        </div>
      ) : null}
      {!validation.ok && !applied ? <div className="st-alert-error rounded px-2 py-1 text-[11px]" role="alert">{validation.message}</div> : null}
      {/* R8: replacing an entry is a visible decision. Nothing exists under this title yet is a
          different claim from this overwrites what is there, and only the host can say which. */}
      {draft.kind === "upsertLorebookEntry" && existing !== undefined ? (
        <div data-so="entry-preview" className="flex flex-col gap-1 text-[11px]" aria-label="Entry preview">
          <span className="st-muted">{existing ? `Replaces the existing entry "${draft.comment}".` : `Nothing is filed under "${draft.comment}" yet — this adds it.`}</span>
          {existing ? (
            <div className="st-subpanel rounded px-2 py-1" aria-label="Current content">
              <span className="st-muted">Before</span>
              <p className="whitespace-pre-wrap">{existing.content}</p>
            </div>
          ) : null}
          <div className="st-subpanel rounded px-2 py-1" aria-label="New content">
            <span className="st-muted">{existing ? "After" : "Content"}</span>
            <p className="whitespace-pre-wrap">{draft.content}</p>
          </div>
        </div>
      ) : null}
      {result ? <div className={`${failed ? "st-alert-error" : "st-alert-success"} rounded px-2 py-1 text-[11px]`} role="status">{result}</div> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="st-button primary"
          data-so="provisioning-apply"
          disabled={applied || busy || !validation.ok}
          onClick={() => onApply(draft)}
        >
          {applyLabel(draft, applied, busy)}
        </button>
        <span className="text-[11px] st-muted">{draft.kind === "grantLorebook" ? "Changes permission, not the lorebook itself." : "Creates this in SillyTavern. Nothing existing is changed."}</span>
      </div>
    </section>
  );
};

export default ProvisioningCard;
