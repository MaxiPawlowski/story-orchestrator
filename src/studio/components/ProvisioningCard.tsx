import React, { lazy, Suspense, useState } from "react";
import { describeProvisioningOp, validateProvisioningOp, type ExistingEntry, type ProvisioningEnvironment, type ProvisioningOp } from "@wizard/index";
import { cardFindings, cardWarnings } from "@wizard/cardChecks";
import type { StoryV2 } from "@engine/index";
import type { CardReadBackRecord } from "@utils/cardReadBack";
import {
  bookSiblings, draftLoreTexts, gatedAt, loreKeyLint, loreOpEntry, loreOpLintEntry, opCards, previewKeyMatches, renderKeyMatchLine,
} from "@copilot/lorePreview";

export interface ProvisioningContext {
  draft: StoryV2;
  ops: readonly ProvisioningOp[];
}

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
  context?: ProvisioningContext;
  readBack?: CardReadBackRecord;
  onApply: (op: ProvisioningOp) => void;
}

const CharacterCardArt = lazy(() => import("./CharacterCardArt"));

type FieldSpec = { key: string; label: string; kind: "text" | "area" | "list" | "bool" | "select"; options?: Array<[string, string]> };

const LOGIC_OPTIONS: Array<[string, string]> = [
  ["", "Any secondary key appears (default)"],
  ["and-any", "Any secondary key appears"],
  ["and-all", "Every secondary key appears"],
  ["not-any", "No secondary key appears"],
  ["not-all", "Not every secondary key appears"],
];

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
    { key: "secondaryKeys", label: "Secondary keywords (checked after a keyword matched)", kind: "list" },
    { key: "logic", label: "Fires when", kind: "select", options: LOGIC_OPTIONS },
    { key: "outlet", label: "Outlet name (placed only where {{outlet::name}} is written)", kind: "text" },
    { key: "triggers", label: "Fires only on these generation types", kind: "list" },
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
const READ_BACK_TEXT: Record<CardReadBackRecord["state"], string> = {
  stored: "Read back: SillyTavern stored the card as sent.",
  unconfirmed: "Read back: could not read the card back, so it may exist. It is never created again.",
  mismatch: "Read back: SillyTavern stored some fields differently",
};

const CardNotes = ({ op, context, environment }: { op: Extract<ProvisioningOp, { kind: "createCharacterCard" }>; context: ProvisioningContext; environment: ProvisioningEnvironment }) => {
  const notes = cardWarnings(cardFindings(op, context.draft, environment));
  if (!notes.length) return null;
  return (
    <div data-so="card-notes" className="st-alert-warning flex flex-col gap-1 rounded px-2 py-1 text-[11px]" aria-label="Card notes">
      <span>Card notes (you can still create it):</span>
      <ul className="flex flex-col gap-0.5">{notes.map((note) => <li key={note.id} data-note={note.id}>{note.text}</li>)}</ul>
    </div>
  );
};

const LorePreview = ({ op, context }: { op: Extract<ProvisioningOp, { kind: "upsertLorebookEntry" }>; context: ProvisioningContext }) => {
  const preview = previewKeyMatches(loreOpEntry(op), draftLoreTexts(context.draft, opCards(context.ops)), gatedAt(context.draft, op.lorebook, op.comment));
  const lint = loreKeyLint(loreOpLintEntry(op), bookSiblings(context.ops, op.lorebook));
  return (
    <div data-so="lore-preview" className="flex flex-col gap-1 text-[11px]" aria-label="Key preview">
      <span data-so="key-matches" className="st-muted">{renderKeyMatchLine(preview)}</span>
      {preview.reasons.length ? <span data-so="key-uncertain" className="st-muted">May not fire: {preview.reasons.join("; ")}.</span> : null}
      {lint.length ? (
        <ul data-so="key-lint" className="st-alert-warning flex flex-col gap-0.5 rounded px-2 py-1" aria-label="Key lint">
          {lint.map((entry) => <li key={entry.id} data-lint={entry.id}>{entry.text}</li>)}
        </ul>
      ) : null}
    </div>
  );
};

const applyLabel = (draft: ProvisioningOp, applied: boolean, busy: boolean) => {
  if (applied) return draft.kind === "grantLorebook" ? "Confirmed" : "Created";
  if (busy) return "Working…";
  if (draft.kind === "grantLorebook") return draft.revoke ? "Revoke permission" : "Confirm permission";
  return "Create it";
};

const ProvisioningCard: React.FC<ProvisioningCardProps> = ({ op, environment, applied = false, result = null, failed = false, busy = false, existing, context, readBack, onApply }) => {
  const [draft, setDraft] = useState<ProvisioningOp>(op);
  const [listText, setListText] = useState<Record<string, string>>({});
  const fields = FIELDS[draft.kind];
  const record: Record<string, unknown> = { ...draft };
  const validation = validateProvisioningOp(draft, environment);

  const patch = (key: string, value: unknown) => setDraft((previous) => ({ ...previous, [key]: value }) as ProvisioningOp);
  const editText = (field: FieldSpec, value: string) => {
    if (field.kind !== "list") return patch(field.key, value);
    setListText((previous) => ({ ...previous, [field.key]: value }));
    patch(field.key, value.split(",").map((entry) => entry.trim()).filter(Boolean));
  };

  return (
    <section data-so="provisioning-card" className="st-subpanel flex flex-col gap-2 p-2" aria-label={`Provisioning: ${describeProvisioningOp(draft).label}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="st-pill px-2 py-0.5 text-[10px]">{KIND_LABELS[draft.kind]}</span>
        <span className="text-sm">{describeProvisioningOp(draft).label}</span>
      </div>
      {draft.kind === "createCharacterCard" ? (
        <Suspense fallback={<span className="text-[11px] st-muted" role="status">Loading artwork…</span>}>
          <CharacterCardArt name={draft.name} created={applied} />
        </Suspense>
      ) : null}
      {fields.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-xs">
          <span className="st-muted">{field.label}</span>
          {field.kind === "bool" ? (
            <input type="checkbox" checked={Boolean(record[field.key])} disabled={applied} onChange={(event) => patch(field.key, event.target.checked)} />
          ) : field.kind === "select" ? (
            <select className="text_pole st-input" value={asText(record[field.key], "text")} disabled={applied} onChange={(event) => patch(field.key, event.target.value || undefined)}>
              {(field.options ?? []).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          ) : field.kind === "area" ? (
            <textarea className="text_pole st-input min-h-[48px]" value={asText(record[field.key], field.kind)} disabled={applied} onChange={(event) => patch(field.key, event.target.value)} />
          ) : (
            <input
              className="text_pole st-input"
              value={field.kind === "list" ? listText[field.key] ?? asText(record[field.key], field.kind) : asText(record[field.key], field.kind)}
              disabled={applied}
              onChange={(event) => editText(field, event.target.value)}
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
      {context && !applied && draft.kind === "createCharacterCard" ? <CardNotes op={draft} context={context} environment={environment} /> : null}
      {context && draft.kind === "upsertLorebookEntry" ? <LorePreview op={draft} context={context} /> : null}
      {readBack ? (
        <div data-so="card-readback" data-state={readBack.state} className={`${readBack.state === "stored" ? "st-muted" : "st-alert-warning"} rounded px-2 py-1 text-[11px]`} role="status">
          {READ_BACK_TEXT[readBack.state]}{readBack.state === "mismatch" ? `: ${readBack.lossy.join(", ")}.` : ""}
        </div>
      ) : null}
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
