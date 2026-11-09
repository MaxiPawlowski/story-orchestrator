import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CINEMAGRAPH_FLOW, CINEMAGRAPH_PERIOD_S } from "../../src/backdrop/loops/cinemagraphFlow.ts";

const TAU = Math.PI * 2;
const fract = (value: number) => value - Math.floor(value);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const noise = (x: number, y: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
};

export const COLOR_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "iec61966-2-1", "-color_range", "tv"];
export const BT709_YUV = ["-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int", "-pix_fmt", "yuv420p", ...COLOR_TAGS];

function rawRgb(file: string, width: number, height: number): Uint8Array {
  const run = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${width}:${height}:flags=lanczos+accurate_rnd+full_chroma_int`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 });
  if (run.status !== 0) throw new Error(run.stderr.toString());
  return new Uint8Array(run.stdout);
}

export function texture(pixels: ArrayLike<number>, width: number, height: number) {
  return (u: number, v: number, channel: number): number => {
    const x = Math.min(width - 1, Math.max(0, u * width - 0.5));
    const y = Math.min(height - 1, Math.max(0, (1 - v) * height - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const tx = x - x0, ty = y - y0;
    const at = (px: number, py: number) => pixels[(py * width + px) * 3 + channel];
    return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
  };
}

type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function cinemagraphFrame(still: Uint8Array, mask: Uint8Array, width: number, height: number, time: number, period = CINEMAGRAPH_PERIOD_S): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  const linear = Float32Array.from(still, (value) => (value / 255) ** 2.2);
  const base = texture(linear, width, height), region = texture(mask, width, height);
  const phase0 = fract(time / period), phase1 = fract(time / period + 0.5);
  const weight = 1 - Math.abs(1 - 2 * phase0);
  const take = (u: number, v: number, own: Rgb, channel: number): Rgb => mix(own, [base(u, v, 0), base(u, v, 1), base(u, v, 2)], region(u, v, channel) / 255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const u = (x + 0.5) / width, v = 1 - (y + 0.5) / height;
      const own: Rgb = [linear[index * 3], linear[index * 3 + 1], linear[index * 3 + 2]];
      const sky = region(u, v, 0) / 255, water = region(u, v, 1) / 255;
      const amount = Math.min(1, Math.max(sky, water));
      let color = own;
      if (amount >= 0.004) {
        if (sky >= water) {
          const wx = noise(u * 4, v * 4) - 0.5, wy = noise(u * 4 + 17.3, v * 4 + 17.3) - 0.5;
          const fx = CINEMAGRAPH_FLOW.skyDrift + wx * CINEMAGRAPH_FLOW.skyWobble, fy = wy * CINEMAGRAPH_FLOW.skyWobble;
          color = mix(take(u - fx * (phase1 - 0.5), v - fy * (phase1 - 0.5), own, 0), take(u - fx * (phase0 - 0.5), v - fy * (phase0 - 0.5), own, 0), weight);
        } else {
          const near = 1 - v;
          const amp = CINEMAGRAPH_FLOW.rippleAmp * (CINEMAGRAPH_FLOW.rippleFar + (1 - CINEMAGRAPH_FLOW.rippleFar) * near) * (0.25 + 0.75 * noise(u * 3, v * 30));
          const wave = Math.sin(v * CINEMAGRAPH_FLOW.rippleFreq * (2 - near) + TAU * CINEMAGRAPH_FLOW.rippleCycles * time / period + noise(u * 6, v * 40) * TAU);
          color = take(u + wave * amp, v, own, 1);
        }
        color = mix(own, color, amount);
      }
      for (let channel = 0; channel < 3; channel += 1) out[index * 3 + channel] = Math.round(255 * Math.min(1, Math.max(0, color[channel])) ** (1 / 2.2));
    }
  }
  return out;
}

async function render(stillFile: string, maskFile: string, outBase: string, width: number, height: number, fps: number) {
  const still = rawRgb(stillFile, width, height);
  const mask = rawRgb(maskFile, width, height);
  const frames = Math.round(CINEMAGRAPH_PERIOD_S * fps);
  const chunks = Array.from({ length: frames }, (_, index) => cinemagraphFrame(still, mask, width, height, (index / frames) * CINEMAGRAPH_PERIOD_S));
  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  await fs.mkdir(path.dirname(outBase), { recursive: true });
  const run = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-r", String(fps), "-i", "-",
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", ...BT709_YUV, `${outBase}.mp4`], { input: raw, maxBuffer: 1 << 30 });
  if (run.status !== 0) throw new Error(run.stderr.toString());
  console.log(JSON.stringify({ out: `${outBase}.mp4`, frames, fps, seconds: CINEMAGRAPH_PERIOD_S }));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const [still, mask, outBase, size = "672x384", fps = "24"] = process.argv.slice(2);
  if (!still || !mask || !outBase) { console.log("usage: so-cinemagraph-render.mts <still> <mask.png> <out-base> [WxH] [fps]  (mask: R sky, G water; writes <out-base>.mp4, BT.709)"); process.exit(1); }
  const [width, height] = size.split("x").map(Number);
  await render(still, mask, outBase, width, height, Number(fps));
}
