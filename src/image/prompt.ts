import { ASPECTS, CHECKPOINTS, SHOTS, type Aspect, type Shot } from "./catalog";
import type { ImageChat } from "@services/stHost/image";
import type { Route } from "./routing";

export interface ImageRequest {
  purpose: Route["purpose"];
  text: string;
  messageId: number | null;
  raw?: boolean;
}
export interface ImageScene {
  target: number | null;
  messages: Array<{ name: string; text: string; target: boolean }>;
  subjects: Array<{ key: string; name: string; appearance: string; focus: boolean; described?: boolean }>;
  focus: string | null;
  location: string | null;
  checkpoint: string | null;
  visualDetails?: string[];
  visualStyle?: string;
}
export interface ImageReply {
  caption: string;
  checkpoint: string;
  reason: string;
  visible: string[];
  aspect: Aspect | null;
  shot: Shot | null;
  prompt: string;
  negative: string;
}

export const templateImagePrompt = (scene: ImageScene, purpose: string, text: string): string => [
  scene.visualStyle,
  purpose === "background" ? "Scenery, no people" : scene.subjects.filter((person) => !person.described).map((person) => person.appearance).filter(Boolean).join("; "),
  scene.location,
  scene.checkpoint,
  ...(scene.visualDetails ?? []),
  text,
].filter(Boolean).join(". ") || "An establishing illustration of the current scene";

export const sceneForImage = (chat: ImageChat, request: ImageRequest, contextMessages: number, checkpoint: string | null = null, location: string | null = null): ImageScene => {
  const messages = chat.messages;
  let target = request.messageId !== null && messages[request.messageId] ? request.messageId : -1;
  if (target < 0) for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!messages[index].is_system && messages[index].mes.trim()) { target = index; break; }
  }
  const from = Math.max(0, target - contextMessages + 1);
  const window = messages.slice(from, target + 1).flatMap((message, at) => message.mes.trim() && !message.is_system
    ? [{ name: message.name, text: message.mes.slice(0, 1200), target: from + at === target }] : []);
  const speaker = target >= 0 ? messages[target] : null;
  const focus = request.purpose === "background" ? null : chat.characters.find((card) => card.key === speaker?.original_avatar || card.name === speaker?.name)?.key ?? null;
  const speakers = new Set(window.map((message) => message.name));
  const subjects = request.purpose === "background" ? [] : chat.characters
    .filter((card) => card.enabled || speakers.has(card.name) || card.key === focus)
    .map((card) => ({ key: card.key, name: card.name, appearance: card.appearance || card.description.slice(0, 500), focus: card.key === focus, described: !card.appearance }));
  return { target: target < 0 ? null : target, messages: window, subjects, focus, location, checkpoint };
};

const TAG_SKILL = [
  "Write 25–45 comma-separated visual tags for SDXL. Count only visible people.",
  "Copy fixed hair, eyes, clothing from their descriptions. Do not include names, ages, artist names or quality tags.",
  "Describe one frozen moment and use a camera/framing tag.",
].join(" ");

export const imageMessages = (request: ImageRequest, scene: ImageScene, route: Route): Array<{ role: string; content: string }> => {
  const menu = route.allowed.map((file) => {
    const entry = CHECKPOINTS.find((item) => item.file === file);
    return entry ? `${entry.file} (${entry.label}; ${entry.notes})` : file;
  }).join("\n");
  const system = [
    "You direct one image for an illustrated story. Return one JSON object with keys caption, checkpoint, reason, visible, aspect, shot, prompt, negative. No other text.",
    `The checkpoint must be one of: ${route.allowed.join(", ")}. Use the default ${route.checkpoint.file} unless another allowed model clearly fits better.`,
    `The aspect must be one of ${ASPECTS.join(", ")}; shot one of ${SHOTS.join(", ")}.`,
    `Default framing: ${route.shot}. Output only people actually visible in the "visible" list.`,
    TAG_SKILL,
  ].join("\n");
  const user = [
    `PURPOSE: ${request.purpose}; scene image is the target reply, background contains no people.`,
    request.text ? `INSTRUCTION: ${request.text}` : "",
    scene.checkpoint ? `STORY BEAT (not an image model): ${scene.checkpoint}` : "",
    scene.location ? `CURRENT LOCATION: ${scene.location}` : "",
    scene.visualStyle ? `STORY VISUAL DIRECTION: ${scene.visualStyle}` : "",
    `AVAILABLE IMAGE MODELS:\n${menu}`,
    `CURRENT CAST:\n${scene.subjects.map((person) => `${person.name}${person.focus ? " (focus)" : ""}: ${person.appearance}`).join("\n") || "No people"}`,
    scene.visualDetails?.length ? `NAMED NPCS AND PLACES VISIBLE IN THE STORY (appearance only):\n${scene.visualDetails.join("\n")}` : "",
    `STORY (newest last):\n${scene.messages.map((message) => `${message.target ? "TARGET " : ""}${message.name}: ${message.text}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
};

export const parseImageReply = (raw: string, route: Route): ImageReply => {
  const cleaned = raw.replace(/^\s*(?:<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>)\s*/i, "").replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The image director returned no JSON object.");
  let value: unknown;
  try { value = JSON.parse(cleaned.slice(start, end + 1)); } catch { throw new Error("The image director returned invalid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The image director returned no object.");
  const record = value as Record<string, unknown>;
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
  if (prompt.length < 10) throw new Error("The image director returned an empty visual prompt.");
  return {
    caption: typeof record.caption === "string" ? record.caption.slice(0, 200) : prompt.slice(0, 120),
    checkpoint: typeof record.checkpoint === "string" && route.allowed.includes(record.checkpoint) ? record.checkpoint : route.checkpoint.file,
    reason: typeof record.reason === "string" ? record.reason : "",
    visible: Array.isArray(record.visible) ? record.visible.filter((name): name is string => typeof name === "string") : [],
    aspect: typeof record.aspect === "string" && ASPECTS.includes(record.aspect as Aspect) ? record.aspect as Aspect : null,
    shot: typeof record.shot === "string" && SHOTS.includes(record.shot as Shot) ? record.shot as Shot : null,
    prompt,
    negative: typeof record.negative === "string" ? record.negative : "",
  };
};

export const assembleImagePrompt = (route: Route, reply: ImageReply | null, text: string): { positive: string; negative: string } => {
  const prompt = reply?.prompt ?? text;
  const positive = [route.checkpoint.qualityBlock, ...route.positive, prompt, route.shot === "close" ? "close-up" : route.shot.replaceAll("_", " ")].filter(Boolean).join(", ");
  const negative = [route.checkpoint.negativeBlock, ...route.negative, reply?.negative].filter(Boolean).join(", ");
  return { positive, negative };
};
