import type { Checkpoint, StoryEngine } from "@engine/index";
import { beginRun, type RunOwnership } from "./runToken";

// Author recovery, kept out of the manager: undo the last gate advance without touching the
// messages, and drop a latched value so extraction asks for it again. Both re-check the run token
// across their awaits, because a chat switch mid-recovery must not stamp the restored checkpoint
// onto whatever loaded meanwhile.
export interface RecoveryHost {
  loaded: boolean;
  engine: Pick<StoryEngine, "stepBackFiredTransition" | "resetQuality" | "activeCheckpoint">;
  applyActive: (mode: "activate" | "hydrate") => Promise<unknown>;
  refreshRequirements: () => void;
  announce: (checkpoint: Checkpoint | undefined) => Promise<unknown>;
  updateSteering: () => void;
  updateInjection: () => void;
  persist: () => Promise<void>;
  setStatus: (text: string) => void;
  noteRecap: (summary: string, detail: string) => void;
  notify: () => void;
  ownership: RunOwnership;
}

export async function runStepBackTransition(host: RecoveryHost): Promise<{ ok: boolean; detail: string }> {
  if (!host.loaded) return { ok: false, detail: "no story is loaded" };
  const run = beginRun(host.ownership);
  const outcome = host.engine.stepBackFiredTransition();
  if (!outcome.ok) return { ok: false, detail: outcome.reason };
  const reset = outcome.keys.filter((key) => host.engine.resetQuality(key));
  host.refreshRequirements();
  await host.applyActive("hydrate");
  if (!run.stillOwns()) return { ok: false, detail: "a later world change superseded this step back" };
  await host.announce(host.engine.activeCheckpoint);
  if (!run.stillOwns()) return { ok: false, detail: "a later world change superseded this step back" };
  host.updateSteering();
  host.updateInjection();
  await host.persist();
  const name = host.engine.activeCheckpoint?.name ?? outcome.to;
  host.setStatus(`Stepped back to ${name}`);
  host.noteRecap(`stepped back to "${name}"`,
      `undid the move from "${outcome.to}" into "${outcome.from}"; reset ${reset.length ? reset.join(", ") : "no gate keys"}`);
  host.notify();
  return { ok: true, detail: name };
}

export async function runResetQuality(host: RecoveryHost, key: string): Promise<boolean> {
  if (!host.loaded) return false;
  const run = beginRun(host.ownership);
  if (!host.engine.resetQuality(key)) return false;
  host.noteRecap(`reset "${key}"`, "the value is no longer locked; the next reading can set it again");
  await host.persist();
  if (!run.stillOwns()) return false;
  host.notify();
  return true;
}
