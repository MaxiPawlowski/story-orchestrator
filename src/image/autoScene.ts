import { publicLook } from "@engine/cardFields";
import type { ComfyDiscovery } from "@services/stHost/media";
import { qwenImageInput, recipeProblems } from "../sprites/builder/recipes";
import { discoveryProblem } from "../sprites/defaultRecipe";
import type { SpriteSettings } from "../sprites/settings";
import type { SceneFile, VisualScene } from "../sprites/packs/scene";
import { castSceneIdentities, discoveredSceneRecipe, LookPending, sceneRecipe, CAST_TWO_REFERENCE_MISSING,
  type CastSceneIdentity, type CastSceneMember, type SceneRecipe } from "./castScene";
import type { AutomaticRoute } from "./settings";
import type { ImageReply, ImageRequest, ImageScene } from "./prompt";

export type RenderRoute = "sdxl" | "qwen";
export type RouteReason = "references-ready" | "setting-sdxl" | "not-automatic" | "background" | "no-story" | "no-one-visible" | "too-many-visible"
  | "visible-not-in-cast" | "no-reference" | "look-pending" | "media-unavailable" | "recipe-missing" | "models-missing" | "second-input-missing";
export const ROUTE_REASONS: Record<RouteReason, string> = {
  "references-ready": "Every visible character has a prepared current look and the Qwen reference route is installed.",
  "setting-sdxl": "Automatic pictures are set to always use SDXL.",
  "not-automatic": "Only automatic scene pictures choose a route.",
  background: "Backgrounds have no characters to reference.",
  "no-story": "No story is playing in this chat.",
  "no-one-visible": "No story character is visible in this picture.",
  "too-many-visible": "The reference route draws at most two characters.",
  "visible-not-in-cast": "A visible character is not a present story member with a sprite folder.",
  "no-reference": "A visible character has no visual pack and no accepted base and bust.",
  "look-pending": "A visible character's current look is not prepared yet.",
  "media-unavailable": "ComfyUI or the media plugin did not answer.",
  "recipe-missing": "No Qwen edit route is installed or set.",
  "models-missing": "The Qwen edit route names a model or node ComfyUI does not offer.",
  "second-input-missing": CAST_TWO_REFERENCE_MISSING,
};

export interface QwenSubject { name: string; member: CastSceneMember | null; missing?: "visible-not-in-cast" | "no-reference" }
export interface QwenReady { names: string[]; members: CastSceneMember[]; identities: CastSceneIdentity[]; recipe: SceneRecipe; plate: SceneFile | null }
export type QwenReadiness = { ok: true; ready: QwenReady } | { ok: false; reason: RouteReason; detail: string };
export interface RouteChoice { route: RenderRoute; reason: RouteReason; detail: string; setting: AutomaticRoute | null; ready: QwenReady | null }

export const refused = (reason: RouteReason, detail = ROUTE_REASONS[reason]): QwenReadiness => ({ ok: false, reason, detail });

function identitiesFor(members: CastSceneMember[]): CastSceneIdentity[] | QwenReadiness {
  try { return castSceneIdentities(members); } catch (error) {
    return error instanceof LookPending ? refused("look-pending") : refused("no-reference", error instanceof Error ? error.message : ROUTE_REASONS["no-reference"]);
  }
}

export function qwenReadiness(input: { subjects: QwenSubject[]; discovery: ComfyDiscovery | null; sprites: Pick<SpriteSettings, "builders" | "sceneRecipe">;
  visual: VisualScene | null }): QwenReadiness {
  const { subjects, discovery } = input;
  if (!subjects.length) return refused("no-one-visible");
  if (subjects.length > 2) return refused("too-many-visible");
  const missing = subjects.find((subject) => !subject.member);
  if (missing) return refused(missing.missing ?? "no-reference", `${ROUTE_REASONS[missing.missing ?? "no-reference"]} (${missing.name})`);
  const members = subjects.map((subject) => subject.member as CastSceneMember);
  const identities = identitiesFor(members);
  if (!Array.isArray(identities)) return identities;
  if (!discovery) return refused("media-unavailable");
  let recipe: SceneRecipe;
  try { recipe = sceneRecipe(members.map((member) => member.character), input.sprites.builders, input.sprites.sceneRecipe, discoveredSceneRecipe(discovery)); } catch (error) {
    return refused("recipe-missing", [error instanceof Error ? error.message : ROUTE_REASONS["recipe-missing"], discoveryProblem(discovery)].filter(Boolean).join(" "));
  }
  const problems = recipeProblems(discovery, recipe.models);
  if (problems.length) return refused("models-missing", problems.join(" "));
  if (identities.length === 2 && !qwenImageInput(discovery, "image_2")) return refused("second-input-missing");
  const place = input.visual?.place;
  const plate = place?.source === "pack" && place.plate && qwenImageInput(discovery, `image_${identities.length + 1}`) ? place.plate : null;
  return { ok: true, ready: { names: subjects.map((subject) => subject.name), members, identities, recipe, plate } };
}

export function chooseRoute(input: { setting: AutomaticRoute | null; blocked?: RouteReason; readiness: QwenReadiness | null }): RouteChoice {
  const { setting } = input;
  if (input.blocked || !setting) return { route: "sdxl", reason: input.blocked ?? "not-automatic", detail: ROUTE_REASONS[input.blocked ?? "not-automatic"], setting, ready: null };
  if (setting === "sdxl") return { route: "sdxl", reason: "setting-sdxl", detail: ROUTE_REASONS["setting-sdxl"], setting, ready: null };
  const readiness = input.readiness ?? refused("no-story");
  if (readiness.ok) return { route: "qwen", reason: "references-ready", detail: ROUTE_REASONS["references-ready"], setting, ready: readiness.ready };
  if (setting === "qwen") throw new Error(`No picture was drawn: automatic pictures are set to use references only, and ${readiness.detail.charAt(0).toLowerCase()}${readiness.detail.slice(1)}`);
  return { route: "sdxl", reason: readiness.reason, detail: readiness.detail, setting, ready: null };
}

export const visibleNames = (subjects: Array<{ name: string }>, visible: string[] | undefined): string[] => {
  if (!visible?.length) return subjects.map((subject) => subject.name);
  return [...new Set(visible.map((name) => subjects.find((subject) => subject.name.toLowerCase() === name.toLowerCase())?.name ?? name))];
};

export const QWEN_POSE_CLAUSE = "Do not copy the standing pose, framing or side-by-side arrangement of the reference images; "
  + "choose poses, camera angle and composition that fit the action.";

export interface QwenPlace { name: string | null; description?: string; tags?: string[] }

export function qwenInstruction(input: { direction: string; names: string[]; members: CastSceneMember[]; identities: CastSceneIdentity[]; place: QwenPlace | null; plate: boolean }): string {
  const people = input.members.map((member, index) => {
    const look = publicLook(member.fields), layered = input.identities[index]?.layered;
    return `Character ${index + 1} is ${input.names[index] ?? member.character}${look ? `, current look: ${look}` : ""}`
      + (layered?.length ? ` (the reference image predates ${layered.join(", ")}; draw those details as described)` : "") + ".";
  });
  const where = input.place;
  const place = where?.name ? `Setting: ${where.name}${where.description ? `, ${where.description}` : ""}${where.tags?.length ? ` (${where.tags.join(", ")})` : ""}.` : "";
  const direction = input.direction.trim() || "The characters together in the current moment of the story.";
  return [/[.!?]["')]?$/.test(direction) ? direction : `${direction}.`, ...people,
    "Each character's current look above wins over anything else.", place,
    input.plate ? "Use the place reference as the background and copy no people from it." : "", QWEN_POSE_CLAUSE].filter(Boolean).join(" ");
}

export function qwenPrompt(ready: QwenReady, drawn: ImageScene, reply: ImageReply | null, request: Pick<ImageRequest, "text">): string {
  const moment = drawn.messages.find((message) => message.target)?.text.slice(0, 400);
  const direction = reply?.instruction || reply?.caption || [request.text, !reply && moment ? `Moment: ${moment}` : ""].filter(Boolean).join(" ");
  return qwenInstruction({ direction, names: ready.names, members: ready.members, identities: ready.identities, plate: Boolean(ready.plate),
    place: drawn.location ? { name: drawn.location, ...(drawn.placeDetail ? { description: drawn.placeDetail } : {}) } : null });
}

export function qwenOutputSize(width: number, height: number, resolution: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: resolution, height: resolution };
  const ratio = width / height;
  const snap = (value: number) => Math.max(32, Math.round(value / 32) * 32);
  if (resolution <= 0) return { width: snap(width), height: snap(height) };
  return { width: snap(Math.sqrt(resolution * resolution * ratio)), height: snap(Math.sqrt(resolution * resolution / ratio)) };
}

export const illustratedReply = (messages: Array<{ mes: string; is_user?: boolean; is_system?: boolean }>): number | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) if (!messages[index].is_user && !messages[index].is_system && messages[index].mes.trim()) return index;
  return messages.length ? messages.length - 1 : null;
};
