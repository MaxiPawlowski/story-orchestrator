import React, { useMemo } from "react";
import type { StoryDraft } from "@utils/checkpoint-studio";
import type { AuthorNotePosition, AuthorNoteRole, RolePresetOverrides } from "@utils/story-schema";
import { isNonArrayObject } from "@utils/dataHelpers";
import { AUTHOR_NOTE_POSITION_OPTIONS, AUTHOR_NOTE_ROLE_OPTIONS } from "../checkpointEditor/constants";
import HelpTooltip from "../HelpTooltip";

type Props = {
  draft: StoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

const stringifyPresets = (value?: RolePresetOverrides): string => {
  if (!value || !Object.keys(value).length) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
};

const StoryDefaultsSection: React.FC<Props> = ({ draft, setDraft }) => {
  const presetText = useMemo(() => stringifyPresets(draft.defaults?.presets), [draft.defaults?.presets]);

  const patchAuthorNote = (field: string, value: unknown) =>
    setDraft((prev) => ({
      ...prev,
      defaults: {
        ...(prev.defaults ?? {}),
        author_note: {
          ...(prev.defaults?.author_note ?? {}),
          [field]: value,
        },
      },
    }));

  return (
    <div className="mt-2 border-t st-border pt-3">
      <div className="mb-1 font-medium">Story Defaults</div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="inline-flex items-center gap-1">
            Author Note Position
            <HelpTooltip title="Default position used when a checkpoint author note omits it." />
          </span>
          <select
            className="text_pole st-input w-full"
            value={draft.defaults?.author_note?.position ?? ""}
            onChange={(e) => patchAuthorNote("position", (e.target.value || undefined) as AuthorNotePosition | undefined)}
          >
            {AUTHOR_NOTE_POSITION_OPTIONS.map((option) => (
              <option key={option.value || "default"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="inline-flex items-center gap-1">
            Author Note Role
            <HelpTooltip title="Default SillyTavern author-note role used when a checkpoint note omits it." />
          </span>
          <select
            className="text_pole st-input w-full"
            value={draft.defaults?.author_note?.role ?? ""}
            onChange={(e) => patchAuthorNote("role", (e.target.value || undefined) as AuthorNoteRole | undefined)}
          >
            {AUTHOR_NOTE_ROLE_OPTIONS.map((option) => (
              <option key={option.value || "default"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="inline-flex items-center gap-1">
            Author Note Interval
            <HelpTooltip title="Default interval applied to string shorthand author notes." />
          </span>
          <input
            type="number"
            min={1}
            className="text_pole st-input w-full"
            value={draft.defaults?.author_note?.interval ?? ""}
            onChange={(e) => patchAuthorNote("interval", e.target.value ? Math.max(1, Number(e.target.value) || 1) : undefined)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="inline-flex items-center gap-1">
            Author Note Depth
            <HelpTooltip title="Default depth applied to string shorthand author notes." />
          </span>
          <input
            type="number"
            min={0}
            className="text_pole st-input w-full"
            value={draft.defaults?.author_note?.depth ?? ""}
            onChange={(e) => patchAuthorNote("depth", e.target.value ? Math.max(0, Number(e.target.value) || 0) : undefined)}
          />
        </label>
      </div>
      <label className="mt-2 flex flex-col gap-1 text-xs">
        <span className="inline-flex items-center gap-1">
          Default Presets JSON
          <HelpTooltip title="Role-keyed preset defaults merged into each checkpoint's preset_overrides." />
        </span>
        <textarea
          className="text_pole textarea_compact st-input w-full resize-y font-mono"
          rows={8}
          value={presetText}
          placeholder={'{\n  "dm": { "temp": 0.65 }\n}'}
          onChange={(e) => {
            const value = e.target.value.trim();
            setDraft((prev) => {
              if (!value) {
                return {
                  ...prev,
                  defaults: {
                    ...(prev.defaults ?? {}),
                    presets: undefined,
                  },
                };
              }
              try {
                const parsed = JSON.parse(value);
                if (!isNonArrayObject(parsed)) return prev;
                return {
                  ...prev,
                  defaults: {
                    ...(prev.defaults ?? {}),
                    presets: parsed as RolePresetOverrides,
                  },
                };
              } catch {
                return prev;
              }
            });
          }}
        />
      </label>
    </div>
  );
};

export default StoryDefaultsSection;
