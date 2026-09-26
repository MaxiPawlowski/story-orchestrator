import { createModelCall } from "../../src/runtime/modelCall";
import type { PassProfiles } from "../../src/runtime/passProfiles";
import type { ModelCall } from "../../src/extraction/modelRoute";

export const testModel = (profileId: string | null = "memory", profiles?: PassProfiles, exists: (id: string) => boolean = () => true): ModelCall =>
  createModelCall({ settings: () => ({ profileId, ...(profiles ? { profiles } : {}) }), exists });
