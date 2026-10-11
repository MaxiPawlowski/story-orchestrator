export interface ModelRef { name: string }
export interface EditParameters {
    models: { diffusion: ModelRef; encoder: ModelRef; vae: ModelRef }; steps: number; seed: number; reference: string; instruction: string;
    cutout?: { node: string; model: string }; resolution?: number; skeleton?: string; secondReference?: boolean;
}

export const editInstruction = (kind: 'pose' | 'expression', value: string): string => kind === 'pose'
    ? 'Same character as image 1. Preserve face, hair, outfit, proportions and art style. '
        + `Take the body pose shown in image 2 when present: ${value}. Single full character, plain white background.`
    : `Same image, same character, same pose, head angle, framing, lighting and colours. Change only ${value}. Everything else stays identical. Plain white background.`;

export function editGraph(params: EditParameters): Record<string, unknown> {
    const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });
    return {
        '1': node('LoadImage', { image: params.reference }),
        '2': node('UNETLoader', { unet_name: params.models.diffusion.name, weight_dtype: 'default' }),
        '3': node('QwenImage21Cache', { model: ['2', 0], device: 'auto', dtype: 'default' }),
        '4': node('CLIPLoader', { clip_name: params.models.encoder.name, type: 'qwen_image', device: 'default' }),
        '5': node('VAELoader', { vae_name: params.models.vae.name }),
        '6': node('TextEncodeQwenImage21', { clip: ['4', 0], prompt: params.instruction, negative_prompt: 'text, watermark, different character, deformed face',
            vae: ['5', 0], resolution: params.resolution ?? 1024, 'images.image_1': ['1', 0],
            ...(params.skeleton ? { 'images.image_2': ['12', 0] } : params.secondReference ? { 'images.image_2': ['1', 0] } : {}) }),
        '7': node('KSampler', { model: ['3', 0], seed: params.seed, steps: params.steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple',
            positive: ['6', 0], negative: ['6', 1], latent_image: ['6', 2], denoise: 1 }),
        '8': node('VAEDecode', { samples: ['7', 0], vae: ['5', 0] }),
        '9': node('SaveImage', { filename_prefix: 'so-sprite', images: ['8', 0] }),
        ...(params.skeleton ? { '12': node('LoadImage', { image: params.skeleton }) } : {}),
        ...(params.cutout ? {
            '9': node('SplitImageWithAlpha', { image: ['8', 0] }),
            '10': node(params.cutout.node, { image: ['9', 0], model: params.cutout.model, background: 'Alpha', sensitivity: 1,
                mask_blur: 0, mask_offset: 0, invert_output: false, refine_foreground: false, background_color: '#ffffff' }),
            '11': node('SaveImage', { filename_prefix: 'so-sprite-base', images: ['10', 0] }),
        } : {}),
    };
}
