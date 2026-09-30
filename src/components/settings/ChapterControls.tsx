import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { chapterSettings, type ChapterSettings } from "@runtime/chapters";
import { CHRONICLE_BUDGET_ARMS } from "@memory/chronicle";
import HelpTooltip from "@components/studio/HelpTooltip";

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

const CHAPTER_HELP = "For stories that declare chapters. When a chapter ends its memories are folded into one written record, and the records ride every prompt "
  + "as a fixed-size story so far. Off until the measured recall floors pass; switch on to try it.";

const TOGGLES: Array<[keyof ChapterSettings, string, string]> = [
  ["seal", "so-chapter-seal", "Write a record when a chapter ends"],
  ["storySoFar", "so-chapter-story-so-far", "Add the story so far to every prompt"],
  ["fold", "so-chapter-fold", "Leave ended chapters' messages out of the prompt (the record stands in)"],
  ["recap", "so-chapter-recap", "Show \"Previously…\" when a chat opens after a chapter ended"],
];

export const ChapterControls = ({ snapshot, manager }: GroupProps) => {
  const settings = chapterSettings(snapshot.memory.settings.chapters);
  const write = (next: Partial<ChapterSettings>) => manager.setMemorySettings({ chapters: { ...settings, ...next } });
  return (
    <div id="so-chapter-settings" className="flex flex-col gap-1 text-sm">
      <span>Chapters <HelpTooltip title={CHAPTER_HELP} /></span>
      {TOGGLES.map(([key, id, label]) => (
        <label key={key} className="flex items-center gap-2 text-xs">
          <input id={id} type="checkbox" checked={settings[key] === true} onChange={(event) => write({ [key]: event.target.checked })} />
          <span>{label}</span>
        </label>
      ))}
      <label className="flex items-center gap-2 text-xs">
        <span>Story so far budget</span>
        <select id="so-chapter-budget" aria-label="Story so far budget" value={settings.chronicleTokens} onChange={(event) => write({ chronicleTokens: Number(event.target.value) })}>
          {CHRONICLE_BUDGET_ARMS.map((tokens) => <option key={tokens} value={tokens}>{tokens} tokens</option>)}
        </select>
      </label>
    </div>
  );
};

export default ChapterControls;
