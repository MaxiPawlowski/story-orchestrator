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
const png = (file) => readFileSync(file).toString("base64");
const dataUrl = (file) => `data:image/png;base64,${png(file)}`;
const size = (file) => { const b = readFileSync(file); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; };
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

async function page(run) {
  const bundle = join(root, ".build/live-body-page.js");
  await build({ entryPoints: [join(root, "scripts/live-head/body-page.mjs")], bundle: true, platform: "browser", format: "iife", outfile: bundle, logLevel: "warning", tsconfig: join(root, "tsconfig.json") });
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const tab = await browser.newPage({ viewport: { width: 1600, height: 1600 }, deviceScaleFactor: 1 });
    const problems = [];
    tab.on("pageerror", (error) => problems.push(error.message));
    await tab.setContent("<!doctype html><body style='margin:0;background:#8c8c8c'></body>");
    await tab.addScriptTag({ content: readFileSync(bundle, "utf8") });
    const result = await run(tab);
    if (problems.length) throw new Error(problems.join("\n"));
    return result;
  } finally { await browser.close(); }
}

async function contract() {
  const out = join(root, ".build/live-body-contract.mjs");
  await build({ stdin: { contents: 'export { bodyRigRequest } from "./src/sprites/liveHead/body/synthesize"; export { readLandmarkAnswer } from "./src/sprites/liveHead/synthesis/visionLandmarks";', resolveDir: root, loader: "ts" },
    bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "warning", external: ["@services/*"], tsconfig: join(root, "tsconfig.json") });
  return import(pathToFileURL(out).href);
}

async function sol(request, ledger, purpose) {
  const pluginDir = need("--plugin-dir");
  const { createHarnessService, sanitizeConfig, validateComplete } = await import(pathToFileURL(join(pluginDir, "index.mjs")).href);
  const config = sanitizeConfig({ harnesses: { opencode: { offer: true, models: [{ id: SOL, context: 200000 }] } } });
  const checked = validateComplete({ requestId: `so-body-${randomUUID().slice(0, 8)}`, harness: "opencode", model: SOL, role: "visual-rig",
    system: "You answer one request from a story-tracking tool. Reply in plain text, exactly in the format the request asks for. You have no tools.",
    prompt: request.prompt, images: request.images, timeoutMs: 300000, maxOutputChars: request.maxOutputChars ?? 16000, effort: "high" }, config);
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

async function landmarks() {
  const sprite = need("--sprite"), out = need("--out"), ledger = need("--ledger");
  if (existsSync(out)) throw new Error(`${out} exists`);
  const { bodyRigRequest, readLandmarkAnswer } = await contract();
  const request = bodyRigRequest(sha(sprite), png(sprite), { id: SOL, label: "Sol" }, new AbortController().signal, size(sprite));
  const text = await sol(request, ledger, `body landmarks ${sprite}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out.replace(/\.json$/, ".answer.txt"), text);
  writeFileSync(out, JSON.stringify(readLandmarkAnswer(text), null, 1));
  console.log(out);
}

async function synth() {
  const sprite = need("--sprite"), marks = JSON.parse(readFileSync(need("--landmarks"), "utf8")), out = need("--out");
  const identity = { member: need("--member"), look: option("--look", "default"), pose: need("--pose"), source: need("--source"), sha256: sha(sprite) };
  const built = await page((tab) => tab.evaluate((value) => window.synthesizeBodyRig(value), { image: dataUrl(sprite), identity, landmarks: marks }));
  writeFileSync(out, JSON.stringify(built.manifest));
  console.log(JSON.stringify({ out, notes: built.notes, arms: built.manifest.rig.arms?.map((arm) => `${arm.side}:${arm.state}`) ?? [], strands: built.manifest.rig.strands?.length ?? 0, layers: built.manifest.layers.map((l) => l.name) }));
}

async function sheets() {
  const manifest = JSON.parse(readFileSync(need("--manifest"), "utf8")), out = need("--out"), sprite = need("--sprite");
  mkdirSync(out, { recursive: true });
  const result = await page((tab) => tab.evaluate(([value, source]) => window.renderBodyReview(value, source), [manifest, dataUrl(sprite)]));
  for (const [name, urls] of Object.entries(result.sheets)) {
    writeFileSync(join(out, `${name}.png`), Buffer.from(urls.png.split(",")[1], "base64"));
    writeFileSync(join(out, `${name}.jpg`), Buffer.from(urls.jpeg.split(",")[1], "base64"));
  }
  writeFileSync(join(out, "inverted.json"), JSON.stringify(result.inverted, null, 1));
  console.log(JSON.stringify({ out, parts: result.parts, inverted: Object.values(result.inverted).reduce((a, b) => a + b, 0) }));
}

async function overlay() {
  const manifest = JSON.parse(readFileSync(need("--manifest"), "utf8")), out = need("--out"), sprite = need("--sprite");
  const urls = await page((tab) => tab.evaluate(([value, source]) => window.renderBodyOverlay(value, source), [manifest, dataUrl(sprite)]));
  writeFileSync(out, Buffer.from(urls.jpeg.split(",")[1], "base64"));
  console.log(out);
}

const REVIEW_PROMPT = `You review a live 2D rig for a visual novel. The images are renders of ONE full-body character sprite deformed by a mesh rig at fixed parameters; each tile is labelled, and the first tile is the untouched source image.
Image 1 (body-core): the whole figure at rest, breath, body sway left/right, upper arms and forearms at both extremes, hair springs held at both extremes, head tilt +-30 degrees, and two combined extremes.
Image 2 (body-zoom): the torso and arms zoomed for the rest, sway, arm and combined tiles.
Judge only what the renders show, each floor PASS or FAIL with a short reason:
- arms_attached: in every tile the hands stay attached to the forearms and the arms to the shoulders; no hand, sleeve or arm piece is left behind or floats.
- no_tear_arms: no tearing, holes, cracks, doubled edges, ghost copies of an arm or stretched smears at the arm extremes (a narrow notch where an arm used to cover the body is acceptable only if it reads as body edge, not as a hole).
- no_tear_sway: no tearing, holes or detached pieces at the sway extremes; feet, legs, seat and anything below the hips stay planted.
- no_tear_hair: no tearing or detached pieces at the hair extremes; the parts that move with the hair are hair, not skin, face or clothing.
- no_smear_rest: the rest tile looks the same as the source image (no smear, seam, outline or patch where an arm was cut out).
- head_ok: the head tilts stay attached to the neck without tearing.
Return JSON only: {"floors":{"arms_attached":{"pass":true,"reason":""},"no_tear_arms":{...},"no_tear_sway":{...},"no_tear_hair":{...},"no_smear_rest":{...},"head_ok":{...}},"notes":"","fix":"if a floor fails because of a landmark (an arm outline missing part of the arm, a joint misplaced, a lock on skin): which landmark to move, else empty"}`;

async function review() {
  const dir = need("--dir"), out = need("--out"), ledger = need("--ledger");
  if (existsSync(out)) throw new Error(`${out} exists`);
  const images = ["body-core", "body-zoom"].map((name) => ({ data: readFileSync(join(dir, `${name}.jpg`)).toString("base64"), mime: "image/jpeg", description: name }));
  const text = await sol({ prompt: REVIEW_PROMPT, images, maxOutputChars: 6000 }, ledger, `body review ${dir}`);
  writeFileSync(out.replace(/\.json$/, ".answer.txt"), text);
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  writeFileSync(out, JSON.stringify(JSON.parse(text.slice(start, end + 1)), null, 1));
  console.log(out);
}

const CORRECT_PROMPT = (marks, findings, dims) => `You placed body landmarks on this ${dims.width} x ${dims.height} full-body sprite (pixel coordinates, origin top left). A review of the rig built from them reported:
${findings}
The second image is the sprite with the landmarks drawn: head oval, neck, chest and hips in yellow, the waist band as dashed lines, arm outlines and joints (cyan free, green resting, orange holding), hair locks in pink numbered from 1.
Correct only what the review names (an arm outline, joints or state, a hair lock, the waist or hips): every arm outline must enclose the whole arm including sleeve and hand and hug its edge. Keep every other key exactly as given.
Current landmarks: ${JSON.stringify(marks)}
Return JSON only: {"refused":false,"reason":"","landmarks":{...the full corrected landmarks...}}`;

async function correct() {
  const sprite = need("--sprite"), marks = JSON.parse(readFileSync(need("--landmarks"), "utf8")), shown = need("--overlay"), out = need("--out"), ledger = need("--ledger");
  if (existsSync(out)) throw new Error(`${out} exists`);
  const { readLandmarkAnswer } = await contract();
  const text = await sol({ prompt: CORRECT_PROMPT(marks, readFileSync(need("--findings"), "utf8"), size(sprite)),
    images: [{ data: png(sprite), mime: "image/png", description: "sprite" }, { data: readFileSync(shown).toString("base64"), mime: "image/jpeg", description: "landmark overlay" }] }, ledger, `body correct ${sprite}`);
  writeFileSync(out.replace(/\.json$/, ".answer.txt"), text);
  writeFileSync(out, JSON.stringify(readLandmarkAnswer(text), null, 1));
  console.log(out);
}

const commands = { landmarks, synth, sheets, overlay, review, correct };
if (!commands[command]) { console.error(`usage: body-rig.mjs ${Object.keys(commands).join("|")} ...`); process.exitCode = 2; }
else await commands[command]().catch((error) => { console.error(error.message); process.exitCode = 1; });
