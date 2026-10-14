export interface ModelRef { name: string }
export interface EditParameters {
    models: { diffusion: ModelRef; encoder: ModelRef; vae: ModelRef }; steps: number; seed: number; reference: string; instruction: string;
    cutout?: { node: string; model: string }; resolution?: number; skeleton?: string; secondReference?: boolean;
    sigmas?: number[]; references?: string[]; latent?: { width: number; height: number }; prefix?: string; negative?: string;
}

export const referenceRoles = (first: number, last: number): string => ` Image 1 is the picture to edit. Image${first === last ? ` ${first} is` : `s ${first} to ${last} are`} identity reference${first === last ? '' : 's'} only: the same character, never a layout to copy. Do not copy their pose, crop or expression and do not tile or repeat them. Output one single image framed like image 1.`;

const editText = (kind: 'pose' | 'expression' | 'view' | 'look' | 'scene', value: string): string => kind === 'pose'
    ? 'Same character as image 1. Preserve face, hair, outfit, proportions and art style. '
        + `Take the body pose shown in image 2 when present: ${value}. Single full character, plain white background.`
    : kind === 'view'
        ? `Same character as image 1. Preserve face, hair, outfit, proportions and art style. Show the character as: ${value}. Single character, plain white background.`
        : kind === 'look'
            ? `Same character as image 1, same pose, framing and art style. Change only the clothing: ${value}. Face, hair and body stay identical. Plain white background.`
            : kind === 'scene'
                ? `The references show different characters, each keeping its own face, hair, outfit and art style. ${value}`
                : `Same image, same character, same pose, head angle, framing, lighting and colours. Change only ${value}. Everything else stays identical. Plain white background.`;

export const editInstruction = (kind: 'pose' | 'expression' | 'view' | 'look' | 'scene', value: string, identityRefs?: [number, number]): string =>
    editText(kind, value) + (identityRefs && identityRefs[0] <= identityRefs[1] ? referenceRoles(identityRefs[0], identityRefs[1]) : '');

export const TURBO_SIGMAS = [1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0.0];

const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });

export function samplerNodes(params: { sigmas?: number[]; steps: number; seed: number; model: [string, number]; positive: [string, number]; negative: [string, number]; latent: [string, number] }): Record<string, unknown> {
    if (!params.sigmas) {
        return { '7': node('KSampler', { model: params.model, seed: params.seed, steps: params.steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple',
            positive: params.positive, negative: params.negative, latent_image: params.latent, denoise: 1 }) };
    }
    return {
        '30': node('KSamplerSelect', { sampler_name: 'euler' }),
        '31': node('ManualSigmas', { sigmas: params.sigmas.join(', ') }),
        '7': node('SamplerCustom', { model: params.model, add_noise: true, noise_seed: params.seed, cfg: 1, positive: params.positive, negative: params.negative,
            sampler: ['30', 0], sigmas: ['31', 0], latent_image: params.latent }),
    };
}

export function editGraph(params: EditParameters): Record<string, unknown> {
    const extra = params.references ?? [];
    const firstExtra = params.skeleton || params.secondReference ? 3 : 2;
    const extraInputs: Record<string, unknown> = {};
    const extraNodes: Record<string, unknown> = {};
    extra.forEach((name, at) => {
        extraNodes[String(20 + at)] = node('LoadImage', { image: name });
        extraInputs[`images.image_${firstExtra + at}`] = [String(20 + at), 0];
    });
    const latent = params.latent ? [String(40), 0] as [string, number] : ['6', 2] as [string, number];
    return {
        '1': node('LoadImage', { image: params.reference }),
        '2': node('UNETLoader', { unet_name: params.models.diffusion.name, weight_dtype: 'default' }),
        '3': node('QwenImage21Cache', { model: ['2', 0], device: 'auto', dtype: 'default' }),
        '4': node('CLIPLoader', { clip_name: params.models.encoder.name, type: 'qwen_image', device: 'default' }),
        '5': node('VAELoader', { vae_name: params.models.vae.name }),
        '6': node('TextEncodeQwenImage21', { clip: ['4', 0], prompt: params.instruction, negative_prompt: params.negative ?? 'text, watermark, different character, deformed face',
            vae: ['5', 0], resolution: params.resolution ?? 1024, 'images.image_1': ['1', 0],
            ...(params.skeleton ? { 'images.image_2': ['12', 0] } : params.secondReference ? { 'images.image_2': ['1', 0] } : {}), ...extraInputs }),
        ...samplerNodes({ sigmas: params.sigmas, steps: params.steps, seed: params.seed, model: ['3', 0], positive: ['6', 0], negative: ['6', 1], latent }),
        '8': node('VAEDecode', { samples: ['7', 0], vae: ['5', 0] }),
        '9': node('SaveImage', { filename_prefix: params.prefix ?? 'so-sprite', images: ['8', 0] }),
        ...(params.skeleton ? { '12': node('LoadImage', { image: params.skeleton }) } : {}),
        ...extraNodes,
        ...(params.latent ? { '40': node('EmptySD3LatentImage', { width: params.latent.width, height: params.latent.height, batch_size: 1 }) } : {}),
        ...(params.cutout ? {
            '9': node('SplitImageWithAlpha', { image: ['8', 0] }),
            '10': node(params.cutout.node, { image: ['9', 0], model: params.cutout.model, background: 'Alpha', sensitivity: 1,
                mask_blur: 0, mask_offset: 0, invert_output: false, refine_foreground: false, background_color: '#ffffff' }),
            '11': node('SaveImage', { filename_prefix: params.prefix ? `${params.prefix}-cut` : 'so-sprite-base', images: ['10', 0] }),
        } : {}),
    };
}
