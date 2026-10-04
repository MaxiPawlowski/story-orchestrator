import { imageSize, type Aspect, type Checkpoint, type Family, type Lora, type Quality } from "./catalog";

export interface ModelFile { kind: string; name: string }
export interface RenderFacts { modelFiles: ModelFile[]; width: number; height: number; hires: boolean }

export const renderFacts = (input: {
  checkpoint: Checkpoint; loras: Array<{ entry: Lora }>; family: Family; aspect: Aspect; quality: Quality;
}): RenderFacts => {
  const size = imageSize(input.family, input.aspect, null);
  return {
    modelFiles: [
      { kind: "checkpoints", name: input.checkpoint.file },
      ...input.loras.map((lora) => ({ kind: "loras", name: lora.entry.file })),
    ],
    width: size.width, height: size.height, hires: input.quality === "hires",
  };
};

export const renderKey = (facts: RenderFacts): string => {
  const models = facts.modelFiles.map((file) => `${file.kind}:${file.name}`).sort().join("|");
  return `${models}@${facts.width}x${facts.height}${facts.hires ? "+hires" : ""}`;
};
