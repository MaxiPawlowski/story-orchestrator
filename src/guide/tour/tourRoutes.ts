import type { TourView } from "./request";
import { SETUP_ROUTE } from "./setupPath";
import { AUTHOR_ROUTE, PLAYER_ROUTE } from "./tourSteps";
import type { TourRoute, TourStep } from "./tourTypes";

export const TOUR_ROUTES: Record<TourView, TourRoute> = { player: PLAYER_ROUTE, author: AUTHOR_ROUTE, setup: SETUP_ROUTE };

export const stepsOf = (view: TourView): readonly TourStep[] => TOUR_ROUTES[view].groups.flatMap((group) => group.steps);

export const allSteps = (): Array<{ view: TourView; index: number; step: TourStep }> =>
  (Object.keys(TOUR_ROUTES) as TourView[]).flatMap((view) => stepsOf(view).map((step, index) => ({ view, index, step })));

export const plainText = (text: string): string => text.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, key: string, word?: string) => word ?? key).replace(/\*\*|`/g, "");

export const findSteps = (query: string): Array<{ view: TourView; index: number; step: TourStep }> => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = allSteps();
  if (!words.length) return hits;
  return hits.filter(({ step }) => {
    const haystack = plainText([step.title, step.lead, ...step.do, ...step.see, ...(step.keywords ?? [])].join(" ")).toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
};
