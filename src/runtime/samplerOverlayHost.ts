import { observeSamplerPayloads } from "@services/STAPI";
import type { SamplerApi } from "@utils/samplerKeys";
import type { GenerationLifecycleSnapshot } from "./generationLifecycle";
import { samplerOverlay, type SamplerOverlay, type SamplerRequest } from "./samplerOverlay";

export interface SamplerOverlayWiring {
  chatId: () => string | null;
  generation: () => GenerationLifecycleSnapshot;
  journal: (summary: string, note: string) => void;
  overlay?: SamplerOverlay;
}

export function startSamplerOverlay(deps: SamplerOverlayWiring): () => void {
  const overlay = deps.overlay ?? samplerOverlay;
  const request = (api: SamplerApi, type: string | null, dryRun: boolean): SamplerRequest => {
    const open = deps.generation();
    return { api, chatId: deps.chatId(), type, dryRun, open: open.outermost !== null, innermost: open.nested.length ? open.nested[open.nested.length - 1] : open.outermost?.type ?? null };
  };
  const record = (result: ReturnType<SamplerOverlay["apply"]>) => {
    const active = overlay.view();
    if (!result?.first || !active) return;
    deps.journal(`Sampler overlay "${active.name}" applied to this checkpoint's replies`, [`set ${result.applied.join(", ") || "nothing"}`, result.skipped.length ? `not in this request: ${result.skipped.join(", ")}` : ""].filter(Boolean).join("; "));
  };
  return observeSamplerPayloads({
    textgen: (payload, dryRun) => record(overlay.apply(payload, request("textgen", null, dryRun))),
    chat: (payload) => record(overlay.apply(payload, request("chat", typeof payload.type === "string" ? payload.type : null, false))),
  });
}
