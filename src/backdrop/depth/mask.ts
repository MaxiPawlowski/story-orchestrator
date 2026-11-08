export interface MaskOptions { far: number; feather: number; minShare: number }

export const SKY_MASK: MaskOptions = Object.freeze({ far: 0.01, feather: 2, minShare: 0.02 });

const luminance = (rgba: ArrayLike<number>, index: number): number => rgba[index * 4];

export function farThreshold(depth: ArrayLike<number>, count: number, far: number): number {
  const histogram = new Uint32Array(256);
  for (let index = 0; index < count; index += 1) histogram[luminance(depth, index)] += 1;
  let low = 0, high = 255;
  while (low < 255 && histogram[low] === 0) low += 1;
  while (high > 0 && histogram[high] === 0) high -= 1;
  return low + (high - low) * far;
}

export function skyRegion(depth: ArrayLike<number>, width: number, height: number, options: MaskOptions = SKY_MASK): Uint8Array | null {
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
  return sky;
}

export function skyMask(depth: ArrayLike<number>, width: number, height: number, options: MaskOptions = SKY_MASK): Uint8ClampedArray | null {
  const sky = skyRegion(depth, width, height, options);
  return sky ? packMask(width, height, feather(sky, width, height, options.feather)) : null;
}

export interface WaterOptions { colorDistance: number; flat: number; minShare: number; feather: number; farBand: number; bandGap: number }

export const WATER_MASK: WaterOptions = Object.freeze({ colorDistance: 60, flat: 3, minShare: 0.01, feather: 2, farBand: 0, bandGap: 8 });

export function waterRegion(depth: ArrayLike<number>, color: ArrayLike<number>, sky: Uint8Array, width: number, height: number, options: WaterOptions = WATER_MASK): Uint8Array | null {
  const count = width * height;
  let horizon = 0, skyR = 0, skyG = 0, skyB = 0, skyN = 0;
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!sky[index]) continue;
      row += 1; skyN += 1;
      skyR += color[index * 4]; skyG += color[index * 4 + 1]; skyB += color[index * 4 + 2];
    }
    if (row / width >= 0.05) horizon = y + 1;
  }
  if (!skyN) return null;
  skyR /= skyN; skyG /= skyN; skyB /= skyN;
  const nearEnough = farThreshold(depth, count, options.farBand);
  const candidate = new Uint8Array(count);
  const plane = new Uint8Array(count);
  for (let y = Math.max(1, horizon); y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (sky[index]) continue;
      const here = luminance(depth, index);
      const step = Math.max(...[index + 1, index - 1, index + width, index - width].map((next) => Math.abs(luminance(depth, next) - here)));
      const below = y + 3 < height ? luminance(depth, index + 3 * width) : here, above = y >= 3 ? luminance(depth, index - 3 * width) : here;
      if (step > options.flat || below - above < 1 || here < nearEnough) continue;
      plane[index] = 1;
      const r = color[index * 4], g = color[index * 4 + 1], b = color[index * 4 + 2];
      const blue = b >= r + 8 && b >= g - 5;
      if (blue && (Math.hypot(r - skyR, g - skyG, b - skyB) <= options.colorDistance || b >= r + 25)) candidate[index] = 1;
    }
  }
  const water = new Uint8Array(count);
  const seen = new Uint8Array(count);
  const minimum = Math.max(1, Math.round(count * options.minShare));
  const components: number[][] = [];
  for (let start = 0; start < count; start += 1) {
    if (!candidate[start] || seen[start]) continue;
    const component: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop() as number;
      component.push(index);
      const x = index % width;
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]) {
        if (next < 0 || next >= count || seen[next] || !candidate[next]) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (component.length >= minimum) components.push(component);
  }
  if (!components.length) return null;
  const rows = components.map((component) => ({ component, top: Math.min(...component.map((index) => Math.floor(index / width))), bottom: Math.max(...component.map((index) => Math.floor(index / width))) }));
  const largest = rows.reduce((best, next) => (next.component.length > best.component.length ? next : best));
  let top = largest.top, bottom = largest.bottom, grew = true;
  const kept = new Set([largest]);
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (kept.has(row) || row.bottom < top - options.bandGap || row.top > bottom + options.bandGap) continue;
      kept.add(row); top = Math.min(top, row.top); bottom = Math.max(bottom, row.bottom); grew = true;
    }
  }
  for (const row of kept) for (const index of row.component) water[index] = 1;
  const grow: number[] = [];
  for (let index = 0; index < count; index += 1) if (water[index]) grow.push(index);
  while (grow.length) {
    const index = grow.pop() as number;
    const x = index % width;
    for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]) {
      if (next < 0 || next >= count || water[next] || sky[next] || !plane[next]) continue;
      const y = Math.floor(next / width);
      if (y < top || y > bottom) continue;
      water[next] = 1;
      grow.push(next);
    }
  }
  return water;
}

export function sceneMask(depth: ArrayLike<number>, color: ArrayLike<number> | null, width: number, height: number): Uint8ClampedArray | null {
  const sky = skyRegion(depth, width, height, SKY_MASK);
  if (!sky) return null;
  const water = color ? waterRegion(depth, color, sky, width, height) : null;
  return packMask(width, height, feather(sky, width, height, SKY_MASK.feather), water ? feather(water, width, height, WATER_MASK.feather) : null);
}

function packMask(width: number, height: number, sky: Uint8ClampedArray, water: Uint8ClampedArray | null = null): Uint8ClampedArray {
  const count = width * height;
  const out = new Uint8ClampedArray(count * 4);
  for (let index = 0; index < count; index += 1) {
    out[index * 4] = sky[index];
    out[index * 4 + 1] = water ? water[index] : 0;
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
