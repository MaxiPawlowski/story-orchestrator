import { sendConnectionProfileRequest } from "@services/STAPI";
import { PROBE_MAX_TOKENS, PROBE_PROMPT, PROBE_TIMEOUT_MS, type ProbeResult } from "./breaker";
import type { ModelCall, ModelRoute } from "./modelRoute";
import { replyVia } from "./reply";

export async function probeModel(profileId: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  const reply = await sendConnectionProfileRequest(profileId, PROBE_PROMPT, PROBE_MAX_TOKENS, { signal: AbortSignal.timeout(timeoutMs) });
  if (reply.ok) return { ok: true };
  return { ok: false, kind: reply.kind, message: reply.kind === "timeout" ? `the memory model did not answer a probe within ${timeoutMs} ms` : reply.message };
}

export const callExtractionReply = replyVia((profileId, prompt, maxTokens, options) => sendConnectionProfileRequest(profileId, prompt, maxTokens, options));

export const routedModel = (route: ModelRoute | null): ModelCall => (prompt, ask) => callExtractionReply(prompt, route, ask);
