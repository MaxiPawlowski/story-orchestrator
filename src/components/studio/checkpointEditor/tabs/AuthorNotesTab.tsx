import React from "react";
import {
  type AuthorNoteDraft,
  ensureOnActivate,
  cleanupOnActivate,
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
  const authorNotesSignature = React.useMemo(() => {
    if (!checkpoint.on_activate?.authors_note) return "";
    try {
      return JSON.stringify(checkpoint.on_activate.authors_note);
    } catch {
      return `${checkpoint.id ?? ""}-authors-note`;
    }
  }, [checkpoint.id, checkpoint.on_activate?.authors_note]);

  const noteRoleKeys = React.useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const push = (roleKey?: string | null) => {
      if (!roleKey) return;
      if (seen.has(roleKey)) return;
      seen.add(roleKey);
      ordered.push(roleKey);
    };
    Object.keys(draft.roles ?? {}).forEach(push);
    Object.keys(checkpoint.on_activate?.authors_note ?? {}).forEach(push);
    return ordered;
  }, [draft.roles, checkpoint.id, authorNotesSignature]);

  const updateAuthorNote = React.useCallback((roleKey: string, editor: (prev: AuthorNoteDraft | undefined) => AuthorNoteDraft | undefined) => {
    updateCheckpoint(checkpoint.id, (cp) => {
      const next = ensureOnActivate(cp.on_activate);
      const currentMap = { ...(next.authors_note ?? {}) } as Record<string, AuthorNoteDraft | undefined>;
      const updated = editor(currentMap[roleKey]);
      if (updated) currentMap[roleKey] = updated;
      else delete currentMap[roleKey];
      next.authors_note = currentMap;
      return { ...cp, on_activate: cleanupOnActivate(next) };
    });
  }, [checkpoint.id, updateCheckpoint]);

  if (!noteRoleKeys.length) {
    return <div className="text-xs text-slate-400">No story roles available for author notes.</div>;
  }

  return (
    <div className="space-y-4">
      {noteRoleKeys.map((roleKey) => {
        const roleName = draft.roles?.[roleKey];
        const note = checkpoint.on_activate?.authors_note?.[roleKey];
        const hasNote = Boolean(note?.text?.trim());
        const roleLabel = roleName ? `${roleName} (${roleKey})` : roleKey;

        return (
          <div key={roleKey} className="rounded border border-slate-600 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-100">{roleLabel}</div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-600"
                onClick={() => {
                  updateCheckpoint(checkpoint.id, (cp) => {
                    const next = ensureOnActivate(cp.on_activate);
                    if (!next.authors_note) next.authors_note = {};
                    next.authors_note[roleKey] = {
                      text: note?.text ?? "",
                      position: note?.position,
                      interval: note?.interval,
                      depth: note?.depth,
                      role: note?.role,
                    };
                    return { ...cp, on_activate: cleanupOnActivate(next) };
                  });
                }}
              >
                {hasNote ? "Edit" : "Create"} Note
              </button>
            </div>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1">
                Author Note Text
                <HelpTooltip title="Per-role instructions injected into the runtime Author's Note slot." />
              </span>
              <textarea
                className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
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
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1">
                  Position
                  <HelpTooltip title="Choose where the note appears relative to the main prompt." />
                </span>
                <select
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                  value={note?.position ?? ""}
                  disabled={!hasNote}
                  onChange={(e) => {
                    const value = e.target.value as "" | AuthorNoteDraft["position"];
                    updateAuthorNote(roleKey, (prev) => {
                      if (!prev?.text?.trim()) return prev;
                      const next: AuthorNoteDraft = { ...prev };
                      if (!value) delete next.position;
                      else next.position = value;
                      return next;
                    });
                  }}
                >
                  {AUTHOR_NOTE_POSITION_OPTIONS.map((option) => (
                    <option key={option.value || "default"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1">
                  Interval
                  <HelpTooltip title="Apply the note every N turns; leave blank to use the default cadence." />
                </span>
                <input
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                  value={note?.interval ?? ""}
                  disabled={!hasNote}
                  onChange={(e) => {
                    const raw = e.target.value;
                    updateAuthorNote(roleKey, (prev) => {
                      if (!prev?.text?.trim()) return prev;
                      const next: AuthorNoteDraft = { ...prev };
                      const parsed = Number(raw);
                      if (!Number.isFinite(parsed)) return next;
                      next.interval = Math.max(1, Math.round(parsed));
                      return next;
                    });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1">
                  Depth
                  <HelpTooltip title="Adjust how strongly the note influences the model (preset-specific meaning)." />
                </span>
                <input
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-slate-600"
                  value={note?.depth ?? ""}
                  disabled={!hasNote}
                  onChange={(e) => {
                    const raw = e.target.value;
                    updateAuthorNote(roleKey, (prev) => {
                      if (!prev?.text?.trim()) return prev;
                      const next: AuthorNoteDraft = { ...prev };
                      const parsed = Number(raw);
                      if (!Number.isFinite(parsed)) return next;
                      next.depth = Math.max(0, Math.round(parsed));
                      return next;
                    });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1">
                  Send As
                  <HelpTooltip title="Override which role supplies the note, useful for DM vs. companion voices." />
                </span>
                <select
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                  value={note?.role ?? ""}
                  disabled={!hasNote}
                  onChange={(e) => {
                    const value = e.target.value as "" | AuthorNoteDraft["role"];
                    updateAuthorNote(roleKey, (prev) => {
                      if (!prev?.text?.trim()) return prev;
                      const next: AuthorNoteDraft = { ...prev };
                      if (!value) delete next.role;
                      else next.role = value;
                      return next;
                    });
                  }}
                >
                  {AUTHOR_NOTE_ROLE_OPTIONS.map((option) => (
                    <option key={option.value || "default"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-red-300 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
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
