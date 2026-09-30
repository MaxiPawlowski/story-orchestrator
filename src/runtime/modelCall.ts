import { callExtractionReply } from "@extraction/client";
import type { ModelCall } from "@extraction/modelRoute";
import type { PassRole } from "@extraction/passRole";
import { harnessListed } from "@services/STAPI";
import { createModelCallVia, type ModelCallDeps, type RoleCallObservation } from "./modelCallCore";
import { modelCallLog, type ModelCallRecord } from "./modelCallLog";
import { roleHealth } from "./roleHealth";

export const createModelCall = (deps: ModelCallDeps): ModelCall => createModelCallVia(callExtractionReply, Object.assign({
  observe: (role: PassRole, call: RoleCallObservation) => roleHealth.noteCall(role, call),
  record: (record: ModelCallRecord) => modelCallLog.note(record),
  listed: harnessListed,
}, deps));
