import { getContext, subscribeToHostEvents } from "@services/STAPI";
import { SUMMARIZE_PROMPT_KEY, VECTORS_PROMPT_KEY } from "@services/stHost/transcriptCopiers";
import { unwrapVectorsInterceptor, viewHostCopierPrompts, wrapVectorsInterceptor, type CopierPromptView } from "@services/stHost/copierPrompts";
import { log } from "@utils/log";

export interface CopierFilter {
  intercept: () => void;
  dispose: () => void;
}

export function startCopierFilter(view: () => CopierPromptView): CopierFilter {
  const apply = (keys: readonly string[], audience: CopierPromptView) => {
    const result = viewHostCopierPrompts(getContext().extensionPrompts, audience, keys);
    if (!result.ok) log.debug("copier filter", result.reason);
    else if (result.changed.length && audience) log.debug("copier filter: held secrets left out of", result.changed.join(", "));
  };
  const restore = () => apply([SUMMARIZE_PROMPT_KEY, VECTORS_PROMPT_KEY], null);
  const off = subscribeToHostEvents([{ eventName: "GENERATE_AFTER_DATA", handler: restore }]);
  return {
    intercept: () => {
      wrapVectorsInterceptor(() => apply([VECTORS_PROMPT_KEY], view()));
      apply([SUMMARIZE_PROMPT_KEY], view());
    },
    dispose: () => {
      off();
      unwrapVectorsInterceptor();
      restore();
    },
  };
}
