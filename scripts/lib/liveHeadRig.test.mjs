import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { contained, packageHead, root, runRig } from "../live-head/rig.mjs";
import { reviewRig } from "../live-head/review.mjs";

const data = JSON.parse(readFileSync(join(root, "src/sprites/liveHead/syntheticHead.json"), "utf8"));
const png = (value) => Buffer.from(value.split(",")[1], "base64");
const identity = { member: "shape", look: "default", source: "/characters/Shape/neutral.png" };
function project() {
  const projects = contained(".live-head-projects"); mkdirSync(projects, { recursive: true });
  const path = mkdtempSync(join(projects, "tool-test-"));
  writeFileSync(join(path, "source.png"), png(data.source));
  writeFileSync(join(path, "rig.draft.json"), JSON.stringify(data.rig));
  return path;
}
const remove = (path) => rmSync(contained(path), { recursive: true });

test("CPU package validates identity, hashes source and embeds precisely nine owned PNGs; never overwrites", async () => {
  const path = project();
  try {
    mkdirSync(join(path, "built"));
    writeFileSync(join(path, "rig.json"), JSON.stringify(data.rig));
    writeFileSync(join(path, "built/layers.json"), JSON.stringify({ layers: Object.fromEntries(data.layers.map((layer) => [layer.name, layer.rect])) }));
    for (const layer of data.layers) writeFileSync(join(path, "built", `${layer.name}.png`), png(layer.image));
    const output = await packageHead(path, identity), manifest = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(manifest.artHash, data.artHash); assert.equal(manifest.layers.length, 9);
    assert.deepEqual(manifest.layers, data.layers); assert.equal(manifest.source, identity.source);
    await assert.rejects(packageHead(path, identity), /exists/);
  } finally { remove(path); }
});

test("tool paths refuse a parent, absolute escape and the junctioned dependencies", () => {
  assert.throws(() => contained(".."), /worktree/);
  assert.throws(() => contained(join(root, "../outside-head")), /worktree/);
  if (relative(root, realpathSync(join(root, "node_modules"))).startsWith(".."))
    assert.throws(() => contained("node_modules/new-head"), /worktree/);
});

test("review steps invoke only installed CPU Python scripts, pass explicit output paths, and surface missing dependencies", async () => {
  const path = project(), calls = [];
  const launch = (...args) => { calls.push(args); return { status: 0 }; };
  try {
    await runRig(["grid", path, "--step", "5", "--region", "20,20,90,90"], launch);
    await runRig(["overlay", path], launch);
    await runRig(["calibration", path], launch);
    assert.equal(calls.length, 3);
    for (const [binary, args, options] of calls) {
      assert.equal(binary, "python"); assert.equal(options.shell, false);
      assert.match(args[0], /vendor/); assert.equal(options.cwd, root);
      assert.ok(args.some((arg) => arg.startsWith(path)));
    }
    await assert.rejects(runRig(["overlay", path], () => ({ status: 1 })), /no dependencies are installed/);
    await assert.rejects(runRig(["grid", path, "--unknown", "yes"], launch), /Unknown/);
    await assert.rejects(runRig(["build", path, "--member", "shape", "--look", "default", "--source-url", "https://external/art.png"], launch), /local source/);
    assert.equal(calls.length, 3);
  } finally { remove(path); }
});

test("review image names, part and zoom options pass through; unsafe names refuse before any script runs", async () => {
  const path = project(), calls = [];
  const launch = (...args) => { calls.push(args); return { status: 0 }; };
  try {
    await runRig(["grid", path, "--step", "5", "--region", "20,20,90,90", "--name", "grid-eyes"], launch);
    await runRig(["overlay", path, "--part", "eyes", "--zoom", "true", "--name", "overlay-eyes"], launch);
    assert.ok(calls[0][1].some((arg) => arg.endsWith("grid-eyes.png")));
    assert.ok(calls[1][1].includes("--part") && calls[1][1].includes("eyes") && calls[1][1].includes("--zoom"));
    assert.ok(calls[1][1].some((arg) => arg.endsWith("overlay-eyes.png")));
    await assert.rejects(runRig(["grid", path, "--name", "../escape"], launch), /letters, digits/);
    assert.equal(calls.length, 2);
  } finally { remove(path); }
});

test("validate accepts the owned synthetic draft and names the first problem of a broken one", async () => {
  const path = project();
  try {
    assert.match(await runRig(["validate", path]), /valid/);
    const broken = JSON.parse(readFileSync(join(path, "rig.draft.json"), "utf8"));
    broken.eyes = [broken.eyes[0]];
    writeFileSync(join(path, "rig.draft.json"), JSON.stringify(broken));
    await assert.rejects(runRig(["validate", path]), /eyes/);
  } finally { remove(path); }
});

test("pose review refuses an unsafe round name and a project that was never packaged", async () => {
  const path = project();
  try {
    await assert.rejects(reviewRig(path, "../escape"), /round/);
    await assert.rejects(reviewRig(path, "r1"), /package/);
  } finally { remove(path); }
});
