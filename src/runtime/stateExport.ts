import { dumpPersistedRuntime } from "./persistence";

// The chat's saved state can be dropped by retention, so "Export state" hands the
// author a copy of it first. The promise is small enough to test and load-bearing enough not to
// leave inline in a component: if the clipboard is unreachable the text must still reach the
// console, because a copy that silently failed is the state the author thinks they saved.

export const EXPORT_STATE_OK = "This chat's story state is on your clipboard";
export const EXPORT_STATE_FALLBACK = "Could not reach the clipboard; the state is in the console";

export interface StateExportDeps {
  writeClipboard: (text: string) => Promise<void>;
  toast: { success?: (message: string, title: string) => void; info?: (message: string, title: string) => void };
  log: (text: string) => void;
}

export const exportStateText = (): string => JSON.stringify(dumpPersistedRuntime(), null, 2);

/** Returns whether the clipboard took it, so a caller that wants to say more can. */
export async function exportState(deps: StateExportDeps, text = exportStateText(), what = { ok: EXPORT_STATE_OK, fallback: EXPORT_STATE_FALLBACK }): Promise<boolean> {
  try {
    await deps.writeClipboard(text);
    deps.toast.success?.(what.ok, "Story Orchestrator");
    return true;
  } catch {
    deps.toast.info?.(what.fallback, "Story Orchestrator");
    deps.log(text);
    return false;
  }
}
