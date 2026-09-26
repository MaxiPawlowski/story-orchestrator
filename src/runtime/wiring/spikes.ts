import { getActiveCharacterId, getActiveGroup, getCharacterNameById, getContext } from "@services/STAPI";
import { namesForRosterId } from "../roster";
import { runtimeManager } from "../runtimeManager";
import { getGlobalSettings, type SpikeFlags } from "../settingsStore";

export const spikeHooks: { witness: ((chat: unknown[], type: string) => void) | null } = { witness: null };

let epoch = 0;
let disposeWitness: (() => void) | null = null;

const enabledNames = () => {
  const story = runtimeManager.getStory();
  return runtimeManager.getEnabledCharacterIds().flatMap((id) => namesForRosterId(story, id));
};

const release = () => {
  disposeWitness?.();
  disposeWitness = null;
  spikeHooks.witness = null;
};

export const refreshSpikes = async (): Promise<SpikeFlags> => {
  const mine = ++epoch;
  release();
  const flags = getGlobalSettings().spikes;
  if (!__SO_DEV__ || !flags.witnessFilter) return flags;
  const { startWitnessFilter } = await import("../spikes/witnessFilterHost");
  if (mine !== epoch) return flags;
  const filter = startWitnessFilter({
    enabledNames,
    drafted: () => getCharacterNameById(getActiveCharacterId()) ?? null,
    chat: () => (Array.isArray(getContext().chat) ? getContext().chat : []),
    isGroup: () => Boolean(getActiveGroup()),
    now: () => performance.now(),
  });
  spikeHooks.witness = filter.intercept;
  disposeWitness = filter.dispose;
  return flags;
};

export const stopSpikes = () => {
  epoch += 1;
  release();
};
