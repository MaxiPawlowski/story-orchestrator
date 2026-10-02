import { callExtractionReply } from "@extraction/client";
import type { FailoverGate } from "@extraction/breaker";
import type { ModelCall } from "@extraction/modelRoute";
import type { PassRole } from "@extraction/passRole";
import { harnessListed } from "@services/STAPI";
import { createModelCallVia, type ModelCallDeps, type RoleCallObservation } from "./modelCallCore";
import { modelCallLog, type ModelCallRecord } from "./modelCallLog";
import { roleHealth } from "./roleHealth";

let liveGate: FailoverGate | null = null;

export const setFailoverGate = (gate: FailoverGate): (() => void) => {
  liveGate = gate;
  return () => {
    if (liveGate === gate) liveGate = null;
  };
};

const gate: FailoverGate = {
  open: (profileId) => liveGate?.open(profileId) ?? false,
  failed: (profileId, kind, detail) => liveGate?.failed(profileId, kind, detail),
};

export const createModelCall = (deps: ModelCallDeps): ModelCall => createModelCallVia(callExtractionReply, Object.assign({
  gate,
  observe: (role: PassRole, call: RoleCallObservation) => roleHealth.noteCall(role, call),
  record: (record: ModelCallRecord) => modelCallLog.note(record),
  listed: harnessListed,
}, deps));
