import { harnessStatusCached, refreshHarnessStatus } from "@services/STAPI";
import { anySignal } from "@utils/signals";
import { harnessKey, parseHarnessKey } from "@utils/harness";
import type { ProbeResult } from "./breaker";
import { callTimeoutMs, DEFAULT_MAX_TOKENS, estimateTokens } from "./callBudget";
import { ModelCallError } from "./modelError";
import type { ExtractionReply, ModelRoute } from "./modelRoute";
import { stripReasoningBlocks } from "./parse";
import type { CallOptions, HarnessTransport } from "./reply";

export const HARNESS_SPAWN_MS = 15_000;
export const HARNESS_CHARS_PER_TOKEN = 6;
const HARNESS_MAX_OUTPUT_CHARS = 400_000;

export async function viaHarness(harness: HarnessTransport, route: ModelRoute & { kind: "harness" }, prompt: string, options: CallOptions, answered: (ms: number) => void): Promise<ExtractionReply> {
  const key = harnessKey(route.harness, route.model);
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = Math.round(callTimeoutMs(maxTokens, estimateTokens(prompt), options.budgetKind) * (options.timeoutScale ?? 1) * (route.options?.timeoutScale ?? 1)) + HARNESS_SPAWN_MS;
  const startedAt = Date.now();
  const reply = await harness({
    harness: route.harness,
    model: route.model,
    role: options.role ?? "read",
    ...(route.effort ? { effort: route.effort } : {}),
    prompt,
    maxOutputChars: Math.min(HARNESS_MAX_OUTPUT_CHARS, maxTokens * HARNESS_CHARS_PER_TOKEN),
    timeoutMs,
    signal: anySignal([options.signal, AbortSignal.timeout(timeoutMs + 5_000)]),
  });
  if (!reply.ok) throw new ModelCallError(reply.kind, reply.message, key, reply.kind === "timeout" ? timeoutMs : null, reply.retryAt ?? null);
  answered(Date.now() - startedAt);
  const text = stripReasoningBlocks(reply.text);
  if (!text.trim()) throw new ModelCallError("malformed", "the harness answered with no text", key);
  const identity = { ...(reply.usage ? { usage: reply.usage } : {}), ...(reply.model !== undefined ? { model: reply.model } : {}) };
  return { text, finish: reply.finish, meter: reply.meter, ...identity, spawnMs: reply.spawnMs ?? null };
}

/** A harness route's breaker probe spends no quota: it re-reads the plugin status (installed, offered, logged in, not quota-held). */
export async function probeHarness(key: string): Promise<ProbeResult> {
  const parsed = parseHarnessKey(key);
  const row = parsed ? ((await refreshHarnessStatus(true)) ?? harnessStatusCached())?.harnesses[parsed.harness] : null;
  if (!parsed || !row) return { ok: false, kind: "transport", message: "the harness plugin did not answer its status" };
  if (!row.installed || !row.offered) return { ok: false, kind: "config", message: row.problem ?? `${parsed.harness} is not offered on this install` };
  if (row.blocked) return { ok: false, kind: "config", message: row.blocked };
  if (row.cacheWarm === false) return { ok: false, kind: "config", message: `${parsed.harness}'s model cache is not warmed yet: the host owner runs the warm-up once (POST /warm, admin)` };
  if (!row.fresh) return { ok: false, kind: "transport", message: row.loginProblem ?? `${parsed.harness} is not logged in` };
  if (row.quotaUntil && row.quotaUntil > Date.now()) return { ok: false, kind: "transport", message: `${parsed.harness} usage limit until ${new Date(row.quotaUntil).toISOString()}` };
  return { ok: true };
}
