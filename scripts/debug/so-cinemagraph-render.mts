import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CINEMAGRAPH_PERIOD_S } from "../../src/backdrop/loops/cinemagraph.ts";

const hash = (x: number, y: number) => { const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return value - Math.floor(value); };
const noise = (x: number, y: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
};

function rawRgba(file: string, width: number, height: number): Uint8Array {
  const run = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-"], { maxBuffer: 1 << 30 });
  if (run.status !== 0) throw new Error(run.stderr.toString());
  return new Uint8Array(run.stdout);
}

export function cinemagraphFrame(still: Uint8Array, mask: Uint8Array, width: number, height: number, time: number, period = CINEMAGRAPH_PERIOD_S): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  const phase0 = (time / period) % 1;
  const phase1 = (time / period + 0.5) % 1;
  const weight = 1 - Math.abs(1 - 2 * phase0);
  const sample = (u: number, v: number, channel: number) => {
    const x = Math.min(width - 1, Math.max(0, Math.round(u * (width - 1))));
    const y = Math.min(height - 1, Math.max(0, Math.round(v * (height - 1))));
    return still[(y * width + x) * 4 + channel];
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const sky = mask[index * 4] / 255, water = mask[index * 4 + 1] / 255;
      const amount = Math.min(1, Math.max(sky, water));
      const u = x / (width - 1), v = y / (height - 1);
      for (let channel = 0; channel < 3; channel += 1) out[index * 3 + channel] = still[index * 4 + channel];
      if (amount < 0.004) continue;
      const wx = noise(u * 4, v * 4) - 0.5, wy = noise(u * 4 + 17.3, v * 4 + 17.3) - 0.5;
      const fx = sky * (0.03 + wx * 0.012) + water * (0.01 + wx * 0.006);
      const fy = sky * wy * 0.012 + water * wy * 0.006;
      const ripple = Math.sin(u * 90 + time * 1.7) * 0.0012 * water;
      for (let channel = 0; channel < 3; channel += 1) {
        const a = sample(u - fx * (phase0 - 0.5), v - fy * (phase0 - 0.5) + ripple, channel);
        const b = sample(u - fx * (phase1 - 0.5), v - fy * (phase1 - 0.5) + ripple, channel);
        const warped = a * weight + b * (1 - weight);
        out[index * 3 + channel] = Math.round(warped * amount + still[index * 4 + channel] * (1 - amount));
      }
    }
  }
  return out;
}

async function render(stillFile: string, maskFile: string, outBase: string, width: number, height: number, fps: number) {
  const still = rawRgba(stillFile, width, height);
  const mask = rawRgba(maskFile, width, height);
  const frames = Math.round(CINEMAGRAPH_PERIOD_S * fps);
  const chunks = Array.from({ length: frames }, (_, index) => cinemagraphFrame(still, mask, width, height, (index / frames) * CINEMAGRAPH_PERIOD_S));
  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  await fs.mkdir(path.dirname(outBase), { recursive: true });
  for (const [ext, codec] of [["webp", ["-c:v", "libwebp", "-loop", "0", "-quality", "70", "-compression_level", "6"]], ["webm", ["-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-pix_fmt", "yuv420p"]]] as const) {
    const run = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-r", String(fps), "-i", "-", ...codec, `${outBase}.${ext}`], { input: raw, maxBuffer: 1 << 30 });
    if (run.status !== 0) throw new Error(run.stderr.toString());
  }
  console.log(JSON.stringify({ out: outBase, frames, fps, seconds: CINEMAGRAPH_PERIOD_S }));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const [still, mask, outBase, size = "640x360", fps = "12"] = process.argv.slice(2);
  if (!still || !mask || !outBase) { console.log("usage: so-cinemagraph-render.mts <still> <mask.png> <out-base> [WxH] [fps]  (mask: R sky, G water)"); process.exit(1); }
  const [width, height] = size.split("x").map(Number);
  await render(still, mask, outBase, width, height, Number(fps));
}
