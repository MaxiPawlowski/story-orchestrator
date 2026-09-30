import { callExtractionReply } from "@extraction/client";
import type { ModelCall } from "@extraction/modelRoute";
import type { PassRole } from "@extraction/passRole";
import { createModelCallVia, type ModelCallDeps, type RoleCallObservation } from "./modelCallCore";
import { roleHealth } from "./roleHealth";

export const createModelCall = (deps: ModelCallDeps): ModelCall =>
  createModelCallVia(callExtractionReply, Object.assign({ observe: (role: PassRole, call: RoleCallObservation) => roleHealth.noteCall(role, call) }, deps));
