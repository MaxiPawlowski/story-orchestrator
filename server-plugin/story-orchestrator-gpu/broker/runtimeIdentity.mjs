export function runtimeMemoryProfile(system, id, policy = {}) {
    const args = Array.isArray(system?.argv) ? system.argv.filter((value) => typeof value === 'string') : [];
    const version = /^(\d+)\.(\d+)/.exec(system?.pytorch_version ?? '');
    const supported = version && (Number(version[1]) > 2 || (Number(version[1]) === 2 && Number(version[2]) >= 8));
    const disabled = ['--disable-dynamic-vram', '--highvram', '--gpu-only', '--novram', '--cpu'].some((flag) => args.includes(flag));
    return { id, comfy: system?.comfyui_version, torch: system?.pytorch_version, python: system?.python_version, args, policy,
        streaming: Boolean(supported && /cu130/.test(system?.pytorch_version ?? '') && args.includes('--fast-disk') && !disabled) };
}
