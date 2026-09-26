// v2.3 plan 08. The BUILD manifest: the facts a build can know about the bytes it just produced.
// It is not the acceptance attestation (plan 11 writes that under docs/release/<version>/) — a build
// can exist without ever being run, and an attestation names exactly one build — and it is not ST's
// own `manifest.json` at the extension root, which tells SillyTavern what to load.
//
// The two hashes are the point. `bundle.sha256` is the emitted file. `source.sha256` is over the
// inputs the bundle was made of, so a tracked bundle that does not match the tree it claims to come
// from is detectable without a commit: commit ancestry proves nothing about bytes.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAVOURS } from "./buildChecks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const argValue = (name) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const flavor = argValue("--flavor") ?? "prod";
if (!(flavor in FLAVOURS)) throw new Error(`unknown --flavor ${flavor}: expected one of ${Object.keys(FLAVOURS).join(", ")}`);
const dist = join(root, argValue("--out") ?? FLAVOURS[flavor]);
const OUT = join(dist, "manifest.json");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Every source input the bundle is built from, sorted so the hash does not depend on the filesystem. */
function sourceFiles(dir = join(root, "src"), out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { sourceFiles(path, out); continue; }
    if (!/\.(tsx?|css)$/.test(entry.name) || /\.(test|stories)\.tsx?$/.test(entry.name)) continue;
    out.push(path);
  }
  return out;
}

const configFiles = ["webpack.config.js", "postcss.config.js", "tsconfig.json", "package.json", "manifest.json"]
  .map((name) => join(root, name))
  .filter((path) => existsSync(path));

const sourceManifest = [...sourceFiles(), ...configFiles]
  .map((path) => `${relative(root, path).replace(/\\/g, "/")}  ${sha256(readFileSync(path))}`)
  .sort()
  .join("\n");

/** The SillyTavern checkout this build was made against: ST_PUBLIC when set (an out-of-tree checkout),
 *  otherwise the tree this extension is sitting inside. */
const stPublic = process.env.ST_PUBLIC ? resolve(process.env.ST_PUBLIC) : resolve(root, "..", "..", "..", "..", "..", "public");
const stRoot = dirname(stPublic);

/** The host files this extension actually loads: every `importSTModule` call site, so the list
 *  maintains itself as seams are added instead of drifting from a table somebody has to remember. */
function hostFiles() {
  const seams = join(root, "src", "services", "stHost");
  const paths = new Set();
  for (const entry of readdirSync(seams).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
    const text = readFileSync(join(seams, entry), "utf8");
    for (const match of text.matchAll(/importSTModule<[^>]*>\(\s*"([^"]+)"/g)) paths.add(match[1]);
  }
  const hashes = {};
  for (const hostPath of [...paths].sort()) {
    const file = join(stPublic, hostPath.replace(/^\//, ""));
    hashes[hostPath] = existsSync(file) ? sha256(readFileSync(file)) : null;
  }
  return hashes;
}

/** The capability ids this build requires, read from the one place they are declared. */
function capabilityIds() {
  const text = readFileSync(join(root, "src", "services", "stHost", "capabilities.ts"), "utf8");
  const union = /export type CapabilityId =([^;]+);/.exec(text);
  const ids = union ? [...union[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]) : [];
  if (!ids.length) throw new Error("could not read CapabilityId from stHost/capabilities.ts — the manifest would claim an empty capability list");
  return ids;
}

const git = (cwd, ...args) => {
  try {
    return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
};

const revision = (cwd) => {
  const commit = git(cwd, "rev-parse", "HEAD");
  if (!commit) return null;
  const status = git(cwd, "status", "--porcelain", "--", ".");
  return { commit, dirty: status === null ? null : status.length > 0 };
};

const pkg = readJson(join(root, "package.json"));
const stPkg = existsSync(join(stRoot, "package.json")) ? readJson(join(stRoot, "package.json")) : null;
const bundle = join(dist, "index.js");
if (!existsSync(bundle)) throw new Error(`${relative(root, bundle)} is missing — run this after webpack, not instead of it`);

const emitted = readdirSync(dist).filter((name) => name !== "manifest.json" && statSync(join(dist, name)).isFile()).sort()
  .map((name) => ({ path: name, sha256: sha256(readFileSync(join(dist, name))), bytes: statSync(join(dist, name)).size }));

const manifest = {
  kind: "build-manifest",
  flavor,
  extension: { name: pkg.name, version: pkg.version, revision: revision(root) },
  builtAt: new Date().toISOString(),
  bundle: { path: "dist/index.js", sha256: sha256(readFileSync(bundle)), bytes: statSync(bundle).size },
  files: emitted,
  source: { algorithm: "sha256", files: sourceManifest.split("\n").length, sha256: sha256(sourceManifest) },
  host: {
    version: stPkg?.version ?? null,
    commit: process.env.ST_COMMIT ?? revision(stRoot)?.commit ?? null,
    files: hostFiles(),
  },
  capabilities: capabilityIds(),
  environment: { node: process.version, typescript: pkg.devDependencies?.typescript ?? null },
};

writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`build manifest → ${relative(root, OUT)} (bundle ${manifest.bundle.sha256.slice(0, 12)}, source ${manifest.source.sha256.slice(0, 12)}, ST ${manifest.host.version ?? "unknown"})`);
