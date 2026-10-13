import { buildWiCuratorPrompt, refuseTitleOnlyEdits, selectCuratorDigest, CURATOR_DIGEST_FULL_LIMIT, CURATOR_DIGEST_MIN_ENTRIES } from "@stagecraft/index";
import type { CuratorDigest, CuratorEntryView, CuratorPlan, CuratorScope } from "@stagecraft/index";

export const INDEX_MIN_ENTRIES = CURATOR_DIGEST_MIN_ENTRIES;
export const INDEX_FULL_LIMIT = CURATOR_DIGEST_FULL_LIMIT;

export interface CuratorIndexArm {
  full: CuratorEntryView[];
  titleOnly: CuratorEntryView[];
  digest: CuratorDigest;
  prompt: string;
  ratio: number;
}

export const curatorIndexArm = (scope: CuratorScope): CuratorIndexArm => {
  const digest = selectCuratorDigest(scope.entries, scope);
  if (!digest) throw new Error(`the curator index arm needs at least ${INDEX_MIN_ENTRIES} entries`);
  const prompt = buildWiCuratorPrompt(scope, digest);
  return { full: digest.full, titleOnly: digest.titleOnly, digest, prompt, ratio: prompt.length / buildWiCuratorPrompt(scope).length };
};

export const refuseIndexEdits = (plan: CuratorPlan, arm: CuratorIndexArm): CuratorPlan => refuseTitleOnlyEdits(plan, arm.digest);
