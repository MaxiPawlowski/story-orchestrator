import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { SUMMARIZE_PROMPT_KEY, VECTORS_PROMPT_KEY } from "./transcriptCopiers";

export type CopierPromptView = ((text: string) => string) | null;

export const FILTERED_COPIER_KEYS: readonly string[] = [SUMMARIZE_PROMPT_KEY, VECTORS_PROMPT_KEY];

// ST 7c3994196. setExtensionPrompt stores a NEW object per call (script.js:8926-8935); Summarize sets "1_memory"
// from its worker (memory/index.js:965), Vector Storage sets "3_vectors" inside its generate interceptor
// "vectors_rearrangeChat" (vectors/index.js:776-856, 891, manifest loading_order 100, after ours at 1;
// extensions.js:2033). Prompt assembly reads entry.value after the interceptors (script.js:4564, 4700, 5647;
// openai.js:1389-1407). So the raw text is kept per entry object and the entry's value is rewritten in place.
interface Slot { raw: string; written: string }

const slots = new WeakMap<object, Slot>();

function viewCopierEntry(entry: { value?: unknown }, view: CopierPromptView): boolean {
  if (typeof entry.value !== "string") return false;
  const held = slots.get(entry);
  const raw = held && held.written === entry.value ? held.raw : entry.value;
  const next = view ? view(raw) : raw;
  slots.set(entry, { raw, written: next });
  if (next === entry.value) return false;
  entry.value = next;
  return true;
}

export function viewHostCopierPrompts(prompts: Record<string, unknown> | undefined, view: CopierPromptView, keys: readonly string[] = FILTERED_COPIER_KEYS): WriteResult<{ changed: string[] }> {
  if (!prompts || typeof prompts !== "object") return couldNot("this build exposes no extension prompts, so another extension's block cannot be filtered");
  const changed = keys.filter((key) => {
    const entry = prompts[key];
    return Boolean(entry) && typeof entry === "object" && viewCopierEntry(entry as { value?: unknown }, view);
  });
  return wrote({ changed });
}

const VECTORS_INTERCEPTOR = "vectors_rearrangeChat";
const WRAPPED = Symbol.for("story-orchestrator.copierFilter");

type Interceptor = ((...args: unknown[]) => unknown) & { [WRAPPED]?: Interceptor };

let afterVectors: (() => void) | null = null;

export function wrapVectorsInterceptor(after: () => void): WriteResult<{ wrapped: boolean }> {
  afterVectors = after;
  const current = Reflect.get(globalThis, VECTORS_INTERCEPTOR) as Interceptor | undefined;
  if (typeof current !== "function") return couldNot("Vector Storage's generate interceptor is not loaded");
  if (current[WRAPPED]) return wrote({ wrapped: false });
  const original = current;
  const wrapped: Interceptor = async function wrappedVectors(this: unknown, ...args: unknown[]) {
    try {
      return await original.apply(this, args);
    } finally {
      afterVectors?.();
    }
  };
  wrapped[WRAPPED] = original;
  Reflect.set(globalThis, VECTORS_INTERCEPTOR, wrapped);
  return wrote({ wrapped: true });
}

export function unwrapVectorsInterceptor(): WriteResult<{ unwrapped: boolean }> {
  afterVectors = null;
  const current = Reflect.get(globalThis, VECTORS_INTERCEPTOR) as Interceptor | undefined;
  const original = typeof current === "function" ? current[WRAPPED] : undefined;
  if (!original) return wrote({ unwrapped: false });
  Reflect.set(globalThis, VECTORS_INTERCEPTOR, original);
  return wrote({ unwrapped: true });
}
