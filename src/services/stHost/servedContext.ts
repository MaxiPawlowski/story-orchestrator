import { isRecord } from "@utils/guards";
import type { SillyTavernContext } from "./hostTypes";

const hostGlobal = globalThis as { SillyTavern?: { getContext?: () => unknown } };
const getContext = (): SillyTavernContext => hostGlobal.SillyTavern?.getContext?.() as SillyTavernContext;

export const SERVED_CONTEXT_TTL_MS = 60_000;

interface Probe {
  value: number | null;
  at: number;
  pending: Promise<void> | null;
}

const probes = new Map<string, Probe>();

export const servedContextOf = (props: unknown): number | null => {
  const settings = isRecord(props) && isRecord(props.default_generation_settings) ? props.default_generation_settings : null;
  const value = settings?.n_ctx;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
};

const headers = (): Record<string, string> => (getContext() as unknown as { getRequestHeaders: () => Record<string, string> }).getRequestHeaders();

async function probe(url: string, entry: Probe): Promise<void> {
  try {
    const response = await fetch("/api/backends/text-completions/props", {
      method: "POST", headers: headers(), body: JSON.stringify({ api_server: url, api_type: "llamacpp" }),
    });
    entry.value = response.ok ? servedContextOf(await response.json()) : null;
  } catch {
    entry.value = null;
  } finally {
    entry.at = Date.now();
    entry.pending = null;
  }
}

/** The context a llama.cpp server reports (`/props` n_ctx, through ST's own proxy, text-completions.js:234), cached a minute; null until the first answer. */
export function servedContext(apiUrl: string | null | undefined, now = Date.now()): number | null {
  const url = apiUrl?.trim();
  if (!url) return null;
  const entry = probes.get(url) ?? { value: null, at: 0, pending: null };
  probes.set(url, entry);
  if (!entry.pending && now - entry.at > SERVED_CONTEXT_TTL_MS) entry.pending = probe(url, entry);
  return entry.value;
}

export interface ReplyContextRead {
  maxContext: number;
  served: number | null;
  url: string;
}

/** The reply connection's context against what its llama.cpp server serves; null for any other connection. */
export function readReplyContext(): ReplyContextRead | null {
  try {
    const context = getContext();
    if (context.mainApi !== "textgenerationwebui" || context.textCompletionSettings?.type !== "llamacpp") return null;
    const url = context.getTextGenServer?.("llamacpp") ?? "";
    const maxContext = Number(context.maxContext);
    if (!url || !Number.isFinite(maxContext) || maxContext <= 0) return null;
    return { maxContext, served: servedContext(url), url };
  } catch {
    return null;
  }
}
