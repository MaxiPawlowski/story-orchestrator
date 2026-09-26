import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

export const loadAllowlist = (root) => JSON.parse(readFileSync(join(root, "scripts", "release", "artifact-allowlist.json"), "utf8"));

export const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

export const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path, base) : [relative(base, path).split(sep).join("/")];
});

export function stageList(root, allowlist, distManifest) {
  const missing = allowlist.files.filter((path) => !existsSync(join(root, path)));
  if (missing.length) throw new Error(missing.map((path) => `${path} is allowlisted but missing`).join("; "));
  const build = (distManifest?.files ?? []).map((file) => `dist/${file.path}`).filter((path) => !path.endsWith(".map"));
  return [...new Set([
    ...allowlist.files,
    ...allowlist.optional.filter((path) => existsSync(join(root, path))),
    ...allowlist.dirs.filter((dir) => existsSync(join(root, dir))).flatMap((dir) => walk(join(root, dir)).map((path) => `${dir}/${path}`)),
    ...build,
  ])].sort();
}

export const neverIssues = (paths, allowlist) => paths
  .filter((path) => allowlist.never.some((prefix) => path.startsWith(prefix)) || allowlist.neverPatterns.some((pattern) => new RegExp(pattern).test(path.split("/").pop())))
  .map((path) => `${path} is on the never list`);

export const allowlistIssues = (staged, expected) => {
  const want = new Set(expected);
  const have = new Set(staged);
  return [
    ...staged.filter((path) => !want.has(path)).map((path) => `${path} is staged but not allowlisted`),
    ...expected.filter((path) => !have.has(path)).map((path) => `${path} is allowlisted but not staged`),
  ];
};

export const chunkIssues = (bundle, staged) => [...new Set([...bundle.matchAll(/\.e\((\d+)\)/g)].map((match) => match[1]))]
  .filter((id) => !staged.includes(`dist/${id}.index.js`))
  .map((id) => `the bundle loads chunk ${id} but dist/${id}.index.js is not staged`);

export function stageTree(root, out, list) {
  for (const path of list) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    copyFileSync(join(root, path), join(out, path));
  }
}

const OWN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const stagedTopLevel = (allowlist) => new Set([...allowlist.files, ...allowlist.optional, ...allowlist.dirs, "dist/", "release-manifest.json"].map((path) => path.split("/")[0]));

export function targetIssues(stRoot, repoRoot, allowlist = loadAllowlist(OWN_ROOT)) {
  const issues = [];
  if (!existsSync(join(stRoot, "src", "plugin-loader.js"))) issues.push(`${stRoot} is not a SillyTavern root (no src/plugin-loader.js)`);
  const slot = resolve(stRoot, "public", "scripts", "extensions", "third-party", "story-orchestrator");
  const fromSlot = relative(slot, resolve(repoRoot));
  if (fromSlot === "" || !fromSlot.startsWith("..")) issues.push(`${slot} holds the repo itself; staging there would delete the source`);
  const manifest = join(slot, "manifest.json");
  if (existsSync(manifest)) {
    const name = (() => { try { return JSON.parse(readFileSync(manifest, "utf8")).display_name; } catch { return null; } })();
    if (name !== "Story Orchestrator") issues.push(`${slot} holds another extension (${name ?? "unreadable manifest"})`);
  }
  const allowed = stagedTopLevel(allowlist);
  const foreign = existsSync(slot) ? readdirSync(slot).filter((entry) => !allowed.has(entry)) : [];
  issues.push(...foreign.map((entry) => `${slot} holds ${entry}, which a staged tree never has: it is a source checkout or someone else's files, and stage never replaces it`));
  return issues;
}

const u16 = (value) => { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value); return buffer; };
const u32 = (value) => { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0); return buffer; };
const DOS_DATE = (1 << 5) | 1;

export function writeZip(entries, out) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const deflated = deflateRawSync(data);
    const method = deflated.length < data.length ? 8 : 0;
    const body = method === 8 ? deflated : data;
    const nameBytes = Buffer.from(name, "utf8");
    const common = [u16(20), u16(0x0800), u16(method), u16(0), u16(DOS_DATE), u32(crc32(data)), u32(body.length), u32(data.length), u16(nameBytes.length), u16(0)];
    const local = Buffer.concat([u32(0x04034b50), ...common, nameBytes, body]);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), ...common, u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]);
  writeFileSync(out, Buffer.concat([...locals, central, end]));
}

export function readZipNames(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    entries.push({ name, method, compressedSize, dataStart });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
