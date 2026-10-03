import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { chapterSettings, type ChapterSettings } from "@runtime/chapters";
import { CHRONICLE_BUDGET_ARMS } from "@memory/chronicle";
import type { SettingCopyKey } from "@features/settingsCopy";
import { Advanced, CheckRow, FieldLabel } from "./Field";

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

type ChapterToggle = [keyof ChapterSettings, string, SettingCopyKey];

const AUTHOR_TOGGLES: ChapterToggle[] = [
  ["seal", "so-chapter-seal", "memory.chapters.seal"],
  ["storySoFar", "so-chapter-story-so-far", "memory.chapters.storySoFar"],
  ["fold", "so-chapter-fold", "memory.chapters.fold"],
];

const RECAP_TOGGLE: ChapterToggle = ["recap", "so-chapter-recap", "memory.chapters.recap"];

export const ChapterControls = ({ snapshot, manager }: GroupProps) => {
  const settings = chapterSettings(snapshot.memory.settings.chapters);
  const write = (next: Partial<ChapterSettings>) => manager.setMemorySettings({ chapters: { ...settings, ...next } });
  const toggle = ([key, id, setting]: ChapterToggle) => (
    <CheckRow key={key} id={id} setting={setting} className="text-xs" checked={settings[key] === true} onChange={(on) => write({ [key]: on })} />
  );
  return (
    <div id="so-chapter-settings" className="flex flex-col gap-1 text-sm">
      <span>Chapters</span>
      {toggle(RECAP_TOGGLE)}
      {snapshot.ui.authorView && (
        <Advanced id="so-chapter-advanced" label="Chapter records">
          {AUTHOR_TOGGLES.map(toggle)}
          <div className="flex items-center gap-2 text-xs">
            <FieldLabel htmlFor="so-chapter-budget" setting="memory.chapters.chronicleTokens" />
            <select id="so-chapter-budget" value={settings.chronicleTokens} onChange={(event) => write({ chronicleTokens: Number(event.target.value) })}>
              {CHRONICLE_BUDGET_ARMS.map((tokens) => <option key={tokens} value={tokens}>{tokens} tokens</option>)}
            </select>
          </div>
        </Advanced>
      )}
    </div>
  );
};

export default ChapterControls;
