import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtempSync, readFileSync as read, rmSync } from "node:fs";
import { join } from "node:path";

const [project, rectText, outName = "live-head.bust.json", ...rest] = process.argv.slice(2);
if (!project || !rectText) throw new Error("Usage: node scripts/live-head/crop-base.mjs <project> x,y,w,h [out name] [--python python]");
const python = rest.includes("--python") ? rest[rest.indexOf("--python") + 1] : "python";
const root = resolve(process.cwd());
const dir = resolve(project);
const inside = relative(root, dir);
if (inside.startsWith("..") || isAbsolute(inside)) throw new Error("The project must stay inside this worktree.");
const out = resolve(dir, outName);
if (existsSync(out)) throw new Error(`${outName} already exists; outputs are create-only.`);
const rect = rectText.split(",").map(Number);
if (rect.length !== 4 || rect.some((n) => !Number.isInteger(n) || n < 0)) throw new Error("The rectangle is four non-negative integers: x,y,w,h.");

const manifest = JSON.parse(readFileSync(resolve(dir, "live-head.json"), "utf8"));
const base = manifest.layers.find((layer) => layer.name === "base");
if (!base) throw new Error("The manifest has no base layer.");
const [bx, by, bw, bh] = base.rect;
if (rect[0] < bx || rect[1] < by || rect[0] + rect[2] > bx + bw || rect[1] + rect[3] > by + bh) throw new Error("The crop must stay inside the base layer.");

const work = mkdtempSync(join(tmpdir(), "so-crop-"));
try {
  const source = join(work, "base.png"), cropped = join(work, "cropped.png");
  writeFileSync(source, Buffer.from(base.image.split(",")[1], "base64"));
  const code = [
    "import sys",
    "from PIL import Image",
    "x, y, w, h = [int(v) for v in sys.argv[3:7]]",
    "bx, by = int(sys.argv[7]), int(sys.argv[8])",
    "Image.open(sys.argv[1]).convert('RGBA').crop((x - bx, y - by, x - bx + w, y - by + h)).save(sys.argv[2])",
  ].join("\n");
  const result = spawnSync(python, ["-c", code, source, cropped, ...rect.map(String), String(bx), String(by)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Pillow crop failed: ${result.stderr.slice(-300)}`);
  base.rect = rect;
  base.image = `data:image/png;base64,${read(cropped).toString("base64")}`;
} finally { rmSync(work, { recursive: true, force: true }); }
writeFileSync(out, JSON.stringify(manifest));
console.log(`${out}: base layer ${bw}x${bh} -> ${rect[2]}x${rect[3]} at ${rect[0]},${rect[1]}`);
