import { isRecord } from "@utils/guards";
import { log } from "@utils/log";
import { TOUR_VIEWS, type TourView } from "./request";

export interface TourProgress {
  view: TourView;
  current: Record<TourView, number>;
  done: Record<TourView, string[]>;
}

export const emptyProgress = (): TourProgress => ({ view: "player", current: { player: 0, author: 0, setup: 0 }, done: { player: [], author: [], setup: [] } });

const isView = (value: unknown): value is TourView => typeof value === "string" && (TOUR_VIEWS as readonly string[]).includes(value);

export const sanitizeProgress = (raw: unknown): TourProgress => {
  const empty = emptyProgress();
  if (!isRecord(raw)) return empty;
  const current = isRecord(raw.current) ? raw.current : {};
  const done = isRecord(raw.done) ? raw.done : {};
  const index = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0);
  const ids = (value: unknown) => (Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))] : []);
  return {
    view: isView(raw.view) ? raw.view : empty.view,
    current: { player: index(current.player), author: index(current.author), setup: index(current.setup) },
    done: { player: ids(done.player), author: ids(done.author), setup: ids(done.setup) },
  };
};

export interface TourProgressStore {
  read: () => TourProgress;
  write: (progress: TourProgress) => boolean;
}

export const tourProgressStore = (storage: () => Pick<Storage, "getItem" | "setItem"> | null, user: () => string): TourProgressStore => {
  const key = () => `story-orchestrator.tour.${encodeURIComponent(user())}`;
  return {
    read: () => {
      try { return sanitizeProgress(JSON.parse(storage()?.getItem(key()) ?? "null")); }
      catch (error) { log.warn("Tour progress could not be read; starting the tour from the top", error); return emptyProgress(); }
    },
    write: (progress) => {
      try {
        const target = storage();
        if (!target) return false;
        target.setItem(key(), JSON.stringify(sanitizeProgress(progress)));
        return true;
      } catch (error) { log.warn("Tour progress could not be saved in this browser", error); return false; }
    },
  };
};

export const memoryProgressStore = (initial: TourProgress = emptyProgress()): TourProgressStore => {
  let saved = sanitizeProgress(initial);
  return { read: () => saved, write: (progress) => { saved = sanitizeProgress(progress); return true; } };
};
