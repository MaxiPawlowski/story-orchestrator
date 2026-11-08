import type { ComfyGraph } from "../../image/graph";

export interface DepthModel { id: string; ckpt: string; resolution: number; version: number }

export const DEPTH_MODEL: DepthModel = Object.freeze({ id: "dav2-vitl", ckpt: "depth_anything_v2_vitl.pth", resolution: 512, version: 1 });
export const DEPTH_CKPTS: readonly string[] = Object.freeze(["depth_anything_v2_vits.pth", "depth_anything_v2_vitb.pth", "depth_anything_v2_vitl.pth"]);

export function depthGraph(reference: string, model: DepthModel = DEPTH_MODEL): ComfyGraph {
  if (!reference.startsWith("story-orchestrator/")) throw new Error("A depth render needs an owned reference image.");
  if (!DEPTH_CKPTS.includes(model.ckpt)) throw new Error(`The depth model ${model.ckpt} is not an approved file.`);
  return {
    1: { class_type: "LoadImage", inputs: { image: reference }, _meta: { title: "Background" } },
    2: { class_type: "DepthAnythingV2Preprocessor", inputs: { image: ["1", 0], ckpt_name: model.ckpt, resolution: model.resolution }, _meta: { title: "Depth" } },
    3: { class_type: "PreviewImage", inputs: { images: ["2", 0] } },
  };
}
