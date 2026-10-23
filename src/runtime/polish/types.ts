import type { EngineState, NormalizedStory } from "@engine/index";
import type { ModelCall } from "@extraction/modelRoute";
import type { ResolvedFeature } from "../featureResolve";
import type { PolishRecord } from "./ring";
import type { RunOwnership } from "../runToken";

export interface PolishHostDeps {
  story: () => NormalizedStory | null;
  state: () => EngineState | null;
  chatId: () => string | null;
  rows: () => unknown[];
  enabledIds: () => string[];
  resting: () => (text: string) => string;
  feature: () => ResolvedFeature;
  ring: () => PolishRecord[];
  setRing: (next: PolishRecord[]) => void;
  persist: () => Promise<void>;
  notify: () => void;
  ownership: RunOwnership;
  model: ModelCall;
}
