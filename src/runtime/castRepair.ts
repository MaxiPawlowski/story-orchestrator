import type { WriteResult } from "@utils/writeResult";
import type { RepairAction } from "./repair";
import { beginRun, type RunOwnership } from "./runToken";

export interface CastRepairHost {
  add: (names: string[]) => Promise<WriteResult<object>>;
  unmute: (names: string[]) => Promise<WriteResult<object>>;
  dropPersonas?: (names: string[]) => Promise<WriteResult<object>>;
  refresh: () => Promise<unknown>;
  journal: (summary: string, detail: string) => void;
  ownership: RunOwnership;
}

const DONE: Record<RepairAction["kind"], string> = {
  "add-members": "added back to the group",
  "unmute-members": "unmuted in the group",
  "remove-personas": "no longer required by the story",
};

const applyRepair = (action: RepairAction, host: CastRepairHost): Promise<WriteResult<object>> => {
  if (action.kind === "add-members") return host.add(action.members);
  if (action.kind === "unmute-members") return host.unmute(action.members);
  return host.dropPersonas ? host.dropPersonas(action.members) : Promise.resolve({ ok: false, reason: "This install cannot change the story from here." });
};

export async function runCastRepair(action: RepairAction, host: CastRepairHost): Promise<WriteResult<object>> {
  const run = beginRun(host.ownership);
  const result = await applyRepair(action, host);
  if (!run.stillOwns()) return result;
  const what = DONE[action.kind];
  if (result.ok) host.journal(`Repair: ${action.members.join(", ")} ${what}`, action.label);
  else host.journal(`Repair could not finish: ${action.label}`, result.reason);
  await host.refresh();
  return result;
}
