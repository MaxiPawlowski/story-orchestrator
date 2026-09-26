import type { FoldVerdict } from "../turnBridge";
import { getGlobalSettings } from "../settingsStore";

export const spikeHooks: { toolTurnFold: FoldVerdict | null } = { toolTurnFold: null };

let epoch = 0;

export const startSpikes = async () => {
  const mine = ++epoch;
  if (!__SO_DEV__ || !getGlobalSettings().spikes.toolTurnFold) return;
  const { toolTurnVerdict } = await import("../spikes/toolTurnFold");
  if (mine === epoch) spikeHooks.toolTurnFold = toolTurnVerdict;
};

export const stopSpikes = () => {
  epoch += 1;
  spikeHooks.toolTurnFold = null;
};
