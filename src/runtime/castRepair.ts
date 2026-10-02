import type { WriteResult } from "@utils/writeResult";
import type { RepairAction } from "./repair";
import { beginRun, type RunOwnership } from "./runToken";

export interface CastRepairHost {
  add: (names: string[]) => Promise<WriteResult<object>>;
  unmute: (names: string[]) => Promise<WriteResult<object>>;
  refresh: () => Promise<unknown>;
  journal: (summary: string, detail: string) => void;
  ownership: RunOwnership;
}

export async function runCastRepair(action: RepairAction, host: CastRepairHost): Promise<WriteResult<object>> {
  const run = beginRun(host.ownership);
  const result = action.kind === "add-members" ? await host.add(action.members) : await host.unmute(action.members);
  if (!run.stillOwns()) return result;
  const what = action.kind === "add-members" ? "added back to the group" : "unmuted in the group";
  if (result.ok) host.journal(`Repair: ${action.members.join(", ")} ${what}`, action.label);
  else host.journal(`Repair could not finish: ${action.label}`, result.reason);
  await host.refresh();
  return result;
}
