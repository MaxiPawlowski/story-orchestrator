import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllowlist, neverIssues, stageList, stageTree, targetIssues } from "./artifact.mjs";
import { FLAVOURS, flavourIssues } from "./buildChecks.mjs";
import { serveDev } from "./serveFlavour.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const argValue = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const fail = (message) => { console.error(`stage refused: ${message}`); process.exit(1); };

const flavor = argValue("--flavor") ?? "prod";
if (!(flavor in FLAVOURS)) fail(`unknown --flavor ${flavor}: expected prod or dev`);
const stRoot = argValue("--st-root") ?? process.env.ST_ROOT;
if (!stRoot) fail("pass --st-root <SillyTavern root> or set ST_ROOT; it is never derived");
const issues = targetIssues(resolve(stRoot), root);
if (issues.length) fail(issues.join("; "));

const readJson = (dir) => JSON.parse(readFileSync(join(root, dir, "manifest.json"), "utf8"));
const prodIssues = flavourIssues(readJson("dist"), "prod");
if (prodIssues.length) fail(`dist/ ${prodIssues.join("; ")}: run npm run build`);
const allowlist = loadAllowlist(root);
const list = stageList(root, allowlist, readJson("dist"));
const never = neverIssues(list, allowlist);
if (never.length) fail(never.join("; "));

const slot = resolve(stRoot, "public", "scripts", "extensions", "third-party", "story-orchestrator");
rmSync(slot, { recursive: true, force: true });
mkdirSync(slot, { recursive: true });
stageTree(root, slot, list);
const served = flavor === "dev" ? serveDev({ from: join(root, FLAVOURS.dev), to: join(slot, "dist") }) : null;
console.log(`staged ${list.length} files into ${slot} (${flavor}${served ? `, bundle ${served.bundleSha256.slice(0, 12)}` : ""}); reload the page (node scripts/debug/st-session.mts reload)`);
