import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RunGuard } from "@runtime/runToken";
import { getGlobalSettings } from "@runtime/settingsStore";
import type { PrimitiveValue } from "@engine/index";
import { comfyDiscover } from "@services/stHost/media";
import { spriteCast } from "@services/stHost/sprites";
import { imageChat, imageDelete } from "@services/stHost/image";
import { sourceStillCurrent } from "../sprites/visualHost";
import { visualBridge } from "../sprites/packs/bridgeHost";
import type { VisualScene } from "../sprites/packs/scene";
import { isNarratorMember } from "./cast";
import { CAST_SCENE_RECIPE, packGap } from "./castScene";
import { castMember, currentIdentities, identityRecord, LOOK_CHANGED, renderQwenJob } from "./castSceneHost";
import { qwenReadiness, type QwenReadiness, type QwenSubject } from "./autoScene";
import type { ImageCandidate, ImagePlan } from "./runtime";

type Story = NonNullable<ReturnType<RuntimeManager["getStory"]>>;
export const AUTO_CHANGED = "The story or the reply changed while this picture was drawn, so it was discarded.";
export const AUTO_PACK_CHANGED = "A visual pack or one of its files changed while this picture was drawn, so it was discarded.";

export function qwenSubjects(story: Story, names: string[], values: Record<string, PrimitiveValue>, visual: VisualScene | null): QwenSubject[] {
  const cast = spriteCast(), sources = getGlobalSettings().sprites.visualSources;
  return names.flatMap((name): QwenSubject[] => {
    const roster = story.roster.find((row) => (row.name ?? row.id).toLowerCase() === name.toLowerCase());
    if (roster && isNarratorMember(roster)) return [];
    const installed = roster ? cast.members.find((row) => row.name === (roster.name ?? roster.id)) : undefined;
    if (!roster || !installed) return [{ name, member: null, missing: "visible-not-in-cast" }];
    const member = castMember(story, roster, installed.folder, sources, values, visual);
    if (member) return [{ name, member }];
    const gap = packGap(roster.name ?? roster.id, visual?.subjects.find((row) => row.member === roster.id), story.illustrations?.packs?.identities?.[roster.id]);
    return [{ name, member: null, missing: "no-reference", detail: gap.message }];
  });
}

export async function qwenCheck(story: Story, visual: VisualScene | null, values: Record<string, PrimitiveValue>): Promise<(names: string[]) => QwenReadiness> {
  const discovery = await comfyDiscover().catch(() => null);
  const sprites = getGlobalSettings().sprites;
  return (names) => qwenReadiness({ subjects: qwenSubjects(story, names, values, visual), discovery, sprites, visual });
}

export async function renderAutomaticQwen(manager: Pick<RuntimeManager, "getStory" | "getSnapshot">, plan: ImagePlan, signal: AbortSignal, run: RunGuard,
  seed: number): Promise<ImageCandidate> {
  const story = manager.getStory();
  if (!plan.qwen || !story) throw new Error("The reference route was not prepared for this picture.");
  const { members, identities, plate } = plan.qwen.ready;
  const values = () => manager.getSnapshot().blackboard;
  const guard = () => {
    const now = imageChat();
    if (!run.stillOwns() || !now || now.id !== plan.chatId || (plan.target !== null && now.messages[plan.target]?.mes !== plan.targetText)
      || members.some((member) => member.source && !sourceStillCurrent(member.source))) throw new Error(AUTO_CHANGED);
    if (currentIdentities(story, members, values()) !== JSON.stringify(identities)) throw new Error(LOOK_CHANGED);
  };
  const packsCurrent = async (current: AbortSignal) => {
    if (plan.visual && !(await visualBridge().stillCurrent(plan.visual, current))) throw new Error(AUTO_PACK_CHANGED);
  };
  let saved: string | null = null;
  try {
    const result = await renderQwenJob({ members, identities, prompt: plan.qwen.prompt, seed, plate, folder: plan.folder, prefix: "director_qwen",
      run, guard, packsCurrent, saved: (path) => { saved = path; } }, signal);
    return { path: result.path, seed, width: result.width, height: result.height, waitedMs: result.waitedMs,
      qwen: { checkpoint: result.diffusion, recipe: CAST_SCENE_RECIPE, recipe_source: result.recipeSource, identities: identityRecord(identities),
        plate: result.plate, aspect: { requested: plan.aspect, drawn: "reference" } } };
  } catch (error) {
    if (saved) await imageDelete(saved).catch(() => null);
    throw error;
  }
}
