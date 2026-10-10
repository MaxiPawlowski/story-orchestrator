import type { HarnessId } from "@utils/harness";
import type { ModelReply } from "./modelReply";
import type { HarnessModel, HarnessRequest, HarnessRow, HarnessStatus } from "./harness";

let last: HarnessStatus | null = null;

const load = () => import("./harness");

export const harnessStatusCached = (): HarnessStatus | null => last;

export async function refreshHarnessStatus(refresh = false): Promise<HarnessStatus | null> {
  last = await (await load()).fetchHarnessStatus(refresh);
  return last;
}

export const sendHarness = async (request: HarnessRequest): Promise<ModelReply> => (await load()).sendHarnessRequest(request);

export const openAgentBridge = async () => (await import("./harnessBridge")).createHarnessBridgeClient();

const modelOf = (harness: HarnessId, model: string): HarnessModel | null | undefined => {
  const row = last && last.harnesses[harness];
  return row ? row.models.find((entry) => entry.id === model) || null : last ? null : undefined;
};

export const harnessListed = (harness: HarnessId, model: string): boolean | null => {
  const found = modelOf(harness, model);
  return found === undefined ? null : found !== null;
};

export const harnessContextLimit = (harness: HarnessId, model: string): number | null => {
  const found = modelOf(harness, model);
  return found ? found.context : null;
};

export const rowOffersAgent = (row: HarnessRow | undefined, model: string): boolean =>
  Boolean(row && row.installed && row.offered && !row.blocked && row.loggedIn !== false && row.agentBridge === true && row.models.some((entry) => entry.id === model));

export const harnessOffersAgent = (harness: HarnessId, model: string): boolean => rowOffersAgent(last?.harnesses[harness], model);
