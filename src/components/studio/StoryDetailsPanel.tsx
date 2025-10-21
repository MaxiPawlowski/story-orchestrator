import React from "react";
import { StoryDraft } from "@utils/checkpoint-studio";
import { getWorldInfoSettings, eventSource, event_types, getContext } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";

type Props = {
  draft: StoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

const StoryDetailsPanel: React.FC<Props> = ({ draft, setDraft }) => {
  const [globalLorebooks, setGlobalLorebooks] = React.useState<string[]>([]);
  const [groupMembers, setGroupMembers] = React.useState<string[]>([]);

  const refreshGlobalLorebooks = React.useCallback(() => {
    try {
      const settings: any = getWorldInfoSettings?.();
      const list = Array.isArray(settings?.world_info?.globalSelect)
        ? (settings.world_info.globalSelect as unknown[])
          .map((g) => (typeof g === "string" ? g.trim() : ""))
          .filter(Boolean)
        : [];
      setGlobalLorebooks(list);
    } catch (err) {
      console.warn("[CheckpointStudio] Failed to read global lorebooks", err);
      setGlobalLorebooks([]);
    }
  }, []);

  const refreshGroupMembers = React.useCallback(() => {
    try {
      const ctx = getContext?.();
      const groupIdRaw = ctx?.groupId;
      const groupId = String(groupIdRaw ?? "").trim();
      if (!groupId) { setGroupMembers([]); return; }

      const groups = Array.isArray(ctx?.groups) ? ctx.groups : [];
      const current = groups.find((g: any) => {
        try {
          const gid = typeof g?.id === 'number' || typeof g?.id === 'string' ? String(g.id).trim() : '';
          return Boolean(gid) && gid === groupId;
        } catch { return false; }
      });

      if (!current || !Array.isArray(current.members)) { setGroupMembers([]); return; }

      const resolveName = (member: unknown): string => {
        if (typeof member === 'string') return member;
        if (typeof member === 'number') return String(member);
        if (member && typeof member === 'object') {
          const r = member as Record<string, unknown>;
          const candidate = r.name ?? r.display_name ?? r.id ?? '';
          return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : '';
        }
        return '';
      };

      const names = current.members
        .map((m: unknown) => resolveName(m))
        // remove trailing file extension like ".png", ".webp", etc., but keep original casing
        .map((s: string) => String(s ?? '').replace(/\.[a-z0-9]+$/i, '').trim())
        .filter((s: string) => Boolean(s));

      // de-dupe while preserving order
      const seen = new Set<string>();
      const unique = names.filter((n: string) => { const low = n.toLowerCase(); if (seen.has(low)) return false; seen.add(low); return true; });
      setGroupMembers(unique);
    } catch (err) {
      console.warn('[CheckpointStudio] Failed to resolve group members', err);
      setGroupMembers([]);
    }
  }, []);

  React.useEffect(() => {
    // initial read
    refreshGlobalLorebooks();
    try { refreshGroupMembers(); } catch { }

    // listen to world info setting changes to keep the list in sync
    const offs: Array<() => void> = [];
    const handler = () => refreshGlobalLorebooks();
    const chatChanged = () => { try { refreshGroupMembers(); } catch { } };
    try {
      [
        event_types?.WORLDINFO_SETTINGS_UPDATED,
        event_types?.WORLDINFO_UPDATED,
      ].forEach((eventName) => {
        if (!eventName) return;
        const off = subscribeToEventSource({ source: eventSource, eventName, handler });
        offs.push(off);
      });
      if (event_types?.CHAT_CHANGED) {
        const off = subscribeToEventSource({ source: eventSource, eventName: event_types.CHAT_CHANGED, handler: chatChanged });
        offs.push(off);
      }
    } catch (err) {
      console.warn("[CheckpointStudio] Failed to subscribe to WI events", err);
    }

    return () => {
      while (offs.length) {
        try { offs.pop()?.(); } catch { }
      }
    };
  }, [refreshGlobalLorebooks, refreshGroupMembers]);

  const options = React.useMemo(() => {
    const current = (draft.global_lorebook || "").trim();
    const base = globalLorebooks.slice();
    if (current && !base.includes(current)) {
      return [{ value: current, label: `${current} (inactive)` }, ...base.map((v) => ({ value: v, label: v }))];
    }
    return base.map((v) => ({ value: v, label: v }));
  }, [draft.global_lorebook, globalLorebooks]);
  return (
    <div className="rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 font-semibold">Story Details</div>
      <div className="flex flex-col gap-3 p-3">
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          <span>Title</span>
          <input
            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          <span>Story Description</span>
          <textarea
            className="w-full resize-y rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
            rows={4}
            value={draft.description ?? ""}
            onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Summarize the campaign backdrop that the Arbiter sees."
          />
          <span className="text-[11px] text-slate-400">
            Exposed to prompts via <code className="font-mono text-[11px] text-slate-300">{`{{story_description}}`}</code>.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          <span>Global Lorebook</span>
          <select
            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
            value={draft.global_lorebook}
            onChange={(e) => setDraft((prev) => ({ ...prev, global_lorebook: e.target.value }))}
          >
            <option value="">Select active global lorebook…</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          <span>Start Checkpoint</span>
          <select
            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
            value={draft.start}
            onChange={(e) => setDraft((prev) => ({ ...prev, start: e.target.value }))}
          >
            <option value="">Auto (first)</option>
            {draft.checkpoints.map((cp) => (
              <option key={cp.id} value={cp.id}>
                {cp.name || cp.id}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-2 border-t border-slate-800 pt-3">
          <div className="mb-1 font-medium text-slate-200">Story Roles</div>
          <div className="mb-2 text-[11px] text-slate-400">
            Map role name to the participant/character name in your group chat.
          </div>
          <div className="space-y-2">
            {Object.entries(draft.roles ?? {}).map(([roleKey, participant]) => (
              <div key={roleKey} className="grid grid-cols-2 gap-2 items-end">
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>Role Name</span>
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                    value={roleKey}
                    onChange={(e) => {
                      const nextKeyRaw = e.target.value;
                      setDraft((prev) => {
                        const current = { ...(prev.roles ?? {}) } as Record<string, string>;
                        const value = current[roleKey];
                        delete current[roleKey];
                        const nextKey = nextKeyRaw.trim();
                        if (nextKey) {
                          // avoid collisions by appending numeric suffix
                          let k = nextKey;
                          let i = 1;
                          while (Object.prototype.hasOwnProperty.call(current, k)) { k = `${nextKey}-${i++}`; }
                          current[k] = value ?? '';
                        }
                        return { ...prev, roles: current };
                      });
                    }}
                  />
                </label>
                <div className="flex items-end gap-2">
                  <label className="flex flex-1 flex-col gap-1 text-xs text-slate-300">
                    <span>Participant Name</span>
                    {/* Input with datalist suggestions from current group chat */}
                    <input
                      list="st-group-members"
                      className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                      value={participant}
                      onChange={(e) => {
                        // strip a trailing file extension if user picked a filename-like option
                        const value = String(e.target.value ?? '').replace(/\.[a-z0-9]+$/i, '');
                        setDraft((prev) => ({
                          ...prev,
                          roles: { ...(prev.roles ?? {}), [roleKey]: value },
                        }));
                      }}
                      placeholder={groupMembers.length ? 'Pick from group…' : 'Type participant name…'}
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-[34px] shrink-0 items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 text-xs font-medium text-red-300/90 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    onClick={() => setDraft((prev) => {
                      const next = { ...(prev.roles ?? {}) } as Record<string, string>;
                      delete next[roleKey];
                      return { ...prev, roles: next };
                    })}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                onClick={() => {
                  setDraft((prev) => {
                    const roles = { ...(prev.roles ?? {}) } as Record<string, string>;
                    // generate a unique role key
                    let base = 'role';
                    let idx = Object.keys(roles).length + 1;
                    let key = `${base}-${idx}`;
                    while (Object.prototype.hasOwnProperty.call(roles, key)) {
                      idx += 1; key = `${base}-${idx}`;
                    }
                    roles[key] = '';
                    return { ...prev, roles };
                  });
                }}
              >
                + Add Role
              </button>
              {/* shared datalist for all participant inputs */}
              <datalist id="st-group-members">
                {groupMembers.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryDetailsPanel;
