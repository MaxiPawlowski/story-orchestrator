import { getContext } from "./context";
import { isRecord } from "@utils/guards";
import { quoteSlashArg } from "@utils/string";

export interface ImageReadiness { ready: boolean; reason: string | null; source: string | null }

export async function stImageReadiness(): Promise<ImageReadiness> {
  const sd = getContext().extensionSettings.sd;
  if (!isRecord(sd) || typeof sd.source !== "string" || !document.getElementById("sd_source")) return { ready: false, reason: "Set up SillyTavern’s Image Generation extension first.", source: null };
  if (sd.source === "comfy") {
    if (typeof sd.comfy_url !== "string" || !sd.comfy_url) {
      return { ready: false, reason: "Choose a ComfyUI server in SillyTavern’s Image Generation settings.", source: sd.source };
    }
    try {
      const response = await fetch("/api/sd/comfy/ping", { method: "POST", headers: getContext().getRequestHeaders?.(),
        body: JSON.stringify({ url: sd.comfy_url }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("ComfyUI did not answer.");
    } catch { return { ready: false, reason: "ComfyUI is not reachable. Start it, then test the image setup again.", source: sd.source }; }
  }
  return { ready: true, reason: null, source: sd.source };
}

export async function renderStImage(positive: string, negative: string): Promise<string> {
  const ctx = getContext();
  const ready = await stImageReadiness();
  if (!ready.ready) throw new Error(ready.reason ?? "No image service is ready.");
  const result = await ctx.executeSlashCommandsWithOptions(`/imagine quiet=true edit=false extend=false processing=minimal negative=${quoteSlashArg(negative)} ${quoteSlashArg(positive)}`, {
    handleParserErrors: false, handleExecutionErrors: false, parserFlags: { 1: true, 2: false },
  });
  if (result?.isError || typeof result?.pipe !== "string" || !result.pipe) throw new Error(result?.errorMessage ?? "SillyTavern returned no generated image. Check its Image Generation settings.");
  return result.pipe;
}
