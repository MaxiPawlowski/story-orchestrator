import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllowlist, neverIssues, stageList, stageTree, targetIssues } from "./artifact.mjs";
import { configuredStRoot } from "../lib/stRoot.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const argValue = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const fail = (message) => { console.error(`stage refused: ${message}`); process.exit(1); };

const stRoot = argValue("--st-root") ?? configuredStRoot(process.env, root);
if (!stRoot) fail("pass --st-root <SillyTavern root>, set ST_ROOT or write .st-root; it is never derived");
const issues = targetIssues(resolve(stRoot), root);
if (issues.length) fail(issues.join("; "));

const readJson = (dir) => JSON.parse(readFileSync(join(root, dir, "manifest.json"), "utf8"));
if (!existsSync(join(root, "dist", "manifest.json"))) fail("dist/manifest.json is missing: run npm run build");
const allowlist = loadAllowlist(root);
const list = stageList(root, allowlist, readJson("dist"));
const never = neverIssues(list, allowlist);
if (never.length) fail(never.join("; "));

const slot = resolve(stRoot, "public", "scripts", "extensions", "third-party", "story-orchestrator");
for (const entry of existsSync(slot) ? readdirSync(slot) : []) rmSync(join(slot, entry), { recursive: true, force: true });
mkdirSync(slot, { recursive: true });
stageTree(root, slot, list);
console.log(`staged ${list.length} files into ${slot}; reload the page (node scripts/debug/st-session.mts reload)`);
