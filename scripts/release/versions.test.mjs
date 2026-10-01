import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { changelogTopVersion, releaseMode, tagIssues, versionIssues } from "./buildChecks.mjs";
import { gitBashCandidates, resolveGitBash } from "./gitBash.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const headTags = () => {
  try {
    return execFileSync("git", ["tag", "--points-at", "HEAD"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
};
const current = () => ({
  pkg: readJson("package.json").version,
  loader: readJson("manifest.json").version,
  build: existsSync(join(root, "dist", "manifest.json")) ? readJson("dist/manifest.json").extension.version : undefined,
  changelog: changelogTopVersion(changelog),
});

test("R4: package.json, manifest.json, dist/manifest.json and the top CHANGELOG heading name one version", () => {
  assert.deepEqual(versionIssues(current()), []);
});

test("R4 control: a changelog heading one version behind fails", () => {
  assert.equal(changelogTopVersion("# Changelog\n\nintro\n\n## 2.3.0\n\n### x\n## 2.2.0\n"), "2.3.0");
  assert.deepEqual(versionIssues({ ...current(), changelog: "0.0.0" }), [`CHANGELOG.md top heading 0.0.0 != package.json ${current().pkg}`]);
  assert.deepEqual(versionIssues({ ...current(), build: undefined }), [], "a tree with no build yet is checked on the source fields only");
  assert.equal(versionIssues({ ...current(), loader: "9.9.9" }).length, 1);
});

test("R4 release mode: HEAD carries the v<version> tag", { skip: !releaseMode(process.env, headTags()) && "not release mode: HEAD has no v* tag and npm_config_release/SO_RELEASE is unset" }, () => {
  assert.deepEqual(tagIssues(headTags(), current().pkg), []);
});

test("R4 release-mode controls: --release on an untagged HEAD fails, a pre-release tag counts, a stray tag does not", () => {
  assert.equal(releaseMode({ npm_config_release: "true" }, []), true);
  assert.equal(releaseMode({ SO_RELEASE: "1" }, []), true);
  assert.equal(releaseMode({}, ["v2.5.0"]), true);
  assert.equal(releaseMode({}, ["wip"]), false);
  assert.deepEqual(tagIssues([], "2.5.0"), ["release mode but HEAD carries no tag v2.5.0"]);
  assert.deepEqual(tagIssues(["v2.5.0-rc.1"], "2.5.0-rc.1"), []);
  assert.deepEqual(tagIssues(["v2.4.0"], "2.5.0"), ["release mode but HEAD carries no tag v2.5.0 (it carries v2.4.0)"]);
});

const cleanHost = (name) => readFileSync(join(root, "scripts", "release", name), "utf8");
const bash = resolveGitBash();

test("UP: clean-host.sh keeps a pre-release suffix in the version it files its record under", { skip: !bash && "no bash" }, () => {
  const line = cleanHost("clean-host.sh").split(/\r?\n/).find((text) => text.startsWith("VERSION="));
  const dir = mkdtempSync(join(tmpdir(), "so-clean-host-"));
  try {
    const parse = (version) => {
      writeFileSync(join(dir, "package.json"), `{\n  "name": "x",\n  "version": "${version}",\n  "private": true\n}\n`);
      return spawnSync(bash, ["-c", `${line}\nprintf %s "$VERSION"`], { env: { ...process.env, EXT_DIR: dir.replace(/\\/g, "/") }, encoding: "utf8" }).stdout;
    };
    assert.equal(parse("2.5.0-rc.1"), "2.5.0-rc.1");
    assert.equal(parse("2.5.0"), "2.5.0");
    assert.notEqual("2.5.0-rc.1".replace(/[^0-9.]/g, ""), "2.5.0-rc.1", "control: the old sed turned rc.1 into 2.5.0.1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Q2t: both clean-host scripts run every machine gate by default", () => {
  const gates = ["typecheck", "typecheck-test", "lint", "test", "build", "build-dev", "release", "debug", "plugin", "storybook"];
  const sh = /^GATES="([^"]+)"/m.exec(cleanHost("clean-host.sh"))?.[1].split(",");
  const ps = /\[string\]\$Gates = "([^"]+)"/.exec(cleanHost("clean-host.ps1"))?.[1].split(",");
  assert.deepEqual(sh, gates);
  assert.deepEqual(ps, gates);
  for (const gate of gates) {
    assert.match(cleanHost("clean-host.sh"), new RegExp(`\\*,${gate},\\*\\) run_gate`), `clean-host.sh selects ${gate} but never runs it`);
    assert.match(cleanHost("clean-host.ps1"), new RegExp(`-contains "${gate}"`), `clean-host.ps1 selects ${gate} but never runs it`);
  }
});

test("UP: on Windows the clean-host check runs Git Bash by path, never the WSL bash that PowerShell finds first", () => {
  const candidates = gitBashCandidates({ ProgramFiles: "C:\\Program Files", GIT_BASH: "D:\\tools\\bash.exe" }, "win32");
  assert.equal(candidates[0], "D:\\tools\\bash.exe");
  assert.ok(candidates.includes(join("C:\\Program Files", "Git", "bin", "bash.exe")));
  assert.ok(!candidates.includes("bash"), "a bare `bash` resolves to C:\\Windows\\System32\\bash.exe (WSL) from PowerShell");
  assert.deepEqual(gitBashCandidates({}, "linux"), ["bash"]);
  if (process.platform === "win32") assert.ok(!bash || !/System32/i.test(bash), `resolved ${bash}`);
});
