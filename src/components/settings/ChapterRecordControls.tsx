import { chapterSettings, type ChapterSettings } from "@runtime/chapters";
import { CHRONICLE_BUDGET_ARMS } from "@memory/chronicle";
import type { SettingCopyKey } from "@features/settingsCopy";
import { Advanced, CheckRow, FieldLabel } from "./Field";

type ChapterToggle = [keyof ChapterSettings, string, SettingCopyKey];

const RECORD_TOGGLES: ChapterToggle[] = [
  ["seal", "so-chapter-seal", "memory.chapters.seal"],
  ["storySoFar", "so-chapter-story-so-far", "memory.chapters.storySoFar"],
  ["fold", "so-chapter-fold", "memory.chapters.fold"],
];

export interface ChapterRecordControlsProps {
  stored: Partial<ChapterSettings> | undefined;
  onWrite(next: Partial<ChapterSettings>): void;
}

export const ChapterRecordControls = ({ stored, onWrite }: ChapterRecordControlsProps) => {
  const settings = chapterSettings(stored);
  return (
    <Advanced id="so-chapter-advanced" label="Chapter records">
      {RECORD_TOGGLES.map(([key, id, setting]) => (
        <CheckRow key={key} id={id} setting={setting} className="text-xs" checked={settings[key] === true} onChange={(on) => onWrite({ [key]: on })} />
      ))}
      <div className="flex items-center gap-2 text-xs">
        <FieldLabel htmlFor="so-chapter-budget" setting="memory.chapters.chronicleTokens" />
        <select id="so-chapter-budget" value={settings.chronicleTokens} onChange={(event) => onWrite({ chronicleTokens: Number(event.target.value) })}>
          {CHRONICLE_BUDGET_ARMS.map((tokens) => <option key={tokens} value={tokens}>{tokens} tokens</option>)}
        </select>
      </div>
    </Advanced>
  );
};

export default ChapterRecordControls;
