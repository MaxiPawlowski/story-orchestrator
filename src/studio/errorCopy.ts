import { log } from "@utils/log";
import { ModelCallError } from "@extraction/modelError";
import { AgentRouteUnavailable } from "@copilot/agent/route";
const SHOWN_KINDS: ReadonlySet<string> = new Set(["config", "quota", "auth"]);

export const studioFailureText = (what: string): string => `${what}. Try again; the details are in the browser console.`;

export const studioFailure = (what: string, caught: unknown): string => {
  log.warn(what, caught);
  return studioFailureText(what);
};

export const setupReason = (caught: unknown): string | null => {
  if (caught instanceof AgentRouteUnavailable) return caught.message;
  return caught instanceof ModelCallError && SHOWN_KINDS.has(caught.kind) ? caught.message : null;
};

export const routeFailure = (what: string, caught: unknown): string => {
  const reason = setupReason(caught);
  if (!reason) return studioFailure(what, caught);
  log.warn(what, caught);
  return `${what}: ${reason}`;
};
