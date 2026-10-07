import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { allowlistIssues, chunkIssues, loadAllowlist, neverIssues, readZipNames, stageList, stageTree, targetIssues, walk, writeZip } from "./artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const allowlist = loadAllowlist(root);

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "so-artifact-"));
  const put = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  for (const path of allowlist.files.filter((file) => !file.startsWith("dist/"))) put(path, path);
  put("examples/README.md", "x");
  put("examples/sun-ruins/Arin.png", "png");
  put("docs/plans/x.md", "internal");
  put("src/index.tsx", "source");
  put("dist/index.js", 'c.e(146).then(()=>c.e(285));c.u=e=>e+".index.js"');
  put("dist/146.index.js", "a");
  put("dist/285.index.js", "b");
  put("dist/index.js.map", "{}");
  const files = ["146.index.js", "285.index.js", "index.js"].map((path) => ({ path, sha256: sha(readFileSync(join(dir, "dist", path))), bytes: 1 }));
  put("dist/manifest.json", JSON.stringify({ kind: "build-manifest", files, bundle: { sha256: files[2].sha256 } }));
  return dir;
}

test("R3: the stage list is exactly the allowlist plus the build's own files, never a map", () => {
  const dir = fixture();
  try {
    const list = stageList(dir, allowlist, JSON.parse(readFileSync(join(dir, "dist", "manifest.json"), "utf8")));
    assert.ok(list.includes("dist/285.index.js") && list.includes("dist/index.js") && list.includes("examples/sun-ruins/Arin.png"));
    assert.ok(!list.some((path) => path.endsWith(".map") || path.startsWith("docs/") || path.startsWith("src/")));
    assert.deepEqual(neverIssues(list, allowlist), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("R3 control: a planted docs/ file, a map, a test file and opencode.json in a staged tree fail", () => {
  assert.deepEqual(neverIssues(["README.md", "docs/x.md", "dist/index.js.map", "examples/a.test.mjs", "opencode.json"], allowlist), [
    "docs/x.md is on the never list",
    "dist/index.js.map is on the never list",
    "examples/a.test.mjs is on the never list",
    "opencode.json is on the never list",
  ]);
  assert.deepEqual(allowlistIssues(["README.md", "docs/x.md"], ["README.md", "LICENSE"]), ["docs/x.md is staged but not allowlisted", "LICENSE is allowlisted but not staged"]);
});

test("R3: a missing required file is refused, a missing optional one is not", () => {
  const dir = fixture();
  try {
    rmSync(join(dir, "LICENSE"));
    assert.throws(() => stageList(dir, allowlist, JSON.parse(readFileSync(join(dir, "dist", "manifest.json"), "utf8"))), /LICENSE is allowlisted but missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("R6: every chunk the bundle loads has a staged file; control: a dropped chunk fails", () => {
  const bundle = 'c.e(146).then(()=>c.e(285));c.u=e=>e+".index.js"';
  assert.deepEqual(chunkIssues(bundle, ["dist/index.js", "dist/146.index.js", "dist/285.index.js"]), []);
  assert.deepEqual(chunkIssues(bundle, ["dist/index.js", "dist/146.index.js"]), ["the bundle loads chunk 285 but dist/285.index.js is not staged"]);
});

test("stageTree copies the list, and the zip holds the same names and bytes", () => {
  const dir = fixture();
  const out = mkdtempSync(join(tmpdir(), "so-artifact-out-"));
  try {
    const list = stageList(dir, allowlist, JSON.parse(readFileSync(join(dir, "dist", "manifest.json"), "utf8")));
    const staged = join(out, "story-orchestrator-0.0.0");
    stageTree(dir, staged, list);
    assert.deepEqual(walk(staged).sort(), [...list].sort());
    const zip = join(out, "a.zip");
    writeZip(list.map((path) => ({ name: `story-orchestrator/${path}`, data: readFileSync(join(staged, path)) })), zip);
    assert.deepEqual(readZipNames(readFileSync(zip)).map((entry) => entry.name).sort(), list.map((path) => `story-orchestrator/${path}`).sort());
    const entry = readZipNames(readFileSync(zip)).find((item) => item.name.endsWith("README.md"));
    const raw = readFileSync(zip).subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
    assert.equal((entry.method === 8 ? inflateRawSync(raw) : raw).toString(), "README.md");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("stage refuses a target that is not an ST extension slot or that holds the repo", () => {
  const st = mkdtempSync(join(tmpdir(), "so-st-"));
  try {
    const slot = join(st, "public", "scripts", "extensions", "third-party", "story-orchestrator");
    assert.match(targetIssues(st, root).join(), /src\/plugin-loader\.js/);
    mkdirSync(join(st, "src"), { recursive: true });
    writeFileSync(join(st, "src", "plugin-loader.js"), "");
    assert.deepEqual(targetIssues(st, root), []);
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, "manifest.json"), JSON.stringify({ display_name: "Something Else" }));
    assert.match(targetIssues(st, root).join(), /another extension/);
    writeFileSync(join(slot, "manifest.json"), JSON.stringify({ display_name: "Story Orchestrator" }));
    assert.deepEqual(targetIssues(st, root), []);
    assert.match(targetIssues(st, slot).join(), /the repo itself/);
    assert.match(targetIssues(st, join(slot, "nested")).join(), /the repo itself/);
    for (const foreign of [".git", "src", "package.json", "docs"]) {
      const path = join(slot, foreign);
      if (foreign.includes(".json")) writeFileSync(path, "{}"); else mkdirSync(path);
      assert.match(targetIssues(st, root).join(), new RegExp(`holds ${foreign.replace(".", "\\.")}, which a staged tree never has`), `a slot holding ${foreign} is a source checkout and must never be replaced`);
      rmSync(path, { recursive: true, force: true });
    }
    mkdirSync(join(slot, "dist"));
    mkdirSync(join(slot, "examples"));
    writeFileSync(join(slot, "README.md"), "");
    assert.deepEqual(targetIssues(st, root), [], "control: a previously staged tree is replaceable");
  } finally {
    rmSync(st, { recursive: true, force: true });
  }
});

const staged = join(root, "release");
const stagedDirs = existsSync(staged) ? readdirSync(staged, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(staged, entry.name)) : [];

test("R3: every staged release tree equals its allowlist", { skip: !stagedDirs.length && "no release/ tree: run npm run package" }, () => {
  for (const dir of stagedDirs) {
    const tree = walk(dir).filter((path) => path !== "release-manifest.json");
    const manifest = JSON.parse(readFileSync(join(dir, "release-manifest.json"), "utf8"));
    assert.deepEqual(neverIssues(tree, allowlist), []);
    assert.deepEqual(allowlistIssues(tree, manifest.files.map((file) => file.path)), []);
    assert.deepEqual(chunkIssues(readFileSync(join(dir, "dist", "index.js"), "utf8"), tree), []);
  }
});
