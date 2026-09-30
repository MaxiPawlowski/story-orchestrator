import { harnessStatusCached, refreshHarnessStatus, sendConnectionProfileRequest, sendHarness } from "@services/STAPI";
import { isHarnessKey, parseHarnessKey } from "@utils/harness";
import { PROBE_MAX_TOKENS, PROBE_PROMPT, PROBE_TIMEOUT_MS, type ProbeResult } from "./breaker";
import type { ModelCall, ModelRoute } from "./modelRoute";
import { replyVia } from "./reply";

export async function probeHarness(key: string): Promise<ProbeResult> {
  const parsed = parseHarnessKey(key);
  const row = parsed ? (await refreshHarnessStatus(true))?.harnesses[parsed.harness] ?? harnessStatusCached()?.harnesses[parsed.harness] : null;
  if (!parsed || !row) return { ok: false, kind: "transport", message: "the harness plugin did not answer its status" };
  if (!row.installed || !row.offered) return { ok: false, kind: "config", message: row.problem ?? `${parsed.harness} is not offered on this install` };
  if (!row.fresh) return { ok: false, kind: "transport", message: row.loginProblem ?? `${parsed.harness} is not logged in` };
  if (row.quotaUntil && row.quotaUntil > Date.now()) return { ok: false, kind: "transport", message: `${parsed.harness} usage limit until ${new Date(row.quotaUntil).toISOString()}` };
  return { ok: true };
}

export async function probeModel(profileId: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  if (isHarnessKey(profileId)) return probeHarness(profileId);
  const reply = await sendConnectionProfileRequest(profileId, PROBE_PROMPT, PROBE_MAX_TOKENS, { signal: AbortSignal.timeout(timeoutMs) });
  if (reply.ok || reply.kind === "reasoning-exhausted") return { ok: true };
  const kind = reply.kind === "refused" ? "config" : reply.kind === "auth" || reply.kind === "quota" || reply.kind === "malformed" ? "transport" : reply.kind;
  return { ok: false, kind, message: reply.kind === "timeout" ? `the memory model did not answer a probe within ${timeoutMs} ms` : reply.message };
}

export const callExtractionReply = replyVia((profileId, prompt, maxTokens, options) => sendConnectionProfileRequest(profileId, prompt, maxTokens, options), sendHarness);

export const routedModel = (route: ModelRoute | null): ModelCall => (prompt, ask) => callExtractionReply(prompt, route, ask);
