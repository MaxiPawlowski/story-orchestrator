import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const option = (name, fallback) => { const at = process.argv.indexOf(name); return at < 0 ? fallback : process.argv[at + 1]; };
const root = resolve(option("--root", fileURLToPath(new URL("../..", import.meta.url))));
const frames = Number(option("--frames", "20000")), legacy = process.argv.includes("--legacy"), full = process.argv.includes("--motion");

const entry = `
import { HeadRenderer } from "./src/sprites/liveHead/renderer";
import { syntheticHead, syntheticMotionHead } from "./src/sprites/liveHead/synthetic";
const head = HEAD;
const motion = process.argv[2] !== "reduced", frames = Number(process.argv[3]);
globalThis.window = { devicePixelRatio: 1 };
let uploads = 0;
const cache = new Map();
const pick = (key) => {
  if (key === "isContextLost") return () => false;
  if (key === "getShaderParameter" || key === "getProgramParameter") return () => true;
  if (key === "NO_ERROR") return 0;
  if (key === "getError") return () => 0;
  if (key === "bufferSubData") return () => { uploads++; };
  if (typeof key === "string" && /^[A-Z]/.test(key)) return 1;
  if (typeof key === "string" && key.startsWith("create")) return () => ({});
  return () => null;
};
const gl = new Proxy({}, { get: (_, key) => { if (!cache.has(key)) cache.set(key, pick(key)); return cache.get(key); } });
const canvas = { clientWidth: 128, clientHeight: 192, width: 128, height: 192, style: {}, parentElement: null, getContext: () => gl };
const renderer = new HeadRenderer(canvas, head);
for (const layer of head.layers) renderer.add(layer, { naturalWidth: layer.rect[2], naturalHeight: layer.rect[3] });
const step = DRIVER;
for (let i = 0; i < 3000; i++) step(i * 16.7);
const before = uploads, start = process.hrtime.bigint();
console.log("bench-start");
for (let i = 0; i < frames; i++) step(60000 + i * 16.7);
console.log("bench-end " + JSON.stringify({ uploadsPerFrame: (uploads - before) / frames, msPerFrame: Number(process.hrtime.bigint() - start) / 1e6 / frames }));
`;

mkdirSync(join(root, ".build"), { recursive: true });
const outfile = join(root, ".build/live-head-frame-bench.cjs");
const driver = full
  ? ['import { HeadDriver } from "./src/sprites/liveHead/headDriver";\nimport { MotionDriver } from "./src/sprites/liveHead/motionDriver";',
    '((driver, md) => (time) => { const p = driver.drive(time, "neutral", false, motion); md.apply(p, time, time % 20000 < 10000 ? "neutral" : "joy", "idle", motion); renderer.draw(p, time); })(new HeadDriver("shape"), new MotionDriver("shape"))']
  : legacy
  ? ['import { driveHead } from "./src/sprites/liveHead/drivers";', '(time) => renderer.draw(driveHead("shape", time, "neutral", true, motion, { breathing: true, blink: true, mouth: true }))']
  : ['import { HeadDriver } from "./src/sprites/liveHead/headDriver";', '((driver) => (time) => renderer.draw(driver.drive(time, "neutral", true, motion, true, true, true)))(new HeadDriver("shape"))'];
await build({ stdin: { contents: driver[0] + entry.replace("HEAD", full ? "syntheticMotionHead" : "syntheticHead").replace("DRIVER", driver[1]), resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", outfile, logLevel: "warning", tsconfig: join(root, "tsconfig.json") });
const results = {};
for (const mode of ["motion", "reduced"]) {
  const run = spawnSync(process.execPath, ["--trace-gc", "--min-semi-space-size=1", "--max-semi-space-size=1", outfile, mode, String(frames)], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (run.status !== 0) throw new Error(run.stderr);
  const text = run.stdout, from = text.indexOf("bench-start"), end = text.indexOf("bench-end ");
  const scavenges = text.slice(from, end).split("Scavenge").length - 1;
  results[mode] = { frames, driver: full ? "HeadDriver+MotionDriver, strands" : legacy ? "driveHead" : "HeadDriver", scavengesPer10kFrames: Math.round(scavenges * 10000 / frames),
    ...JSON.parse(/\{[^\n]*?\}/.exec(text.slice(end + 10))[0]) };
}
writeFileSync(join(root, ".build/live-head-frame-bench.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
