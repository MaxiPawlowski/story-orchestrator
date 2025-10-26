import React, { useMemo } from "react";
import type { StoryDraft } from "@utils/checkpoint-studio";
import HelpTooltip from "../HelpTooltip";

type Props = {
  draft: StoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
  groupMembers: string[];
  allCharacters: string[];
};

const StoryRolesSection: React.FC<Props> = ({ draft, setDraft, groupMembers, allCharacters }) => {
  const characterOptions = useMemo(() => {
    const seen = new Set<string>();
    const combined: string[] = [];

    groupMembers.forEach((name) => {
      const lower = name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        combined.push(name);
      }
    });

    allCharacters.forEach((name) => {
      const lower = name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        combined.push(name);
      }
    });

    return combined;
  }, [groupMembers, allCharacters]);

  return (
    <div className="mt-2 border-t border-slate-800 pt-3">
      <div className="mb-1 font-medium text-slate-200">Story Roles</div>
      <div className="space-y-2">
        {Object.entries(draft.roles ?? {}).map(([roleKey, participant], index) => (
          <div key={roleKey} className="grid grid-cols-2 gap-2 items-end">
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1">
                Role Name
                {index === 0 && (
                  <HelpTooltip title="Internal identifier used by macros, presets, and automation triggers." />
                )}
              </span>
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
                      let key = nextKey;
                      let idx = 1;
                      while (Object.prototype.hasOwnProperty.call(current, key)) {
                        key = `${nextKey}-${idx++}`;
                      }
                      current[key] = value ?? "";
                    }
                    return { ...prev, roles: current };
                  });
                }}
              />
            </label>
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1">
                  Participant Name
                  {index === 0 && <HelpTooltip title="Match the chat member name to link roles correctly." />}
                </span>
                <input
                  list="st-group-members"
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
                  value={participant}
                  onChange={(e) => {
                    const value = String(e.target.value ?? "").replace(/\.[a-z0-9]+$/i, "");
                    setDraft((prev) => ({
                      ...prev,
                      roles: { ...(prev.roles ?? {}), [roleKey]: value },
                    }));
                  }}
                  placeholder={characterOptions.length ? "Pick from list or type name…" : "Type participant name…"}
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
                let idx = Object.keys(roles).length + 1;
                let key = `role-${idx}`;
                while (Object.prototype.hasOwnProperty.call(roles, key)) {
                  idx += 1;
                  key = `role-${idx}`;
                }
                roles[key] = "";
                return { ...prev, roles };
              });
            }}
          >
            + Add Role
          </button>
          <datalist id="st-group-members">
            {characterOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      </div>
    </div>
  );
};

export default StoryRolesSection;
