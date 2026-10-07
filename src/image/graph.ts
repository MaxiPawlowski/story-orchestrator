import type { Checkpoint, Family, Size } from "./catalog";

export interface GraphNode { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }
export type ComfyGraph = Record<string, GraphNode>;
export interface GraphInput {
  checkpoint: Checkpoint;
  family: Family;
  loras: Array<{ file: string; weight: number }>;
  positive: string;
  negative: string;
  size: Size;
  seed: number;
  hires: boolean;
  upscaler: string;
}

type Link = [string, number];
export const buildGraph = (input: GraphInput): ComfyGraph => {
  const { checkpoint, size, seed } = input;
  const graph: ComfyGraph = {};
  let nextId = 1;
  const add = (node: GraphNode): string => {
    const id = String(nextId++);
    graph[id] = node;
    return id;
  };
  const loader = add({ class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint.file }, _meta: { title: checkpoint.label } });
  let model: Link = [loader, 0];
  let clip: Link = [loader, 1];
  const vae: Link = [loader, 2];
  for (const lora of input.loras) {
    const id = add({ class_type: "LoraLoader", inputs: { lora_name: lora.file, strength_model: lora.weight, strength_clip: lora.weight, model, clip } });
    model = [id, 0];
    clip = [id, 1];
  }
  const encoded = add({ class_type: "CLIPTextEncode", inputs: { text: input.positive, clip }, _meta: { title: "Positive" } });
  const positive: Link = [encoded, 0];
  const negative: Link = [add({ class_type: "CLIPTextEncode", inputs: { text: input.negative, clip }, _meta: { title: "Negative" } }), 0];
  const latent = add({ class_type: "EmptyLatentImage", inputs: { width: size.width, height: size.height, batch_size: 1 } });
  const { sampler, scheduler, steps, cfg } = checkpoint.defaults;
  const first = add({
    class_type: "KSampler", inputs: { seed, steps, cfg, sampler_name: sampler, scheduler, denoise: 1, model, positive, negative, latent_image: [latent, 0] },
    _meta: { title: "Pass 1" },
  });
  let image: Link = [add({ class_type: "VAEDecode", inputs: { samples: [first, 0], vae } }), 0];
  if (input.hires) {
    const upscaler = add({ class_type: "UpscaleModelLoader", inputs: { model_name: input.upscaler } });
    const upscaled = add({ class_type: "ImageUpscaleWithModel", inputs: { upscale_model: [upscaler, 0], image } });
    const scaled = add({ class_type: "ImageScaleBy", inputs: { upscale_method: "lanczos", scale_by: checkpoint.hires.scale / 4, image: [upscaled, 0] } });
    const pixels = add({ class_type: "VAEEncode", inputs: { pixels: [scaled, 0], vae } });
    const second = add({
      class_type: "KSampler", inputs: {
        seed, steps: checkpoint.hires.steps, cfg, sampler_name: sampler, scheduler,
        denoise: checkpoint.hires.denoise, model, positive, negative, latent_image: [pixels, 0],
      }, _meta: { title: "Hi-res pass" },
    });
    image = [add({ class_type: "VAEDecode", inputs: { samples: [second, 0], vae } }), 0];
  }
  add({ class_type: "PreviewImage", inputs: { images: image } });
  return graph;
};
