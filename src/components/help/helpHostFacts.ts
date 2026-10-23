import { judgeStatus, stImageSource } from "@services/STAPI";
import { gpuBrokerStatus } from "@services/stHost/gpuBroker";
import type { ShowMeHostFacts } from "@runtime/showMeRenders";

export const readShowMeHostFacts = async (judgeEnabled: boolean): Promise<ShowMeHostFacts> => {
  const [broker, judge] = await Promise.all([gpuBrokerStatus().catch(() => null), judgeEnabled ? judgeStatus().catch(() => null) : Promise.resolve(null)]);
  return { gpuBroker: broker !== null, judgeConfigured: Boolean(judge?.configured), stImageSource: stImageSource() !== null };
};
