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
    <div className="mt-2 border-t st-border pt-3">
      <div className="mb-1 font-medium">Story Roles</div>
      <div className="space-y-2">
        {Object.entries(draft.roles ?? {}).map(([roleKey, participant], index) => (
          <div key={`role-${index}`} className="grid grid-cols-2 gap-2 items-end">
            <label className="flex flex-col gap-1 text-xs">
              <span className="inline-flex items-center gap-1">
                Role Name
                {index === 0 && (
                  <HelpTooltip title="Internal identifier used by macros, presets, and automation triggers." />
                )}
              </span>
              <input
                className="text_pole st-input w-full"
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
              <label className="flex flex-1 flex-col gap-1 text-xs">
                <span className="inline-flex items-center gap-1">
                  Participant Name
                  {index === 0 && <HelpTooltip title="Match the chat member name to link roles correctly." />}
                </span>
                <input
                  list="st-group-members"
                  className="text_pole st-input w-full"
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
                className="st-button danger h-[34px] shrink-0"
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
            className="st-button secondary"
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
