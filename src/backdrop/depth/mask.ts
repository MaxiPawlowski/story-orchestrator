export interface MaskOptions { far: number; feather: number; minShare: number }

export const SKY_MASK: MaskOptions = Object.freeze({ far: 0.12, feather: 2, minShare: 0.02 });

const luminance = (rgba: ArrayLike<number>, index: number): number => rgba[index * 4];

export function farThreshold(depth: ArrayLike<number>, count: number, far: number): number {
  const histogram = new Uint32Array(256);
  for (let index = 0; index < count; index += 1) histogram[luminance(depth, index)] += 1;
  let low = 0, high = 255;
  while (low < 255 && histogram[low] === 0) low += 1;
  while (high > 0 && histogram[high] === 0) high -= 1;
  return low + (high - low) * far;
}

export function skyMask(depth: ArrayLike<number>, width: number, height: number, options: MaskOptions = SKY_MASK): Uint8ClampedArray | null {
  const count = width * height;
  if (!(width > 0 && height > 0) || depth.length < count * 4) throw new Error("The depth map has no pixels.");
  const limit = farThreshold(depth, count, options.far);
  const sky = new Uint8Array(count);
  const stack: number[] = [];
  for (let x = 0; x < width; x += 1) if (luminance(depth, x) <= limit) { sky[x] = 1; stack.push(x); }
  while (stack.length) {
    const index = stack.pop() as number;
    const x = index % width, y = (index - x) / width;
    const next = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
    for (const neighbour of next) {
      if (neighbour < 0 || sky[neighbour] || luminance(depth, neighbour) > limit) continue;
      sky[neighbour] = 1;
      stack.push(neighbour);
    }
  }
  let share = 0;
  for (let index = 0; index < count; index += 1) share += sky[index];
  if (share / count < options.minShare) return null;
  const soft = feather(sky, width, height, options.feather);
  const out = new Uint8ClampedArray(count * 4);
  for (let index = 0; index < count; index += 1) {
    out[index * 4] = soft[index];
    out[index * 4 + 3] = 255;
  }
  return out;
}

function feather(mask: Uint8Array, width: number, height: number, radius: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  if (radius < 1) {
    for (let index = 0; index < mask.length; index += 1) out[index] = mask[index] * 255;
    return out;
  }
  const rows = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0, n = 0;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const sx = x + dx;
        if (sx < 0 || sx >= width) continue;
        sum += mask[y * width + sx]; n += 1;
      }
      rows[y * width + x] = sum / n;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sy = y + dy;
        if (sy < 0 || sy >= height) continue;
        sum += rows[sy * width + x]; n += 1;
      }
      out[y * width + x] = Math.round((sum / n) * 255);
    }
  }
  return out;
}
