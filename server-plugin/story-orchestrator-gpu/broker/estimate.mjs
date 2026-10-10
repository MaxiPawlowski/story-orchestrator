const BASE_MARGIN_MIB = 2442;
const BASE_PIXELS = 1344 * 768;
const HIRES_FACTOR = 1.8;

export function bytesToMiB(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) throw new Error('A non-negative byte count is required.');
    return value / 1024 / 1024;
}

export function activationMarginMiB({ width, height, hires = false }) {
    const pixels = Number(width) * Number(height);
    if (!Number.isFinite(pixels) || pixels <= 0) throw new Error('A positive render size is required.');
    return Math.ceil(BASE_MARGIN_MIB * (pixels / BASE_PIXELS) * (hires ? HIRES_FACTOR : 1));
}

export function estimateGpuMiB({ weightsMiB, width, height, hires = false }) {
    const weights = Number(weightsMiB);
    if (!Number.isFinite(weights) || weights <= 0) throw new Error('A positive weights size is required.');
    return Math.ceil(weights + activationMarginMiB({ width, height, hires }));
}
