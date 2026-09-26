import { callExtractionReply } from "@extraction/client";
import type { ModelCall } from "@extraction/modelRoute";
import { createModelCallVia, type ModelCallDeps } from "./modelCallCore";

export const createModelCall = (deps: ModelCallDeps): ModelCall => createModelCallVia(callExtractionReply, deps);
