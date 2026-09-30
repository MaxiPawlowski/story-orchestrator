import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ST_ROOT_FILE = ".st-root";

export function configuredStRoot(env = process.env, repoRoot = REPO_ROOT) {
  const fromEnv = String(env.ST_ROOT ?? "").trim();
  if (fromEnv) return resolve(fromEnv);
  const file = join(repoRoot, ST_ROOT_FILE);
  if (!existsSync(file)) return null;
  const fromFile = readFileSync(file, "utf8").trim();
  return fromFile ? resolve(repoRoot, fromFile) : null;
}

export function stRootIssue(root) {
  if (!root) return `ST_ROOT is not set: set ST_ROOT or write the SillyTavern root into ${ST_ROOT_FILE} at the repo root; it is never derived`;
  if (!existsSync(join(root, "src", "plugin-loader.js"))) return `not a SillyTavern root (no src/plugin-loader.js): ${root}`;
  return null;
}

export function requireStRoot(env = process.env, repoRoot = REPO_ROOT) {
  const root = configuredStRoot(env, repoRoot);
  const issue = stRootIssue(root);
  if (issue) throw new Error(issue);
  return root;
}

export function lanesRootFor(env = process.env, repoRoot = REPO_ROOT) {
  const configured = String(env.SO_LANES_ROOT ?? "").trim();
  if (configured) return resolve(configured);
  const stRoot = configuredStRoot(env, repoRoot);
  if (!stRoot) throw new Error(stRootIssue(null));
  return resolve(stRoot, "..", "so-lanes");
}
