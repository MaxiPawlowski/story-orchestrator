import { samplerNodes, TURBO_SIGMAS } from './poseS0Graph.mts';

export type ArmId = 'b' | 'q21' | 'turbo' | 'q2512';
export interface ArmSpec {
    id: ArmId; recipe: string; family: '21' | '2512'; steps: number; sigmas?: number[]; cfg: number; shift?: number;
    models: { diffusion: { name: string }; encoder: { name: string }; vae: { name: string } };
}

const QWEN21 = { encoder: { name: 'qwen3vl_8b_int8_convrot.safetensors' }, vae: { name: 'qwen_image_2.1_vae_bf16.safetensors' } };

export const ARMS: Record<ArmId, ArmSpec> = {
    b: { id: 'b', recipe: 's0-b-qwen21-int8-25', family: '21', steps: 25, cfg: 1, models: { diffusion: { name: 'qwen_image_2.1_int8_convrot.safetensors' }, ...QWEN21 } },
    q21: { id: 'q21', recipe: 's0-q21-qwen21-int8-40', family: '21', steps: 40, cfg: 1, models: { diffusion: { name: 'qwen_image_2.1_int8_convrot.safetensors' }, ...QWEN21 } },
    turbo: { id: 'turbo', recipe: 's0-turbo-qwen21t-int8-8', family: '21', steps: TURBO_SIGMAS.length - 1, sigmas: TURBO_SIGMAS, cfg: 1,
        models: { diffusion: { name: 'qwen_image_2.1_turbo_int8_convrot.safetensors' }, ...QWEN21 } },
    q2512: { id: 'q2512', recipe: 's0-q2512-fp8-40', family: '2512', steps: 40, cfg: 4, shift: 3.1,
        models: { diffusion: { name: 'qwen_image_2512_fp8_e4m3fn.safetensors' }, encoder: { name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors' }, vae: { name: 'qwen_image_vae.safetensors' } } },
};

export const armOf = (id: string | undefined): ArmSpec => {
    const arm = ARMS[(id ?? 'b') as ArmId];
    if (!arm) throw new Error(`unknown arm ${id}; one of ${Object.keys(ARMS).join(', ')}`);
    return arm;
};

export const rgbaPrompt = (prompt: string): string => `This is an RGBA image with transparency. ${prompt} The image has alpha channel and the background is transparent.`;

const NEGATIVE = 'text, watermark, deformed face, cropped, extra limbs, multiple characters';
const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });

export interface T2iParameters { arm: ArmSpec; prompt: string; seed: number; width: number; height: number; cutout?: { node: string; model: string }; prefix: string; run?: string }

export function t2iGraph(params: T2iParameters): Record<string, unknown> {
    const { arm } = params;
    const decode = { '8': node('VAEDecode', { samples: ['7', 0], vae: ['4', 0] }) };
    const tail = params.cutout
        ? { '9': node('SplitImageWithAlpha', { image: ['8', 0] }),
            '10': node(params.cutout.node, { image: ['9', 0], model: params.cutout.model, background: 'Alpha', sensitivity: 1, mask_blur: 0, mask_offset: 0, invert_output: false, refine_foreground: false, background_color: '#ffffff' }),
            '11': node('SaveImage', { filename_prefix: params.prefix, images: ['10', 0] }) }
        : { '11': node('SaveImage', { filename_prefix: params.prefix, images: ['8', 0] }) };
    if (arm.family === '21') {
        return {
            '1': node('UNETLoader', { unet_name: arm.models.diffusion.name, weight_dtype: 'default' }),
            '2': node('QwenImage21Cache', { model: ['1', 0], device: 'auto', dtype: 'default' }),
            '3': node('CLIPLoader', { clip_name: arm.models.encoder.name, type: 'qwen_image', device: 'default' }),
            '4': node('VAELoader', { vae_name: arm.models.vae.name }),
            '5': node('TextEncodeQwenImage21', { clip: ['3', 0], prompt: params.prompt, negative_prompt: NEGATIVE, vae: ['4', 0], resolution: 1024 }),
            '6': node('EmptySD3LatentImage', { width: params.width, height: params.height, batch_size: 1 }),
            ...samplerNodes({ sigmas: arm.sigmas, steps: arm.steps, seed: params.seed, model: ['2', 0], positive: ['5', 0], negative: ['5', 1], latent: ['6', 0] }),
            ...decode, ...tail,
        };
    }
    return {
        '1': node('UNETLoader', { unet_name: arm.models.diffusion.name, weight_dtype: 'default' }),
        '2': node('ModelSamplingAuraFlow', { model: ['1', 0], shift: arm.shift ?? 3.1 }),
        '3': node('CLIPLoader', { clip_name: arm.models.encoder.name, type: 'qwen_image', device: 'default' }),
        '4': node('VAELoader', { vae_name: arm.models.vae.name }),
        '5': node('CLIPTextEncode', { text: params.prompt, clip: ['3', 0] }),
        '12': node('CLIPTextEncode', { text: NEGATIVE, clip: ['3', 0] }),
        '6': node('EmptySD3LatentImage', { width: params.width, height: params.height, batch_size: 1 }),
        '7': node('KSampler', { model: ['2', 0], seed: params.seed, steps: arm.steps, cfg: arm.cfg, sampler_name: 'euler', scheduler: 'simple', positive: ['5', 0], negative: ['12', 0], latent_image: ['6', 0], denoise: 1 }),
        ...decode, ...tail,
    };
}

export const WHO: Record<string, string> = {
    m1: 'a young woman adventurer with short red hair and green eyes, green tunic with a brown belt, brown leather boots',
    m2: 'a tall man knight with short black hair, silver plate armour and a blue cape, steel boots',
    m3: 'a small girl mage with long silver hair and violet eyes, purple robe with gold trim, pointed hat',
};

export interface PackView { id: string; text: string; edit: string; width: number; height: number; head: boolean }
export const PACK_VIEWS: PackView[] = [
    { id: 'neutral_full', head: false, width: 768, height: 1152, text: 'standing relaxed, front view, whole body visible from head to feet', edit: 'standing relaxed, front view, whole body visible from head to feet, neutral expression' },
    { id: 'bust_front', head: true, width: 1024, height: 1024, text: 'close bust shot, head and shoulders, neutral expression, looking at the viewer, front view', edit: 'a close bust shot, head and shoulders only, neutral expression, looking at the viewer, front view' },
    { id: 'three_quarter', head: false, width: 768, height: 1152, text: 'standing relaxed, three-quarter view turned slightly to the left, whole body visible from head to feet', edit: 'standing relaxed in a three-quarter view turned slightly to the left, whole body visible from head to feet' },
    { id: 'side', head: false, width: 768, height: 1152, text: 'standing relaxed, side view in profile facing left, whole body visible from head to feet', edit: 'standing relaxed in a side view, profile facing left, whole body visible from head to feet' },
    { id: 'expr_happy', head: true, width: 1024, height: 1024, text: 'close head shot, happy smiling expression, front view', edit: 'a close head shot, front view, with a happy smiling expression' },
    { id: 'expr_angry', head: true, width: 1024, height: 1024, text: 'close head shot, angry expression with furrowed brows, front view', edit: 'a close head shot, front view, with an angry expression and furrowed brows' },
];

export const packPrompt = (member: string, view: PackView): string =>
    `Anime character ${view.head ? 'portrait' : 'sprite'}, ${WHO[member]}, ${view.text}, plain white background`;
