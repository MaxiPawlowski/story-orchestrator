import { withholds, type GenerationIntent } from "../generationLifecycle";

export const routeIntent = (set: () => void, clear: () => void) => (intent: GenerationIntent) => {
  if (intent.kind === "opened") return withholds(intent.type) ? clear() : set();
  if (intent.kind === "nested") return intent.withholds ? clear() : undefined;
  if (intent.kind === "reapply") return set();
  if (intent.kind === "closed") return clear();
};
