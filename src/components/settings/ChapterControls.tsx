import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { chapterSettings, type ChapterSettings } from "@runtime/chapters";
import { CheckRow } from "./Field";

interface GroupProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
}

const ChapterRecordControls = lazyRetry(() => import("./ChapterRecordControls"));

export const ChapterControls = ({ snapshot, manager }: GroupProps) => {
  const settings = chapterSettings(snapshot.memory.settings.chapters);
  const write = (next: Partial<ChapterSettings>) => manager.setMemorySettings({ chapters: { ...settings, ...next } });
  return (
    <div id="so-chapter-settings" className="flex flex-col gap-1 text-sm">
      <span>Chapters</span>
      <CheckRow id="so-chapter-recap" setting="memory.chapters.recap" className="text-xs" checked={settings.recap === true} onChange={(on) => write({ recap: on })} />
      {snapshot.ui.authorView && (
        <Lazy fallback={null}><ChapterRecordControls stored={snapshot.memory.settings.chapters} onWrite={write} /></Lazy>
      )}
    </div>
  );
};

export default ChapterControls;
