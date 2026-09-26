import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { allowlistIssues, chunkIssues, loadAllowlist, neverIssues, sha256, stageList, stageTree, walk, writeZip } from "./artifact.mjs";
import { fileListIssues, flavourIssues } from "./buildChecks.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const git = (...argv) => execFileSync("git", argv, { cwd: root, encoding: "utf8" }).trim();
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const fail = (message) => { console.error(`package refused: ${message}`); process.exit(1); };

if (git("status", "--porcelain")) fail("the tree is dirty; commit first, a shipped build must name its commit");
if (!args.includes("--no-build")) {
  const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (build.status !== 0) fail("npm run build failed");
}
const distManifest = readJson("dist/manifest.json");
const buildIssues = [...flavourIssues(distManifest, "prod"), ...fileListIssues(readdirSync(join(root, "dist")).filter((name) => name !== "manifest.json"), distManifest)];
if (buildIssues.length) fail(buildIssues.join("; "));

const allowlist = loadAllowlist(root);
const version = readJson("package.json").version;
const name = `story-orchestrator-${version}`;
const out = join(root, "release", name);
rmSync(out, { recursive: true, force: true });
const list = stageList(root, allowlist, distManifest);
stageTree(root, out, list);
const tree = walk(out);
const issues = [...neverIssues(tree, allowlist), ...allowlistIssues(tree, list), ...chunkIssues(readFileSync(join(out, "dist", "index.js"), "utf8"), tree)];
if (issues.length) fail(issues.join("; "));

const pluginVersion = (plugin) => (existsSync(join(root, "server-plugin", plugin, "package.json")) ? readJson(`server-plugin/${plugin}/package.json`).version : null);
const tags = git("tag", "--points-at", "HEAD").split(/\r?\n/).filter(Boolean);
const releaseManifest = {
  kind: "release-manifest",
  name: "story-orchestrator",
  version,
  commit: git("rev-parse", "HEAD"),
  tag: tags.find((tag) => tag === `v${version}`) ?? null,
  bundle: { sha256: distManifest.bundle.sha256, bytes: distManifest.bundle.bytes },
  source: { sha256: distManifest.source.sha256 },
  plugins: { "story-orchestrator-judge": pluginVersion("story-orchestrator-judge"), "story-orchestrator-harness": pluginVersion("story-orchestrator-harness") },
  files: list.map((path) => ({ path, sha256: sha256(readFileSync(join(out, path))) })),
};
writeFileSync(join(out, "release-manifest.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`);
const zip = join(root, "release", `${name}.zip`);
writeZip([...list, "release-manifest.json"].map((path) => ({ name: `story-orchestrator/${path}`, data: readFileSync(join(out, path)) })), zip);
console.log(`staged release/${name}/ (${list.length} files) and release/${name}.zip sha256 ${sha256(readFileSync(zip))}`);
