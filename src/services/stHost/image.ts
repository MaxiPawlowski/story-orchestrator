import { getContext } from "./context";
import { extensionsSharedModule } from "./modules";
import { isRecord } from "@utils/guards";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { log } from "@utils/log";
import { saveOpenChat } from "./persistence";

export interface ImageMessage {
  name: string;
  is_user: boolean;
  is_system: boolean;
  mes: string;
  original_avatar?: string;
  extra?: { media?: ImageMedia[]; inline_image?: boolean; media_index?: number; media_display?: string };
}
export interface ImageMedia {
  url: string;
  type: "image";
  title: string;
  source: "generated";
  image_director: Record<string, unknown>;
}
export interface ImageCharacter { key: string; name: string; description: string; appearance: string; enabled: boolean }
export interface ImageChat { id: string; groupId: string | null; folder: string; userName: string; messages: ImageMessage[]; characters: ImageCharacter[] }

const headers = () => getContext().getRequestHeaders?.() ?? { "Content-Type": "application/json" };
const asMessage = (value: unknown): ImageMessage | null => {
  if (!isRecord(value) || typeof value.mes !== "string") return null;
  return {
    name: typeof value.name === "string" ? value.name : "",
    is_user: value.is_user === true,
    is_system: value.is_system === true,
    mes: value.mes,
    original_avatar: typeof value.original_avatar === "string" ? value.original_avatar : undefined,
    extra: isRecord(value.extra) ? value.extra as ImageMessage["extra"] : undefined,
  };
};

export function imageChat(): ImageChat | null {
  const ctx = getContext();
  const id = typeof ctx.chatId === "string" ? ctx.chatId : "";
  if (!id) return null;
  const groupId = typeof ctx.groupId === "string" ? ctx.groupId : null;
  const group = groupId ? ctx.groups.find((entry) => String(entry.id) === groupId) : null;
  const disabled = new Set(group?.disabled_members ?? []);
  const avatars = (group ? group.members : [ctx.characters[Number(ctx.characterId)]?.avatar]).filter((avatar): avatar is string => typeof avatar === "string");
  const sd = isRecord(ctx.extensionSettings.sd) ? ctx.extensionSettings.sd : {};
  const prompts = isRecord(sd.character_prompts) ? sd.character_prompts : {};
  const characters: ImageCharacter[] = avatars.flatMap((avatar) => {
    const card = ctx.characters.find((entry) => entry.avatar === avatar);
    if (!card || typeof card.avatar !== "string" || typeof card.name !== "string") return [];
    const data = isRecord(card.data) ? card.data : {};
    const extensions: Record<string, unknown> = isRecord(data.extensions) ? data.extensions : {};
    const prompt = isRecord(extensions.sd_character_prompt) ? extensions.sd_character_prompt : {};
    const saved = prompts[card.avatar.replace(/\.[^/.]+$/, "")];
    return [{
      key: card.avatar, name: card.name, description: typeof card.description === "string" ? card.description : "",
      appearance: typeof saved === "string" ? saved : typeof prompt.positive === "string" ? prompt.positive : "",
      enabled: !disabled.has(card.avatar),
    }];
  });
  return {
    id, groupId, folder: groupId ?? characters[0]?.name ?? "", userName: ctx.name1,
    messages: ctx.chat.map((row) => asMessage(row) ?? { name: "", mes: "", is_user: false, is_system: true }), characters,
  };
}

export async function imageModel(profileId: string, messages: Array<{ role: string; content: string }>, maxTokens: number, grammar?: string, signal?: AbortSignal): Promise<string> {
  const response: unknown = await extensionsSharedModule.ConnectionManagerRequestService.sendRequest(
    profileId, messages, maxTokens, { extractData: true, includePreset: true, includeInstruct: true, stream: false, ...(signal ? { signal } : {}) }, grammar ? { grammar } : {},
  );
  if (typeof response === "string") return response;
  if (isRecord(response)) {
    if (typeof response.content === "string") return response.content;
    if (typeof response.text === "string") return response.text;
  }
  throw new Error("Image director received no text from its profile.");
}

export async function imageRender(url: string, graph: Record<string, unknown>, signal?: AbortSignal): Promise<{ data: string; format: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  let response: Response;
  try {
    response = await fetch("/api/sd/comfy/generate", {
      method: "POST", headers: headers(), body: JSON.stringify({ url, prompt: JSON.stringify({ prompt: graph }) }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error("ComfyUI did not finish within three minutes.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
  if (!response.ok) {
    const reason = (await response.text()).trim().slice(0, 500);
    log.warn("ComfyUI render failed", response.status, reason);
    throw new Error(`ComfyUI refused the render (${response.status}). Check the browser console for details.`);
  }
  const image: unknown = await response.json();
  if (!isRecord(image) || typeof image.data !== "string" || !image.data) throw new Error("ComfyUI returned no image.");
  return { data: image.data, format: typeof image.format === "string" ? image.format : "png" };
}

export async function imageSave(data: string, format: string, folder: string, name: string): Promise<string> {
  const response = await fetch("/api/images/upload", { method: "POST", headers: headers(), body: JSON.stringify({ image: data, format, ch_name: folder, filename: name.replace(/\./g, "_") }) });
  if (!response.ok) throw new Error(`Saving the image failed (${response.status}).`);
  const saved: unknown = await response.json();
  if (!isRecord(saved) || typeof saved.path !== "string") throw new Error("The image upload returned no path.");
  return saved.path;
}

export async function imageDelete(path: string): Promise<WriteResult<{ path: string }>> {
  const response = await fetch("/api/images/delete", { method: "POST", headers: headers(), body: JSON.stringify({ path }) });
  return response.ok ? wrote({ path }) : couldNot(`ST did not remove the unused image (${response.status}).`);
}

export async function imagePlace(chatId: string, target: number | null, caption: string, media: ImageMedia, placement: "inline" | "message" | "background"): Promise<WriteResult<{ placed: true }>> {
  const ctx = getContext();
  if (ctx.chatId !== chatId) return couldNot("The chat changed while the image was rendering.");
  if (placement === "background") {
    const event = ctx.eventTypes.FORCE_SET_BACKGROUND;
    if (!event) throw new Error("ST cannot set a generated background.");
    await ctx.eventSource.emit(event, { url: `url("${encodeURI(media.url)}")`, path: media.url });
    return wrote({ placed: true });
  }
  const saveMedia = async (): Promise<WriteResult<{ placed: true }>> => {
    if (getContext().chatId !== chatId) return couldNot("The chat changed before the image could be saved.");
    const save = await saveOpenChat("image-director-media");
    if (!save.ok) return couldNot(save.reason);
    const observed = await save.observed;
    return save.chatId === chatId && observed.ok ? wrote({ placed: true }) : couldNot(observed.lost ?? "The image was not saved to this chat.");
  };
  const host = ctx as typeof ctx & {
    appendMediaToMessage?: (message: unknown, element: unknown, scrollBehavior?: string) => void;
    addOneMessage?: (message: unknown) => void;
  };
  const row = target === null ? null : ctx.chat[target];
  if (placement === "inline" && isRecord(row)) {
    const previous = isRecord(row.extra) ? row.extra : {};
    const existing = Array.isArray(previous.media) ? previous.media : [];
    row.extra = { ...previous, media: [...existing, media], media_index: existing.length, inline_image: true, media_display: "gallery" };
    const jquery = (globalThis as { $?: (selector: string) => { length: number } }).$;
    const element = jquery?.(`#chat .mes[mesid="${target}"]`);
    if (element?.length && host.appendMediaToMessage) host.appendMediaToMessage(row, element, "keep");
    return saveMedia();
  }
  if (!host.addOneMessage || !ctx.eventTypes.MESSAGE_RECEIVED || !ctx.eventTypes.CHARACTER_MESSAGE_RENDERED) throw new Error("ST cannot post an image message.");
  const posted = {
    name: "Image Director", is_user: false, is_system: true, mes: caption, send_date: new Date().toISOString(),
    extra: { media: [media], media_display: "gallery", media_index: 0, inline_image: false },
  };
  ctx.chat.push(posted);
  const index = ctx.chat.length - 1;
  await ctx.eventSource.emit(ctx.eventTypes.MESSAGE_RECEIVED, index, "extension");
  if (getContext().chatId !== chatId) return couldNot("The chat changed while the image was being posted.");
  host.addOneMessage(posted);
  await ctx.eventSource.emit(ctx.eventTypes.CHARACTER_MESSAGE_RENDERED, index, "extension");
  return saveMedia();
}

export function imagePriorChat(): unknown {
  return getContext().chatMetadata["st-image-director"];
}

export function imageChatSettings(): unknown {
  return getContext().chatMetadata.story_orchestrator_image ?? imagePriorChat();
}

export async function imageWriteChatSettings(value: unknown, expectedChatId?: string): Promise<WriteResult<{ chatId: string }>> {
  const ctx = getContext();
  if (!ctx.chatId || (expectedChatId && ctx.chatId !== expectedChatId)) return couldNot("The image settings belong to another chat.");
  ctx.chatMetadata.story_orchestrator_image = { ...(isRecord(value) ? value : {}), chatId: ctx.chatId };
  const save = await saveOpenChat("image-director");
  if (!save.ok) return save;
  if (save.chatId !== ctx.chatId || getContext().chatId !== ctx.chatId) return couldNot("The image settings were not saved to this chat.");
  const observed = await save.observed;
  return observed.ok ? wrote({ chatId: save.chatId }) : couldNot(observed.lost ?? "The image settings could not be saved to this chat.");
}

export function imageComfyUrl(configured: string): string {
  if (configured.trim()) return configured.trim();
  const sd = getContext().extensionSettings.sd;
  return isRecord(sd) && typeof sd.comfy_url === "string" && sd.comfy_url ? sd.comfy_url : "http://127.0.0.1:8188";
}

export async function imageReview(content: HTMLElement): Promise<WriteResult<{ accepted: boolean }>> {
  const ctx = getContext();
  const host = ctx as typeof ctx & {
    callGenericPopup?: (element: HTMLElement, kind: number, text: string, options: Record<string, unknown>) => Promise<unknown>;
    POPUP_TYPE?: { TEXT?: number };
    POPUP_RESULT?: { AFFIRMATIVE?: unknown };
  };
  if (!host.callGenericPopup || host.POPUP_TYPE?.TEXT === undefined) throw new Error("ST cannot open the image review.");
  const result = await host.callGenericPopup(content, host.POPUP_TYPE.TEXT, "", { okButton: "Use selected", cancelButton: "Discard all", wide: true, large: true });
  return wrote({ accepted: result === host.POPUP_RESULT?.AFFIRMATIVE });
}
