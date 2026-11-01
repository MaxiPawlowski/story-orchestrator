import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { configuredStRoot, lanesRootFor, REPO_ROOT, ST_ROOT_FILE } from "./stRoot.mjs";

export class LaneSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "LaneSafetyError";
  }
}

const fold = (path) => (process.platform === "win32" ? path.toLowerCase() : path);

export function isInside(child, parent) {
  const rel = relative(fold(parent), fold(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

const realOf = (path) => {
  try {
    return fs.realpathSync.native(path);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
};

export function realPathDeep(path, hops = 0) {
  if (hops > 32) throw new LaneSafetyError(`too many links resolving ${path}`);
  let current = resolve(path);
  const rest = [];
  for (;;) {
    const real = realOf(current);
    if (real !== null) return rest.length ? join(real, ...rest.slice().reverse()) : real;
    let link = null;
    try {
      if (fs.lstatSync(current).isSymbolicLink()) link = fs.readlinkSync(current);
    } catch {}
    if (link !== null) return realPathDeep(join(resolve(dirname(current), link), ...rest.slice().reverse()), hops + 1);
    const parent = dirname(current);
    if (parent === current) return resolve(path);
    rest.push(basename(current));
    current = parent;
  }
}

export function ownerStRoot(env = process.env, repoRoot = REPO_ROOT) {
  const fromEnv = String(env.SO_OWNER_ST_ROOT ?? "").trim();
  if (fromEnv) return resolve(fromEnv);
  const file = join(repoRoot, ST_ROOT_FILE);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8").trim();
  return text ? resolve(repoRoot, text) : null;
}

const dataDirsOf = (root) => [join(root, "data"), join(root, "data", "default-user")];

export function protectedRoots(env = process.env, repoRoot = REPO_ROOT) {
  const roots = [ownerStRoot(env, repoRoot), configuredStRoot(env, repoRoot)].filter(Boolean);
  const out = [];
  for (const root of roots) for (const dir of dataDirsOf(root)) {
    const real = realPathDeep(dir);
    if (!out.some((seen) => fold(seen) === fold(real))) out.push(real);
  }
  return out;
}

export function laneSafetyContext(env = process.env, repoRoot = REPO_ROOT) {
  const lanesRoot = lanesRootFor(env, repoRoot);
  return { lanesRoot, lanesReal: realPathDeep(lanesRoot), protected: protectedRoots(env, repoRoot), stRoots: [ownerStRoot(env, repoRoot), configuredStRoot(env, repoRoot)].filter(Boolean) };
}

export function protectedIssue(path, context) {
  const real = realPathDeep(path);
  const hit = context.protected.find((root) => isInside(real, root));
  return hit ? `${path} resolves to ${real}, inside the owner's SillyTavern data (${hit}); lane tooling never writes there` : null;
}

export function lanesRootIssue(context) {
  const inData = context.protected.find((root) => isInside(context.lanesReal, root));
  if (inData) return `the lanes root ${context.lanesRoot} resolves to ${context.lanesReal}, inside the owner's SillyTavern data (${inData})`;
  const inTree = context.stRoots.map((root) => realPathDeep(root)).find((root) => isInside(context.lanesReal, root));
  return inTree ? `the lanes root ${context.lanesRoot} resolves to ${context.lanesReal}, inside a SillyTavern tree (${inTree}) that serves public/ over HTTP` : null;
}

export function laneWriteIssue(path, context) {
  const root = lanesRootIssue(context);
  if (root) return root;
  const guarded = protectedIssue(path, context);
  if (guarded) return guarded;
  const real = realPathDeep(path);
  return isInside(real, context.lanesReal) ? null : `${path} resolves to ${real}, outside the lanes root ${context.lanesReal} (a junction or symlink, or a path that is not a lane's); refused`;
}

export function servedTreeIssue(stRoot, env = process.env, repoRoot = REPO_ROOT) {
  const treeReal = realPathDeep(stRoot);
  for (const dir of dataDirsOf(stRoot)) {
    if (!fs.existsSync(dir)) continue;
    const real = realPathDeep(dir);
    if (!isInside(real, treeReal)) return `the SillyTavern tree ${stRoot} has ${relative(stRoot, dir)} resolving to ${real}, outside the tree (a junction or symlink); lanes are seeded and served only from a tree whose data is its own`;
  }
  const owner = ownerStRoot(env, repoRoot);
  if (!owner || fold(realPathDeep(owner)) === fold(treeReal)) return null;
  const ownerData = realPathDeep(join(owner, "data"));
  const shared = dataDirsOf(stRoot).filter((dir) => fs.existsSync(dir)).map((dir) => realPathDeep(dir)).find((real) => isInside(real, ownerData));
  return shared ? `the SillyTavern tree ${stRoot} is not the owner's (${owner}) but its data resolves to ${shared}, the owner's data; refused` : null;
}

export function linksUnder(dir, limit = 200000) {
  const links = [];
  const stack = [dir];
  let seen = 0;
  while (stack.length && seen < limit) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) links.push(path);
      else if (entry.isDirectory()) stack.push(path);
    }
  }
  return links;
}

function recursiveRmIssue(path, context) {
  const links = linksUnder(path).map((link) => ({ link, real: realPathDeep(link) }));
  const bad = links.find(({ real }) => context.protected.some((root) => isInside(real, root)));
  return bad ? `${path} holds ${bad.link}, a link to ${bad.real} inside the owner's SillyTavern data; a recursive remove is refused` : null;
}

const WRITE_FLAGS = /[wa+]/;

function guardedFs(issueOf, contextOf) {
  const check = (path, extra = null) => {
    const context = contextOf();
    const issue = issueOf(String(path), context) ?? (extra ? extra(String(path), context) : null);
    if (issue) throw new LaneSafetyError(issue);
  };
  const rmCheck = (path, options) => check(path, options?.recursive ? recursiveRmIssue : null);
  const deref = (options) => ({ ...(options ?? {}), dereference: true });
  return {
    check,
    writeFile: async (path, ...args) => { check(path); return fsp.writeFile(path, ...args); },
    appendFile: async (path, ...args) => { check(path); return fsp.appendFile(path, ...args); },
    mkdir: async (path, ...args) => { check(path); return fsp.mkdir(path, ...args); },
    rm: async (path, options) => { rmCheck(path, options); return fsp.rm(path, options); },
    cp: async (source, dest, options) => { check(dest); await fsp.cp(source, dest, deref(options)); const links = linksUnder(dest); if (links.length) throw new LaneSafetyError(`copy into ${dest} left links (${links.slice(0, 3).join(", ")})`); },
    copyFile: async (source, dest, ...args) => { check(dest); return fsp.copyFile(source, dest, ...args); },
    rename: async (source, dest) => { check(source); check(dest); return fsp.rename(source, dest); },
    open: async (path, flags = "r", ...args) => { if (WRITE_FLAGS.test(String(flags))) check(path); return fsp.open(path, flags, ...args); },
    writeFileSync: (path, ...args) => { check(path); return fs.writeFileSync(path, ...args); },
    appendFileSync: (path, ...args) => { check(path); return fs.appendFileSync(path, ...args); },
    mkdirSync: (path, ...args) => { check(path); return fs.mkdirSync(path, ...args); },
    rmSync: (path, options) => { rmCheck(path, options); return fs.rmSync(path, options); },
    cpSync: (source, dest, options) => { check(dest); fs.cpSync(source, dest, deref(options)); },
    copyFileSync: (source, dest, ...args) => { check(dest); return fs.copyFileSync(source, dest, ...args); },
    renameSync: (source, dest) => { check(source); check(dest); return fs.renameSync(source, dest); },
    rmdirSync: (path) => { check(path); return fs.rmdirSync(path); },
    openSync: (path, flags = "r", ...args) => { if (WRITE_FLAGS.test(String(flags))) check(path); return fs.openSync(path, flags, ...args); },
    createWriteStream: (path, options) => { check(path); return fs.createWriteStream(path, options); },
  };
}

export const createLaneFs = (contextOf = () => laneSafetyContext()) => guardedFs(laneWriteIssue, contextOf);

const harnessContext = () => ({ protected: protectedRoots() });

export const createHarnessFs = (contextOf = harnessContext) => guardedFs(protectedIssue, contextOf);

export const laneFs = createLaneFs();

export const harnessFs = createHarnessFs();

export function assertServedTree(stRoot, env = process.env, repoRoot = REPO_ROOT) {
  const issue = servedTreeIssue(stRoot, env, repoRoot);
  if (issue) throw new LaneSafetyError(issue);
}

export function assertLaneDir(path, context = laneSafetyContext()) {
  const issue = laneWriteIssue(path, context);
  if (issue) throw new LaneSafetyError(issue);
}
