import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { serveDev } from "./serveFlavour.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");

function fixture({ flavor = "dev", files = { "index.js": "dev bundle", "111.index.js": "chunk", "index.js.map": "{}" }, extra = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "so-serve-"));
  const from = join(root, "dist-dev");
  const to = join(root, "dist");
  mkdirSync(from);
  mkdirSync(to);
  for (const [name, text] of Object.entries({ ...files, ...extra })) writeFileSync(join(from, name), text);
  const listed = Object.entries(files).map(([path, text]) => ({ path, sha256: sha(text), bytes: text.length }));
  writeFileSync(join(from, "manifest.json"), JSON.stringify({ kind: "build-manifest", flavor, bundle: { path: "dist/index.js", sha256: sha(files["index.js"] ?? "") }, files: listed }));
  writeFileSync(join(to, "index.js"), "prod bundle");
  writeFileSync(join(to, "222.index.js"), "stale prod chunk");
  writeFileSync(join(to, "manifest.json"), JSON.stringify({ kind: "build-manifest", flavor: "prod" }));
  return { root, from, to };
}

test("serveDev replaces dist/ with exactly the dev build, manifest included", () => {
  const { root, from, to } = fixture();
  try {
    const out = serveDev({ from, to });
    assert.deepEqual(readdirSync(to).sort(), ["111.index.js", "index.js", "index.js.map", "manifest.json"]);
    assert.equal(readFileSync(join(to, "index.js"), "utf8"), "dev bundle");
    assert.equal(JSON.parse(readFileSync(join(to, "manifest.json"), "utf8")).flavor, "dev");
    assert.equal(out.bundleSha256, sha("dev bundle"));
    assert.equal(out.files, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: a prod manifest in dist-dev/ is refused and dist/ is left alone", () => {
  const { root, from, to } = fixture({ flavor: "prod" });
  try {
    assert.throws(() => serveDev({ from, to }), /flavor is "prod", expected "dev"/);
    assert.equal(readFileSync(join(to, "index.js"), "utf8"), "prod bundle");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: a dev dir with a file its manifest does not name is refused", () => {
  const { root, from, to } = fixture({ extra: { "999.index.js": "stray" } });
  try {
    assert.throws(() => serveDev({ from, to }), /999\.index\.js is in the output dir but not in the manifest/);
    assert.ok(existsSync(join(to, "222.index.js")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: a dev file whose bytes differ from its manifest hash is refused", () => {
  const { root, from, to } = fixture();
  try {
    writeFileSync(join(from, "111.index.js"), "tampered");
    assert.throws(() => serveDev({ from, to }), /111\.index\.js does not match its manifest sha256/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: a missing dev build is refused with the command that makes it", () => {
  const root = mkdtempSync(join(tmpdir(), "so-serve-"));
  try {
    assert.throws(() => serveDev({ from: join(root, "dist-dev"), to: join(root, "dist") }), /npm run build:dev/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
