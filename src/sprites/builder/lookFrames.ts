import type { AnimationFrames } from "../animation";
import type { SpriteBuildRequest } from "./builder";
import type { EditModels } from "./recipes";
import { builderRender, RENDER_PRESETS, type SpriteSettings } from "../settings";

export const LOOK_CONTRACT = 2;
export const LOOK_FRAME_KINDS = ["blink", "talk"] as const;
export type LookFrameKind = typeof LOOK_FRAME_KINDS[number];

export interface LookFrameDeps {
  guard(): void;
  wait(): Promise<void>;
  cached(kind: LookFrameKind): Promise<string | null>;
  render(kind: LookFrameKind): Promise<string>;
}

export async function completeLookFrames(deps: LookFrameDeps): Promise<AnimationFrames> {
  const frames: AnimationFrames = {};
  for (const kind of LOOK_FRAME_KINDS) {
    deps.guard();
    const cached = await deps.cached(kind);
    deps.guard();
    if (cached) { frames[kind] = cached; continue; }
    await deps.wait();
    deps.guard();
    const path = await deps.render(kind);
    deps.guard();
    frames[kind] = path;
  }
  return frames;
}

export interface LookBuild {
  folder: string;
  set: string;
  label: string;
  key: string;
  story: string;
  member: string;
  models: EditModels;
  config: SpriteSettings["builders"][string];
}

const seedOf = (key: string) => Number.parseInt(key.slice(0, 8), 16);

export const lookStillRequest = (build: LookBuild, look: string, reference: { path: string; sha256: string }): SpriteBuildRequest => ({
  character: build.folder, set: build.set, label: build.label, kind: "look", value: look, reference: reference.path, referenceHash: reference.sha256,
  box: build.config.box, models: build.models, seed: seedOf(build.key), ...builderRender(build.config), story: build.story, member: build.member,
});

export const lookFrameRequest = (build: LookBuild, kind: LookFrameKind, still: { path: string; sha256: string }): SpriteBuildRequest => ({
  character: build.folder, set: build.set, label: build.label, kind, value: build.label, reference: still.path, referenceHash: still.sha256,
  box: build.config.box, models: build.models, seed: (seedOf(build.key) + (kind === "blink" ? 1 : 2)) >>> 0, ...builderRender(build.config),
  story: build.story, member: build.member,
});

export const lookKeyInput = (input: { story: string; member: string; fields: Record<string, string>; version: string; models: EditModels;
  recipe: unknown; config: SpriteSettings["builders"][string] }): string => JSON.stringify({ contract: LOOK_CONTRACT, story: input.story, member: input.member,
  fields: Object.entries(input.fields).sort(([a], [b]) => a.localeCompare(b)), version: input.version, models: input.models,
  recipe: input.recipe, box: input.config.box, steps: input.config.steps,
  ...(input.config.resolution !== undefined && input.config.resolution !== RENDER_PRESETS.standard.resolution ? { resolution: input.config.resolution } : {}) });
