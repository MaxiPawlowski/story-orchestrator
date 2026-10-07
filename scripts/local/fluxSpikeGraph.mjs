export function fluxSpikeGraph({ arm, model, components, positive, size, seed }) {
    if (!['gguf', 'nunchaku'].includes(arm)) throw new Error('Unknown FLUX spike arm.');
    const node = (class_type, inputs) => ({ class_type, inputs });
    return {
        '1': arm === 'gguf' ? node('UnetLoaderGGUF', { unet_name: model })
            : node('NunchakuFluxDiTLoader', { model_path: model, cache_threshold: 0, attention: 'flash-attention2', cpu_offload: 'disable', device_id: 0, data_type: 'bfloat16' }),
        '2': node('DualCLIPLoader', { clip_name1: components.t5, clip_name2: components.clip, type: 'flux', device: 'default' }),
        '3': node('VAELoader', { vae_name: components.vae }),
        '4': node('CLIPTextEncode', { text: positive, clip: ['2', 0] }),
        '5': node('FluxGuidance', { guidance: 3.5, conditioning: ['4', 0] }),
        '6': node('ConditioningZeroOut', { conditioning: ['4', 0] }),
        '7': node('EmptySD3LatentImage', { ...size, batch_size: 1 }),
        '8': node('KSampler', { seed, steps: 25, cfg: 1, sampler_name: 'euler', scheduler: 'beta', denoise: 1,
            model: ['1', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0] }),
        '9': node('VAEDecode', { samples: ['8', 0], vae: ['3', 0] }),
        '10': node('PreviewImage', { images: ['9', 0] }),
    };
}

export function spikeModelFiles(spike) {
    return [{ kind: 'diffusionModels', name: spike.model }, { kind: 'textEncoders', name: spike.components.clip },
        { kind: 'textEncoders', name: spike.components.t5 }, { kind: 'vaes', name: spike.components.vae }];
}
