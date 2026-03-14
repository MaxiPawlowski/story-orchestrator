import React, { useCallback, useMemo } from "react";
import {
  type AuthorNoteDraft,
  type StoryDraft,
  type CheckpointDraft,
} from "@utils/checkpoint-studio";
import { AUTHOR_NOTE_POSITION_OPTIONS, AUTHOR_NOTE_ROLE_OPTIONS } from "../constants";
import HelpTooltip from "../../HelpTooltip";

type Props = {
  draft: StoryDraft;
  checkpoint: CheckpointDraft;
  updateCheckpoint: (id: string, updater: (cp: CheckpointDraft) => CheckpointDraft) => void;
};

const AuthorNotesTab: React.FC<Props> = ({ draft, checkpoint, updateCheckpoint }) => {
  const authorNotesSignature = useMemo(() => {
    if (!checkpoint.authors_note) return "";
    try {
      return JSON.stringify(checkpoint.authors_note);
    } catch (err) {
      console.warn("[Story - AuthorNotesTab] Failed to stringify authors_note for signature", err);
      return `${checkpoint.id ?? ""}-authors-note`;
    }
  }, [checkpoint.id, checkpoint.authors_note]);

  const noteRoleKeys = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const push = (roleKey?: string | null) => {
      if (!roleKey) return;
      if (seen.has(roleKey)) return;
      seen.add(roleKey);
      ordered.push(roleKey);
    };
    Object.keys(draft.roles ?? {}).forEach(push);
    Object.keys(checkpoint.authors_note ?? {}).forEach(push);
    return ordered;
  }, [draft.roles, checkpoint.id, authorNotesSignature]);

  const updateAuthorNote = useCallback((roleKey: string, editor: (prev: AuthorNoteDraft | undefined) => AuthorNoteDraft | undefined) => {
    updateCheckpoint(checkpoint.id, (cp) => {
      const currentMap = { ...(cp.authors_note ?? {}) } as Record<string, AuthorNoteDraft | undefined>;
      const updated = editor(currentMap[roleKey]);
      if (updated) currentMap[roleKey] = updated;
      else delete currentMap[roleKey];
      const authors_note = Object.keys(currentMap).length ? currentMap : undefined;
      return { ...cp, authors_note };
    });
  }, [checkpoint.id, updateCheckpoint]);

  const patchNoteField = useCallback((roleKey: string, field: keyof AuthorNoteDraft, value: unknown) => {
    updateAuthorNote(roleKey, (prev) => {
      if (!prev?.text?.trim()) return prev;
      const next: AuthorNoteDraft = { ...prev };
      if (value === undefined || value === "") delete (next as Record<string, unknown>)[field];
      else (next as Record<string, unknown>)[field] = value;
      return next;
    });
  }, [updateAuthorNote]);

  if (!noteRoleKeys.length) {
    return <div className="text-xs st-muted">No story roles available for author notes.</div>;
  }

  const noteFields: Array<{
    key: keyof Pick<AuthorNoteDraft, "position" | "interval" | "depth" | "role">;
    label: string;
    title: string;
    kind: "select" | "number";
    min?: number;
    options?: typeof AUTHOR_NOTE_POSITION_OPTIONS | typeof AUTHOR_NOTE_ROLE_OPTIONS;
  }> = [
    {
      key: "position",
      label: "Position",
      title: "Choose where the note appears relative to the main prompt.",
      kind: "select",
      options: AUTHOR_NOTE_POSITION_OPTIONS,
    },
    {
      key: "interval",
      label: "Interval",
      title: "Apply the note every N turns; leave blank to use the default cadence.",
      kind: "number",
      min: 1,
    },
    {
      key: "depth",
      label: "Depth",
      title: "Adjust how strongly the note influences the model (preset-specific meaning).",
      kind: "number",
      min: 0,
    },
    {
      key: "role",
      label: "Send As",
      title: "Which role should supply the note?",
      kind: "select",
      options: AUTHOR_NOTE_ROLE_OPTIONS,
    },
  ];

  return (
    <div className="space-y-4">
      {noteRoleKeys.map((roleKey) => {
        const roleName = draft.roles?.[roleKey];
        const note = checkpoint.authors_note?.[roleKey];
        const hasNote = Boolean(note?.text?.trim());
        const roleLabel = roleName ? `${roleName} (${roleKey})` : roleKey;

        return (
          <div key={roleKey} className="st-subpanel p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold st-strong">{roleLabel}</div>
              <button
                type="button"
                className="st-button secondary px-2"
                onClick={() => {
                  updateCheckpoint(checkpoint.id, (cp) => {
                    const authors_note = { ...(cp.authors_note ?? {}) };
                    authors_note[roleKey] = {
                      text: note?.text ?? "",
                      position: note?.position,
                      interval: note?.interval,
                      depth: note?.depth,
                      role: note?.role,
                    };
                    return { ...cp, authors_note };
                  });
                }}
              >
                {hasNote ? "Edit" : "Create"} Note
              </button>
            </div>
            <label className="flex flex-col gap-1 text-xs">
              <span className="inline-flex items-center gap-1">
                Author Note Text
                <HelpTooltip title="Per-role instructions injected into the runtime Author's Note slot." />
              </span>
              <textarea
                className="text_pole textarea_compact st-input w-full resize-y"
                rows={3}
                value={note?.text ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  updateAuthorNote(roleKey, () => ({
                    ...(note ?? { text: "" }),
                    text: value,
                  }));
                }}
                placeholder="Enter per-role Author’s Note or leave blank to inherit the story default."
              />
            </label>
            <div className="grid grid-cols-4 gap-3">
              {noteFields.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    {field.label}
                    <HelpTooltip title={field.title} />
                  </span>
                  {field.kind === "select" ? (
                    <select
                      className="text_pole st-input w-full"
                      value={note?.[field.key] ?? ""}
                      disabled={!hasNote}
                      onChange={(e) => patchNoteField(roleKey, field.key, e.target.value || undefined)}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value || "default"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="text_pole st-input w-full"
                      value={note?.[field.key] ?? ""}
                      disabled={!hasNote}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (Number.isFinite(parsed)) {
                          patchNoteField(roleKey, field.key, Math.max(field.min ?? 0, Math.round(parsed)));
                        }
                      }}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="st-button danger"
                onClick={() => {
                  updateAuthorNote(roleKey, () => ({ text: "" }));
                }}
              >
                Clear Note
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AuthorNotesTab;
