export type TourView = "player" | "author" | "setup";

export const TOUR_VIEWS: readonly TourView[] = ["player", "author", "setup"];

export interface TourRequest {
  view: TourView | null;
  stop?: string;
}

type Listener = (request: TourRequest) => void;

const listeners = new Set<Listener>();

export const onTourRequest = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const tourViewOf = (word?: string): TourView | null | undefined => {
  if (!word) return null;
  const view = word.toLowerCase();
  return (TOUR_VIEWS as readonly string[]).includes(view) ? view as TourView : undefined;
};

export const tourRequestOf = (value: string): TourRequest | null => {
  const [word, stop] = value.split(":");
  const view = tourViewOf(word);
  return view ? (stop ? { view, stop } : { view }) : null;
};

export const requestTour = (view: TourView | null = null, stop?: string): boolean => {
  const request: TourRequest = stop ? { view, stop } : { view };
  listeners.forEach((listener) => listener(request));
  return listeners.size > 0;
};
