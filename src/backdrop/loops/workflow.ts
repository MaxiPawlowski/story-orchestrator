export const LOOP_MODEL = Object.freeze({
  id: "wan2.2-ti2v-5b",
  diffusion: "wan2.2_ti2v_5B_fp16.safetensors",
  encoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  vae: "wan2.2_vae.safetensors",
});

export const LOOP_PROMPT_VERSION = 1;

export interface LoopShape { width: number; height: number; frames: number; fps: number; blend: number; steps: number; cfg: number; shift: number; crf: number }

export const LOOP_SHAPE: Readonly<LoopShape> = Object.freeze({ width: 960, height: 544, frames: 113, fps: 24, blend: 16, steps: 16, cfg: 5, shift: 8, crf: 30 });

export const LOOP_NEGATIVE = "camera movement, zoom, pan, camera shake, scene change, cut, people walking, new objects appearing, text, watermark, "
  + "subtitles, blurry, low quality, distorted, deformed, flicker, overexposed, jpeg artifacts, static, frozen";

export const LOOP_NODES: readonly string[] = Object.freeze(["UNETLoader", "CLIPLoader", "VAELoader", "ModelSamplingSD3", "CLIPTextEncode", "LoadImage",
  "Wan22ImageToVideoLatent", "KSampler", "VAEDecode", "ImageFromBatch", "ImageBlend", "ImageBatch", "SaveWEBM"]);

export const loopPrefix = (key: string): string => `so_loop_${key.replace(/[^a-z0-9]/gi, "").slice(0, 40).toLowerCase()}`;

export const loopSeconds = (shape: LoopShape = LOOP_SHAPE): number => (shape.frames - shape.blend) / shape.fps;

export const loopModelFiles = (): Array<{ kind: string; name: string }> => [
  { kind: "diffusionModels", name: LOOP_MODEL.diffusion },
  { kind: "textEncoders", name: LOOP_MODEL.encoder },
  { kind: "vaes", name: LOOP_MODEL.vae },
];

type Link = [string, number];
type Node = { class_type: string; inputs: Record<string, unknown> };

export interface LoopGraphInput { image: string; prompt: string; key: string; seed: number; shape?: LoopShape; negative?: string }

export function buildLoopGraph({ image, prompt, key, seed, shape = LOOP_SHAPE, negative = LOOP_NEGATIVE }: LoopGraphInput): Record<string, Node> {
  if (shape.frames % 4 !== 1) throw new Error("Wan wants 4n+1 frames.");
  if (shape.blend < 1 || shape.blend * 2 >= shape.frames) throw new Error("The loop blend must be shorter than half the clip.");
  const graph: Record<string, Node> = {
    model: { class_type: "UNETLoader", inputs: { unet_name: LOOP_MODEL.diffusion, weight_dtype: "default" } },
    clip: { class_type: "CLIPLoader", inputs: { clip_name: LOOP_MODEL.encoder, type: "wan", device: "default" } },
    vae: { class_type: "VAELoader", inputs: { vae_name: LOOP_MODEL.vae } },
    sampling: { class_type: "ModelSamplingSD3", inputs: { model: ["model", 0], shift: shape.shift } },
    positive: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: prompt } },
    negative: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: negative } },
    still: { class_type: "LoadImage", inputs: { image } },
    latent: { class_type: "Wan22ImageToVideoLatent", inputs: { vae: ["vae", 0], width: shape.width, height: shape.height, length: shape.frames, batch_size: 1, start_image: ["still", 0] } },
    sample: { class_type: "KSampler", inputs: { model: ["sampling", 0], seed, steps: shape.steps, cfg: shape.cfg, sampler_name: "uni_pc", scheduler: "simple",
      positive: ["positive", 0], negative: ["negative", 0], latent_image: ["latent", 0], denoise: 1 } },
    frames: { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["vae", 0] } },
    middle: { class_type: "ImageFromBatch", inputs: { image: ["frames", 0], batch_index: shape.blend, length: shape.frames - 2 * shape.blend } },
  };
  let joined: Link = ["middle", 0];
  for (let index = 0; index < shape.blend; index += 1) {
    graph[`tail${index}`] = { class_type: "ImageFromBatch", inputs: { image: ["frames", 0], batch_index: shape.frames - shape.blend + index, length: 1 } };
    graph[`head${index}`] = { class_type: "ImageFromBatch", inputs: { image: ["frames", 0], batch_index: index, length: 1 } };
    graph[`blend${index}`] = { class_type: "ImageBlend", inputs: { image1: [`tail${index}`, 0], image2: [`head${index}`, 0],
      blend_factor: Math.round(((index + 1) / (shape.blend + 1)) * 1000) / 1000, blend_mode: "normal" } };
    graph[`join${index}`] = { class_type: "ImageBatch", inputs: { image1: joined, image2: [`blend${index}`, 0] } };
    joined = [`join${index}`, 0];
  }
  graph.save = { class_type: "SaveWEBM", inputs: { images: joined, filename_prefix: loopPrefix(key), codec: "vp9", fps: shape.fps, crf: shape.crf } };
  return graph;
}
