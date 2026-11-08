import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildLoopGraph, fitShape, LOOP_SHAPES, type VideoTier } from "../../src/backdrop/loops/workflow.ts";
import { loopPrompt } from "../../src/backdrop/loops/prompt.ts";
import { debugDirFor } from "./lib/connection.mts";

const COMFY = process.env.SO_COMFY_URL ?? "http://127.0.0.1:8188";
const SEAM_W = 240;
const SEAM_H = 136;

export function seamStats(gray: Uint8Array, width = SEAM_W, height = SEAM_H) {
  const size = width * height;
  const frames = Math.floor(gray.length / size);
  const step = (a: number, b: number) => {
    let sum = 0;
    for (let index = 0; index < size; index += 1) sum += Math.abs(gray[a * size + index] - gray[b * size + index]);
    return sum / size;
  };
  const steps = Array.from({ length: frames - 1 }, (_, index) => step(index + 1, index));
  const mean = steps.reduce((sum, value) => sum + value, 0) / steps.length;
  const sorted = [...steps].sort((a, b) => a - b);
  const wrap = step(0, frames - 1);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { frames, meanStep: round(mean), p95Step: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), maxStep: round(sorted.at(-1) ?? 0),
    wrapStep: round(wrap), wrapRatio: round(wrap / mean), seamBelowMax: wrap <= (sorted.at(-1) ?? 0) };
}

function seam(file: string) {
  const ffmpeg = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${SEAM_W}x${SEAM_H}`, "-"], { maxBuffer: 1 << 30 });
  if (ffmpeg.status !== 0) throw new Error(`ffmpeg failed: ${ffmpeg.stderr.toString()}`);
  return seamStats(new Uint8Array(ffmpeg.stdout));
}

async function waitEmpty() {
  for (let index = 0; index < 400; index += 1) {
    const queue = await (await fetch(`${COMFY}/queue`)).json();
    if (!queue.queue_running.length && !queue.queue_pending.length) return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("ComfyUI stayed busy; nothing was queued.");
}

function imageSize(file: string): { width: number; height: number } {
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]);
  const [width, height] = probe.stdout.toString().trim().split(",").map(Number);
  return { width: width || 0, height: height || 0 };
}

async function run(image: string, label: string, cold: boolean, tier: VideoTier) {
  const out = path.join(debugDirFor(process.env), "loop-bench");
  await fs.mkdir(out, { recursive: true });
  await waitEmpty();
  if (cold) await fetch(`${COMFY}/free`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unload_models: true, free_memory: true }) });
  const form = new FormData();
  form.set("image", new Blob([await fs.readFile(image)]), `so_loopbench_${label}${path.extname(image)}`);
  form.set("overwrite", "true");
  const uploaded = await (await fetch(`${COMFY}/upload/image`, { method: "POST", body: form })).json();
  const prompt = loopPrompt(path.basename(image));
  const size = imageSize(image);
  const shape = fitShape(LOOP_SHAPES[tier], size.width, size.height);
  const graph = buildLoopGraph({ image: uploaded.name, prompt, key: `bench${label}`, seed: 42, shape });
  const started = Date.now();
  const queued = await (await fetch(`${COMFY}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph }) })).json();
  if (!queued.prompt_id) throw new Error(JSON.stringify(queued));
  let item;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const history = await (await fetch(`${COMFY}/history/${queued.prompt_id}`)).json();
    if (history[queued.prompt_id]) { item = history[queued.prompt_id]; break; }
  }
  const ms = Date.now() - started;
  if (item.status?.status_str === "error") throw new Error(JSON.stringify(item.status).slice(0, 2000));
  const outputs = Object.values(item.outputs as Record<string, { images?: Array<{ filename: string; subfolder?: string; type: string }> }>).flatMap((output) => output.images ?? []);
  const fetchOut = async (saved: { filename: string; subfolder?: string; type: string }) =>
    Buffer.from(await (await fetch(`${COMFY}/view?${new URLSearchParams({ filename: saved.filename, subfolder: saved.subfolder ?? "", type: saved.type })}`)).arrayBuffer());
  const video = outputs.find((entry) => entry.filename.endsWith(".webm"));
  if (!video) throw new Error("No WebM in the outputs.");
  const bytes = await fetchOut(video);
  const file = path.join(out, `${label}.webm`);
  await fs.writeFile(file, bytes);
  const still = outputs.find((entry) => entry.filename.endsWith(".webp"));
  const webp = still ? await fetchOut(still) : null;
  if (webp) await fs.writeFile(path.join(out, `${label}.webp`), webp);
  const record = { label, tier, image: path.basename(image), cold, ms, seconds: Math.round(ms / 1000), bytes: bytes.length, webpBytes: webp?.length ?? null, shape, prompt, file, seam: seam(file) };
  await fs.appendFile(path.join(out, "runs.jsonl"), `${JSON.stringify(record)}\n`);
  console.log(JSON.stringify(record));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const [command, target, ...rest] = process.argv.slice(2);
  const flag = (name: string) => rest.includes(name);
  const option = (name: string) => { const index = rest.indexOf(name); return index >= 0 ? rest[index + 1] : undefined; };
  const tier = option("--tier") === "lite" ? "lite" : "full";
  if (command === "run" && target) await run(target, option("--label") ?? `${tier}_${path.basename(target).replace(/\W+/g, "_")}`, flag("--cold"), tier);
  else if (command === "seam" && target) console.log(JSON.stringify(seam(target)));
  else { console.log("usage: so-loop-bench.mts run <still> [--tier lite|full] [--label x] [--cold] | seam <loop.webm>"); process.exit(1); }
}
