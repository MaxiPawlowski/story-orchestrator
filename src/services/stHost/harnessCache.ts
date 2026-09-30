import type { HarnessId } from "@utils/harness";
import type { ModelReply } from "./modelReply";
import type { HarnessRequest, HarnessStatus } from "./harness";

let last: HarnessStatus | null = null;

const load = () => import(/* webpackChunkName: "so-harness" */ "./harness");

export const harnessStatusCached = (): HarnessStatus | null => last;

export async function refreshHarnessStatus(refresh = false): Promise<HarnessStatus | null> {
  last = await (await load()).fetchHarnessStatus(refresh);
  return last;
}

export const sendHarness = async (request: HarnessRequest): Promise<ModelReply> => (await load()).sendHarnessRequest(request);

export const harnessListed = (harness: HarnessId, model: string): boolean | null => {
  const row = last?.harnesses[harness];
  return row ? row.models.some((entry) => entry.id === model) : last ? false : null;
};

export const harnessContextLimit = (harness: HarnessId, model: string): number | null =>
  last?.harnesses[harness]?.models.find((entry) => entry.id === model)?.context ?? null;
