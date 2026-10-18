import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const args = process.argv.slice(2), command = args[0];
const option = (name, fallback) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; };
const need = (name) => { const value = option(name); if (!value) throw new Error(`missing ${name}`); return value; };
const SOL = "openai/gpt-6.1-sol";

async function page(run) {
  const bundle = join(root, ".build/live-head-motion-page.js");
  await build({ entryPoints: [join(root, "scripts/live-head/motion-page.mjs")], bundle: true, platform: "browser", format: "iife", outfile: bundle, logLevel: "warning" });
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const tab = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1 });
    const problems = [];
    tab.on("pageerror", (error) => problems.push(error.message));
    await tab.setContent("<!doctype html><body style='margin:0;background:#8c8c8c'></body>");
    await tab.addScriptTag({ content: readFileSync(bundle, "utf8") });
    const result = await run(tab);
    if (problems.length) throw new Error(problems.join("\n"));
    return result;
  } finally { await browser.close(); }
}

async function sol(request, ledger, purpose) {
  const pluginDir = option("--plugin-dir", join(readFileSync(join(root, ".st-root"), "utf8").trim(), "plugins/story-orchestrator-harness"));
  const { createHarnessService, sanitizeConfig, validateComplete } = await import(pathToFileURL(join(pluginDir, "index.mjs")).href);
  const config = sanitizeConfig({ harnesses: { opencode: { offer: true, models: [{ id: SOL, context: 200000 }] } } });
  const checked = validateComplete({ requestId: `so-motion-${randomUUID().slice(0, 8)}`, harness: "opencode", model: SOL, role: "visual-rig",
    system: "You answer one request from a story-tracking tool. Reply in plain text, exactly in the format the request asks for. You have no tools.",
    prompt: request.prompt, images: request.images, timeoutMs: 300000, maxOutputChars: request.maxOutputChars ?? 12000, effort: "high" }, config);
  if (checked.issue) throw new Error(checked.issue);
  const service = createHarnessService({ config, log: () => undefined });
  const started = Date.now();
  try {
    const answer = await service.complete(checked.value, {});
    appendFileSync(ledger, `${JSON.stringify({ at: new Date().toISOString(), purpose, ok: answer.ok, kind: answer.kind ?? null, ms: Date.now() - started, model: answer.model ?? null })}\n`);
    if (!answer.ok) throw new Error(`Sol call failed (${answer.kind}): ${answer.message}`);
    return answer.text;
  } finally { await service.shutdown(); }
}

const png = (file) => readFileSync(file).toString("base64");
const dataUrl = (file) => `data:image/png;base64,${png(file)}`;
const size = (file) => { const b = readFileSync(file); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; };

async function landmarks() {
  const bust = need("--bust"), out = need("--out"), ledger = need("--ledger");
  if (existsSync(out)) throw new Error(`${out} exists`);
  const contract = join(root, ".build/live-head-vision-request.mjs");
  await build({ stdin: { contents: 'export { visionRigRequest } from "./src/sprites/liveHead/visionRequest"; export { readLandmarkAnswer } from "./src/sprites/liveHead/synthesis/visionLandmarks";', resolveDir: root, loader: "ts" },
    bundle: true, platform: "node", format: "esm", outfile: contract, logLevel: "warning", external: ["@services/*"] });
  const { visionRigRequest, readLandmarkAnswer } = await import(pathToFileURL(contract).href);
  const sha256 = createHash("sha256").update(readFileSync(bust)).digest("hex");
  const request = visionRigRequest({ sha256 }, png(bust), { id: SOL, label: "Sol" }, new AbortController().signal, size(bust));
  const text = await sol(request, ledger, `landmarks ${bust}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out.replace(/\.json$/, ".answer.txt"), text);
  writeFileSync(out, JSON.stringify(readLandmarkAnswer(text), null, 1));
  console.log(out);
}

async function synth() {
  const bust = need("--bust"), marks = JSON.parse(readFileSync(need("--landmarks"), "utf8")), out = need("--out");
  const manifest = await page((tab) => tab.evaluate((value) => window.synthesizeMotionRig(value),
    { bust: dataUrl(bust), sha256: createHash("sha256").update(readFileSync(bust)).digest("hex"), member: need("--member"), look: option("--look", "default"), source: need("--source"), landmarks: marks }));
  if (!manifest) throw new Error("synthesis returned nothing");
  writeFileSync(out, JSON.stringify(manifest));
  console.log(JSON.stringify({ out, strands: manifest.rig.strands?.length ?? 0, hand: Boolean(manifest.rig.hand), layers: manifest.layers.map((l) => l.name).length }));
}

async function sheets() {
  const manifest = JSON.parse(readFileSync(need("--manifest"), "utf8")), out = need("--out");
  mkdirSync(out, { recursive: true });
  const frameDir = option("--frames"), prefix = option("--prefix"), box = option("--box");
  const drawn = frameDir ? { art: dataUrl(need("--bust")), box: box ? Object.fromEntries(box.split(",").map(Number).map((v, i) => [["x", "y", "width", "height"][i], v])) : undefined,
    frames: Object.fromEntries(["blink", "talk", "talk2", "mouth_o", "mouth_wide"].map((key) => [key, join(frameDir, `${prefix}.${key}.png`)]).filter(([, file]) => existsSync(file)).map(([key, file]) => [key, dataUrl(file)])) } : null;
  const result = await page((tab) => tab.evaluate(([value, extra]) => window.renderMotionReview(value, extra), [manifest, drawn]));
  for (const [name, urls] of Object.entries(result.sheets)) {
    writeFileSync(join(out, `${name}.png`), Buffer.from(urls.png.split(",")[1], "base64"));
    writeFileSync(join(out, `${name}.jpg`), Buffer.from(urls.jpeg.split(",")[1], "base64"));
  }
  console.log(JSON.stringify({ out, parts: result.parts, sheets: Object.keys(result.sheets) }));
}

const REVIEW_PROMPT = `You review a live 2D character rig for a visual novel. The images are renders of ONE illustrated bust deformed by a mesh rig at fixed parameters; each tile is labelled.
Image 1 (motion-core): rest, hair springs held at both extremes (+x, -x, +y, -y), body sway left/right with and without hair, head turn and tilt at +-30 degrees, mouth open, eyes closed.
Image 2 (motion-hair-zoom): the first nine tiles zoomed on the head. Image 3 (motion-gestures): one key pose of every keyframed gesture.
Judge only what the renders show, against these floors, each PASS or FAIL with a short reason:
- strands_on_hair: the parts that move with the hair springs are hair; no skin, eye, ear or clothing area is dragged along with the hair (compare rest with the hair tiles).
- no_tear_hair: no tearing, holes, cracks, doubled edges or detached pieces at the hair spring extremes.
- no_tear_sway: no tearing, holes, stretched smears or detached pieces at body sway extremes; the bottom edge stays attached.
- no_tear_gestures: no tearing or broken features at any gesture key pose (name the gesture if one fails).
- li5_mouth: the open mouth does not cross the chin.
- li5_turns: no tears at +-30 degree turns and tilts.
- li5_closed_eyes: closed eyes show no iris or eye white.
Return JSON only: {"floors":{"strands_on_hair":{"pass":true,"reason":""},"no_tear_hair":{...},"no_tear_sway":{...},"no_tear_gestures":{...},"li5_mouth":{...},"li5_turns":{...},"li5_closed_eyes":{...}},"notes":"","fix":"if a strand floor fails: which strand (by its position) to move or drop, else empty"}`;

async function review() {
  const dir = need("--dir"), out = need("--out"), ledger = need("--ledger");
  if (existsSync(out)) throw new Error(`${out} exists`);
  const images = ["motion-core", "motion-hair-zoom", "motion-gestures"].map((name) => ({ data: readFileSync(join(dir, `${name}.jpg`)).toString("base64"), mime: "image/jpeg", description: name }));
  const text = await sol({ prompt: REVIEW_PROMPT, images, maxOutputChars: 6000 }, ledger, `review ${dir}`);
  writeFileSync(out.replace(/\.json$/, ".answer.txt"), text);
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  writeFileSync(out, JSON.stringify(JSON.parse(text.slice(start, end + 1)), null, 1));
  console.log(out);
}

const EYES_PROMPT = (marks, findings, size) => `You placed face landmarks on this ${size.width} x ${size.height} bust (pixel coordinates, origin top left). A review of the rig built from them reported:
${findings}
The second image is a 2x render of the bust with each eye contour drawn in cyan (and the hair strands in pink). Correct ONLY the two "eyes" contours: each a closed contour of 6 to 16 points tracing the whole visible opening (eye white and iris) from lid line to lid line, the image's left eye first; include every eye-white pixel, staying on the lash line at the top and just outside the lower lid line at the bottom. Keep every other key exactly as given.
Current landmarks: ${JSON.stringify(marks)}
Return JSON only: {"refused":false,"reason":"","landmarks":{...the full corrected landmarks...}}`;

const CORRECT_PROMPT = (marks, findings, size) => `You placed face, hair and body landmarks on this ${size.width} x ${size.height} bust (pixel coordinates, origin top left). A review of the rig built from them reported:
${findings}
The second image is the rest render with the moving hair strands drawn as polylines (numbered from 1 in the order given). Correct ONLY the "hair" list (and "chest" or "hand" if the review names them): move or drop strands so every point lies on hair, never on skin, eyes or clothing. Keep every other key exactly as given.
Current landmarks: ${JSON.stringify(marks)}
Return JSON only: {"refused":false,"reason":"","landmarks":{...the full corrected landmarks...}}`;

async function correct() {
  const bust = need("--bust"), marks = JSON.parse(readFileSync(need("--landmarks"), "utf8")), overlay = need("--overlay"), out = need("--out"), ledger = need("--ledger");
  if (existsSync(out)) throw new Error(`${out} exists`);
  const findings = readFileSync(need("--findings"), "utf8");
  const contract = join(root, ".build/live-head-vision-request.mjs");
  const { readLandmarkAnswer } = await import(pathToFileURL(contract).href);
  const prompt = (option("--part", "hair") === "eyes" ? EYES_PROMPT : CORRECT_PROMPT)(marks, findings, size(bust));
  const text = await sol({ prompt, images: [{ data: png(bust), mime: "image/png", description: "bust" }, { data: png(overlay), mime: "image/png", description: "strand overlay" }] }, ledger, `correct ${bust}`);
  writeFileSync(out.replace(/\.json$/, ".answer.txt"), text);
  writeFileSync(out, JSON.stringify(readLandmarkAnswer(text), null, 1));
  console.log(out);
}

async function overlay() {
  const manifest = JSON.parse(readFileSync(need("--manifest"), "utf8")), out = need("--out");
  const url = await page((tab) => tab.evaluate((value) => window.renderStrandOverlay(value), manifest));
  writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log(out);
}

const commands = { landmarks, synth, sheets, review, correct, overlay };
if (!commands[command]) { console.error(`usage: motion-rig.mjs ${Object.keys(commands).join("|")} ...`); process.exitCode = 2; }
else await commands[command]().catch((error) => { console.error(error.message); process.exitCode = 1; });
