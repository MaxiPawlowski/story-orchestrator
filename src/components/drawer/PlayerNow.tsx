import type { ReactNode } from "react";
import type { RuntimeSnapshot } from "@runtime/types";
import { shownCarry, shownPromises } from "@runtime/surfaceShown";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";

const PlayerChapters = lazyRetry(() => import("./PlayerChapters"));
const PlayerPromises = lazyRetry(() => import("./PlayerPromises"));
const CarryCard = lazyRetry(() => import("@components/carry/CarryCard"));

export interface PlayerNowProps {
  snapshot: RuntimeSnapshot;
  journalShown?: boolean;
  onFlagChapter?: (title: string) => void;
  onDismissPreviously?: () => void;
  children?: ReactNode;
}

const HEADER_SECTIONS = new Set(["now", "status"]);

export const nowSections = (snapshot: RuntimeSnapshot, journalShown: boolean) => snapshot.narrative.sections
  .filter((section) => !HEADER_SECTIONS.has(section.id) && !(journalShown && section.id === "quests"));

export const PlayerNow = ({ snapshot, journalShown = false, onFlagChapter, onDismissPreviously, children }: PlayerNowProps) => {
  const promises = shownPromises(snapshot);
  const carry = shownCarry(snapshot);
  return (
    <div data-so="play-now" className="so-play-now">
      {nowSections(snapshot, journalShown).map((section) => (
        section.id === "chapters" && snapshot.chapters?.records.length
          ? <Lazy key={section.id} fallback={null}><PlayerChapters chapters={snapshot.chapters} onFlag={onFlagChapter} /></Lazy>
          : (
            <section key={section.id} data-so="play-section" data-section={section.id} className="so-play-section">
              <h3 className="so-play-label">{section.label}</h3>
              {section.lines.map((line) => <p key={line} className="so-play-text">{line}</p>)}
            </section>
          )
      ))}
      {promises ? <Lazy fallback={null}><PlayerPromises promises={promises} /></Lazy> : null}
      {carry ? <Lazy fallback={null}><CarryCard view={carry} onDismiss={onDismissPreviously} /></Lazy> : null}
      {children}
    </div>
  );
};

export default PlayerNow;
