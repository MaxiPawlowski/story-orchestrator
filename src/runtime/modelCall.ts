import { callExtractionReply } from "@extraction/client";
import type { ModelCall } from "@extraction/modelRoute";
import { createModelCallVia, type ModelCallDeps } from "./modelCallCore";
import { roleHealth } from "./roleHealth";

export const createModelCall = (deps: ModelCallDeps): ModelCall =>
  createModelCallVia(callExtractionReply, { observe: (role, call) => roleHealth.noteCall(role, call), ...deps });
