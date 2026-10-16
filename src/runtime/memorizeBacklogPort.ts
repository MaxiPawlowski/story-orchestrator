import type { MemorizeBacklog, MemorizeBacklogDeps } from "./memorizeBacklog";
import type { PreflightConfirm } from "@extraction/index";

export interface BacklogPort {
  runMemorizeBacklog(windowSize?: number, confirm?: PreflightConfirm): Promise<boolean>;
  cancelMemorizeBacklog(): boolean;
}

export function lazyBacklog(deps: MemorizeBacklogDeps): BacklogPort {
  let unit: MemorizeBacklog | null = null;
  const loading = import("./memorizeBacklog").then(({ MemorizeBacklog: Unit }) => (unit ??= new Unit(deps)));
  return {
    runMemorizeBacklog: async (windowSize, confirm) => (unit ?? await loading).runMemorizeBacklog(windowSize, confirm),
    cancelMemorizeBacklog: () => unit?.cancelMemorizeBacklog() ?? false,
  };
}
