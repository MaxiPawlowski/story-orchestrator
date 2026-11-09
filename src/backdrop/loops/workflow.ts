export const LOOP_MODEL = Object.freeze({
  id: "wan2.2-ti2v-5b",
  diffusion: "wan2.2_ti2v_5B_fp16.safetensors",
  encoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  vae: "wan2.2_vae.safetensors",
});

export const LOOP_PROMPT_VERSION = 2;
export const LOOP_RECIPE_VERSION = 3;

export interface LoopShape { width: number; height: number; frames: number; fps: number; steps: number; cfg: number; shift: number; crf: number; settle: number; webp?: number }

export const LOOP_TIERS = ["off", "cinemagraph", "lite", "full"] as const;
export type LoopTier = (typeof LOOP_TIERS)[number];
export type VideoTier = Extract<LoopTier, "lite" | "full">;

export const LOOP_ANCHOR_FRAMES = 4;

export const LOOP_SHAPES: Readonly<Record<VideoTier, Readonly<LoopShape>>> = Object.freeze({
  full: Object.freeze({ width: 896, height: 512, frames: 113, fps: 24, steps: 20, cfg: 5, shift: 8, crf: 23, settle: 8 }),
  lite: Object.freeze({ width: 672, height: 384, frames: 29, fps: 12, steps: 16, cfg: 5, shift: 8, crf: 24, settle: 4, webp: 90 }),
});

export const LOOP_SHAPE: Readonly<LoopShape> = LOOP_SHAPES.full;

export function fitShape(shape: Readonly<LoopShape>, width: number, height: number): LoopShape {
  if (!(width > 0 && height > 0)) return { ...shape };
  const pixels = shape.width * shape.height;
  const aspect = Math.min(3, Math.max(1 / 3, width / height));
  let best = { width: shape.width, height: shape.height, error: Infinity, spread: Infinity };
  for (let w = 256; w <= 2048; w += 32) {
    for (let h = 256; h <= 2048; h += 32) {
      const share = (w * h) / pixels;
      if (share < 0.7 || share > 1.3) continue;
      const error = Math.round(Math.abs(Math.log(w / h / aspect)) * 2000) / 2000;
      const spread = Math.abs(Math.log(share));
      if (error < best.error || (error === best.error && spread < best.spread)) best = { width: w, height: h, error, spread };
    }
  }
  return { ...shape, width: best.width, height: best.height };
}

export function centerCrop(width: number, height: number, targetWidth: number, targetHeight: number): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(targetWidth / width, targetHeight / height);
  const cropWidth = targetWidth / scale, cropHeight = targetHeight / scale;
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

export const LOOP_NEGATIVE = "camera movement, zoom, pan, camera shake, scene change, cut, morphing, new objects appearing, objects disappearing, "
  + "changing shapes, changing colors, people, text, watermark, subtitles, blurry, low quality, distorted, deformed, flicker, overexposed, jpeg artifacts";

export const LOOP_NODES: readonly string[] = Object.freeze(["UNETLoader", "CLIPLoader", "VAELoader", "ModelSamplingSD3", "CLIPTextEncode", "LoadImage",
  "Wan22ImageToVideoLatent", "RepeatImageBatch", "VAEEncode", "LatentCut", "ReplaceVideoLatentFrames", "EmptyImage", "ImageBatch", "ImageToMask",
  "SetLatentNoiseMask", "KSampler", "VAEDecode", "ImageFromBatch", "ImageBlend", "ColorTransfer", "CreateVideo", "SaveVideo", "SaveAnimatedWEBP"]);

export const loopPrefix = (key: string): string => `so_loop_${key.replace(/[^a-z0-9]/gi, "").slice(0, 40).toLowerCase()}`;

export const loopFrames = (shape: LoopShape = LOOP_SHAPE): number => shape.frames - LOOP_ANCHOR_FRAMES;

export const loopSeconds = (shape: LoopShape = LOOP_SHAPE): number => loopFrames(shape) / shape.fps;

export const loopModelFiles = (): Array<{ kind: string; name: string }> => [
  { kind: "diffusionModels", name: LOOP_MODEL.diffusion },
  { kind: "textEncoders", name: LOOP_MODEL.encoder },
  { kind: "vaes", name: LOOP_MODEL.vae },
];

type Node = { class_type: string; inputs: Record<string, unknown> };

export interface LoopGraphInput { image: string; prompt: string; key: string; seed: number; shape?: LoopShape; negative?: string }

export function buildLoopGraph({ image, prompt, key, seed, shape = LOOP_SHAPE, negative = LOOP_NEGATIVE }: LoopGraphInput): Record<string, Node> {
  if (shape.frames % 4 !== 1 || shape.frames < 4 * LOOP_ANCHOR_FRAMES + 1) throw new Error("Wan wants 4n+1 frames, at least 17.");
  if (shape.settle < 1 || shape.settle * 2 > loopFrames(shape)) throw new Error("The settle must be at least one frame and at most half the loop.");
  const latentFrames = (shape.frames - 1) / 4 + 1;
  const solid = (batch: number, color: number): Node => ({ class_type: "EmptyImage", inputs: { width: 8, height: 8, batch_size: batch, color } });
  const graph: Record<string, Node> = {
    model: { class_type: "UNETLoader", inputs: { unet_name: LOOP_MODEL.diffusion, weight_dtype: "default" } },
    clip: { class_type: "CLIPLoader", inputs: { clip_name: LOOP_MODEL.encoder, type: "wan", device: "default" } },
    vae: { class_type: "VAELoader", inputs: { vae_name: LOOP_MODEL.vae } },
    sampling: { class_type: "ModelSamplingSD3", inputs: { model: ["model", 0], shift: shape.shift } },
    positive: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: prompt } },
    negative: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: negative } },
    still: { class_type: "LoadImage", inputs: { image } },
    latent: { class_type: "Wan22ImageToVideoLatent", inputs: { vae: ["vae", 0], width: shape.width, height: shape.height, length: shape.frames, batch_size: 1, start_image: ["still", 0] } },
    held: { class_type: "RepeatImageBatch", inputs: { image: ["still", 0], amount: LOOP_ANCHOR_FRAMES + 1 } },
    held_latent: { class_type: "VAEEncode", inputs: { pixels: ["held", 0], vae: ["vae", 0] } },
    end_latent: { class_type: "LatentCut", inputs: { samples: ["held_latent", 0], dim: "t", index: 1, amount: 1 } },
    anchored: { class_type: "ReplaceVideoLatentFrames", inputs: { destination: ["latent", 0], source: ["end_latent", 0], index: latentFrames - 1 } },
    keep_first: solid(1, 0),
    free: solid(latentFrames - 2, 0xffffff),
    keep_last: solid(1, 0),
    mask_head: { class_type: "ImageBatch", inputs: { image1: ["keep_first", 0], image2: ["free", 0] } },
    mask_all: { class_type: "ImageBatch", inputs: { image1: ["mask_head", 0], image2: ["keep_last", 0] } },
    mask: { class_type: "ImageToMask", inputs: { image: ["mask_all", 0], channel: "red" } },
    masked: { class_type: "SetLatentNoiseMask", inputs: { samples: ["anchored", 0], mask: ["mask", 0] } },
    sample: { class_type: "KSampler", inputs: { model: ["sampling", 0], seed, steps: shape.steps, cfg: shape.cfg, sampler_name: "uni_pc", scheduler: "simple",
      positive: ["positive", 0], negative: ["negative", 0], latent_image: ["masked", 0], denoise: 1 } },
    frames: { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["vae", 0] } },
    first: { class_type: "ImageFromBatch", inputs: { image: ["frames", 0], batch_index: 0, length: 1 } },
    loop: { class_type: "ImageFromBatch", inputs: { image: ["frames", 0], batch_index: 0, length: loopFrames(shape) - shape.settle } },
    graded: { class_type: "ColorTransfer", inputs: { image_target: [`settled${shape.settle - 1}`, 0], image_ref: ["still", 0], method: "reinhard_lab", source_stats: "uniform", strength: 1 } },
    video: { class_type: "CreateVideo", inputs: { images: ["graded", 0], fps: shape.fps, bit_depth: 8, color_space: "sRGB" } },
    save: { class_type: "SaveVideo", inputs: { video: ["video", 0], filename_prefix: loopPrefix(key), format: "mp4", "format.codec": "h264",
      "format.codec.encoding": "re-encode", "format.codec.encoding.crf": shape.crf } },
  };
  let joined: [string, number] = ["loop", 0];
  for (let index = 0; index < shape.settle; index += 1) {
    graph[`tail${index}`] = { class_type: "ImageFromBatch", inputs: { image: ["frames", 0], batch_index: loopFrames(shape) - shape.settle + index, length: 1 } };
    graph[`toward${index}`] = { class_type: "ImageBlend", inputs: { image1: [`tail${index}`, 0], image2: ["first", 0],
      blend_factor: Math.round(((index + 1) / (shape.settle + 1)) * 1000) / 1000, blend_mode: "normal" } };
    graph[`settled${index}`] = { class_type: "ImageBatch", inputs: { image1: joined, image2: [`toward${index}`, 0] } };
    joined = [`settled${index}`, 0];
  }
  if (shape.webp) {
    graph.still_loop = { class_type: "SaveAnimatedWEBP",
      inputs: { images: ["graded", 0], filename_prefix: loopPrefix(key), fps: shape.fps, lossless: false, quality: shape.webp, method: "slowest" } };
  }
  return graph;
}
