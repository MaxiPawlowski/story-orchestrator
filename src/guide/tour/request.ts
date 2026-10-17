export type TourView = "player" | "author" | "setup";

export const TOUR_VIEWS: readonly TourView[] = ["player", "author", "setup"];

type Listener = (view: TourView | null) => void;

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

export const requestTour = (view: TourView | null = null): boolean => {
  listeners.forEach((listener) => listener(view));
  return listeners.size > 0;
};
