import { getContext } from "./context";
import type { StoryImageDirector } from "../../image/runtime";
import type { ImageArgs } from "../../image/routing";
import type { ImageRequest } from "../../image/prompt";
import { isRecord } from "@utils/guards";

const PURPOSES = ["scene", "character", "portrait", "user", "background", "free"] as const;
const ALIASES: Record<string, ImageRequest["purpose"]> = { you: "character", face: "portrait", me: "user", bg: "background" };
const ARG_NAMES = ["checkpoint", "quality", "aspect", "shot", "placement", "candidates", "seed", "mes", "extend"];
const factory = (value: unknown): value is { fromProps: (props: Record<string, unknown>) => unknown } =>
  value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as { fromProps?: unknown }).fromProps === "function";
const commandParser = (value: unknown): value is { addCommandObject: (command: unknown) => void } =>
  value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as { addCommandObject?: unknown }).addCommandObject === "function";

const commandRequest = (named: Record<string, unknown>, text: unknown): { request: ImageRequest; args: ImageArgs } => {
  const raw = Array.isArray(text) ? text.join(" ") : typeof text === "string" ? text : "";
  const [first = "", ...rest] = raw.trim().split(/\s+/);
  const recognized = PURPOSES.find((purpose) => purpose === first.toLowerCase()) ?? ALIASES[first.toLowerCase()];
  const purpose = recognized ?? "scene";
  const instruction = recognized ? rest.join(" ") : raw.trim();
  const num = (value: unknown) => typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
  const messageId = num(named.mes);
  return {
    request: { purpose, text: instruction, messageId: messageId ?? null, raw: purpose === "free" && Boolean(instruction) && named.extend !== "true" },
    args: {
      checkpoint: typeof named.checkpoint === "string" ? named.checkpoint : undefined,
      quality: named.quality === "hires" ? "hires" : named.quality === "base" ? "base" : undefined,
      aspect: ["portrait", "square", "landscape", "wide"].includes(String(named.aspect)) ? named.aspect as ImageArgs["aspect"] : undefined,
      shot: ["close", "upper", "cowboy", "full", "wide", "pov", "from_above", "from_below"].includes(String(named.shot)) ? named.shot as ImageArgs["shot"] : undefined,
      placement: ["inline", "message", "background"].includes(String(named.placement)) ? named.placement as ImageArgs["placement"] : undefined,
      candidates: num(named.candidates), seed: num(named.seed),
    },
  };
};

export function registerImageSurface(image: StoryImageDirector): () => void {
  const ctx = getContext();
  const slash = ctx.SlashCommand;
  const parser: unknown = ctx.SlashCommandParser;
  const argument = ctx.SlashCommandNamedArgument;
  const unnamed = ctx.SlashCommandArgument;
  const kind = ctx.ARGUMENT_TYPE;
  if (factory(slash) && commandParser(parser) && factory(argument) && factory(unnamed) && isRecord(kind)) {
    const makeArgument = argument.fromProps;
    // `/direct` was the PoC's command; it is disabled now, so the merged command takes the name over as
    // an alias of the Story Orchestrator image tool. While the PoC is installed and enabled, its own
    // `/direct` would collide — keep the PoC disabled.
    parser.addCommandObject(slash.fromProps({
      name: "so-image",
      aliases: ["direct"],
      helpString: "Illustrate the current scene: /so-image (or /direct) scene|portrait|background|free [text]. Returns the saved image path.",
      namedArgumentList: ARG_NAMES.map((key) => makeArgument({ name: key, description: `Image ${key}`, typeList: [kind.STRING] })),
      unnamedArgumentList: [unnamed.fromProps({ description: "Purpose and optional instruction", typeList: [kind.STRING], acceptsMultiple: true })],
      callback: (named: Record<string, unknown>, text: unknown) => {
        const { request, args } = commandRequest(named, text);
        return image.direct(request, args);
      },
    }));
  }

  const addButtons = () => {
    for (const container of document.querySelectorAll("#message_template .extraMesButtons, #chat .mes .extraMesButtons")) {
      if (container.querySelector(".so-image-button")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mes_button so-image-button fa-solid fa-clapperboard";
      button.title = "Illustrate this moment";
      button.setAttribute("aria-label", "Illustrate this moment");
      container.prepend(button);
    }
    const menu = document.querySelector("#extensionsMenu");
    if (menu && !menu.querySelector("#so-image-wand")) {
      const item = document.createElement("button");
      item.type = "button";
      item.id = "so-image-wand";
      item.className = "list-group-item flex-container flexGap5";
      item.setAttribute("aria-label", "Illustrate story scene");
      const icon = document.createElement("div");
      icon.className = "fa-solid fa-clapperboard extensionsMenuExtensionButton";
      const label = document.createElement("span");
      label.textContent = "Illustrate story scene";
      item.append(icon, label);
      menu.append(item);
    }
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#so-image-wand")) {
      void image.direct({ purpose: "scene", text: "", messageId: null }).catch(() => undefined);
      return;
    }
    const button = target.closest(".so-image-button");
    if (!button) return;
    const raw = button.closest(".mes")?.getAttribute("mesid") ?? "";
    const messageId = raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) : null;
    void image.direct({ purpose: "scene", text: "", messageId }).catch(() => undefined);
  };
  addButtons();
  document.addEventListener("click", onClick);
  const changed = ctx.eventTypes.CHAT_CHANGED;
  const ready = ctx.eventTypes.APP_READY;
  const rendered = ctx.eventTypes.CHARACTER_MESSAGE_RENDERED;
  const onRendered = (messageId: unknown, type: unknown) => {
    if (typeof messageId === "number" && Number.isFinite(messageId)) void image.onReply(messageId, type);
  };
  if (changed) ctx.eventSource.on(changed, addButtons);
  if (ready) ctx.eventSource.on(ready, addButtons);
  if (rendered) ctx.eventSource.on(rendered, onRendered);
  const toolHost = ctx as typeof ctx & {
    registerFunctionTool?: (tool: Record<string, unknown>) => void;
    unregisterFunctionTool?: (name: string) => void;
  };
  if (typeof toolHost.registerFunctionTool === "function") {
    toolHost.registerFunctionTool({
      name: "illustrate_scene", displayName: "Illustrate scene",
      description: "Draw a visually striking moment of this story; do not describe the picture yourself.",
      parameters: {
        type: "object", properties: {
          purpose: { type: "string", enum: ["scene", "character", "portrait", "background"] },
          focus: { type: "string" },
        }, required: ["purpose"],
      },
      shouldRegister: () => image.settings().enabled && image.settings().automation.mode === "tool",
      stealth: true,
      action: (args: unknown) => {
        const parsed = isRecord(args) ? args : {};
        const purpose = PURPOSES.find((entry) => entry === parsed.purpose) ?? "scene";
        void image.direct({ purpose, text: typeof parsed.focus === "string" ? parsed.focus : "", messageId: null }).catch(() => undefined);
        return "";
      },
    });
  }
  return () => {
    document.removeEventListener("click", onClick);
    if (changed) ctx.eventSource.removeListener?.(changed, addButtons);
    if (ready) ctx.eventSource.removeListener?.(ready, addButtons);
    if (rendered) ctx.eventSource.removeListener?.(rendered, onRendered);
    if (toolHost.unregisterFunctionTool) toolHost.unregisterFunctionTool("illustrate_scene");
    document.querySelectorAll(".so-image-button, #so-image-wand").forEach((element) => element.remove());
  };
}
