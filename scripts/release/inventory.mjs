import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MIRROR_PREFIX = "Story Orchestrator - ";
export const OWNER_COMMENT = "so-owner";
export const SETTINGS_KEY = "story-orchestrator";
export const JUDGE_SECRET_KEY = "typesafe_api_key";
export const PLUGINS = ["story-orchestrator-judge", "story-orchestrator-gpu", "story-orchestrator-harness"];

const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };
const list = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []);
const rel = (base, path) => relative(base, path).split(sep).join("/");

export function firstLine(path) {
  const fd = openSync(path, "r");
  try {
    const chunks = [];
    const buffer = Buffer.alloc(1 << 16);
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      const at = buffer.subarray(0, read).indexOf(10);
      if (at >= 0) { chunks.push(Buffer.from(buffer.subarray(0, at))); break; }
      chunks.push(Buffer.from(buffer.subarray(0, read)));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

const chatFiles = (dir) => list(dir).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return chatFiles(path);
  return entry.name.endsWith(".jsonl") ? [path] : [];
});

const carriesStory = (path) => {
  try {
    return Boolean(JSON.parse(firstLine(path))?.chat_metadata?.story_orchestrator);
  } catch {
    return false;
  }
};

export function inventory({ dataRoot, stRoot = null }) {
  const books = list(join(dataRoot, "worlds")).filter((entry) => entry.isFile() && entry.name.startsWith(MIRROR_PREFIX) && entry.name.endsWith(".json")).map((entry) => {
    const book = readJson(join(dataRoot, "worlds", entry.name));
    const owner = Object.values(book?.entries ?? {}).some((item) => item?.comment === OWNER_COMMENT);
    return { file: `worlds/${entry.name}`, owner };
  });
  const settings = readJson(join(dataRoot, "settings.json"));
  const root = settings?.extension_settings?.[SETTINGS_KEY] ?? null;
  const sessions = Array.isArray(root?.wizardSessions) ? root.wizardSessions : [];
  const chats = [["chats", "solo"], ["group chats", "group"]].flatMap(([dir, kind]) => chatFiles(join(dataRoot, dir)).filter(carriesStory).map((path) => ({ file: rel(dataRoot, path), kind })));
  const vectors = list(join(dataRoot, "vectors")).filter((entry) => entry.isDirectory()).flatMap((source) => list(join(dataRoot, "vectors", source.name)).filter((entry) => entry.isDirectory() && entry.name.startsWith("so_consol_")).map((entry) => `vectors/${source.name}/${entry.name}`));
  const secrets = readJson(join(dataRoot, "secrets.json"));
  const judgeKey = Boolean(secrets && (secrets[JUDGE_SECRET_KEY] !== undefined && secrets[JUDGE_SECRET_KEY] !== ""));
  const plugins = stRoot ? PLUGINS.filter((name) => existsSync(join(stRoot, "plugins", name))) : null;
  return {
    kind: "story-orchestrator-inventory",
    mirrorBooks: books,
    settings: root ? {
      keys: Object.keys(root).sort(),
      libraryStories: Array.isArray(root.v2Stories) ? root.v2Stories.length : 0,
      wizardSessions: sessions.length,
      wizardAssets: [...new Set(sessions.flatMap((session) => (Array.isArray(session?.applied) ? session.applied : [])))].sort(),
      wizardLorebooks: [...new Set(sessions.flatMap((session) => (Array.isArray(session?.createdLorebooks) ? session.createdLorebooks : [])))].sort(),
    } : null,
    chats,
    judgeKey,
    transientVectors: vectors,
    plugins,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argValue = (name) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
  const dataRoot = argValue("--data-root");
  if (!dataRoot || !existsSync(dataRoot) || !statSync(dataRoot).isDirectory()) {
    console.error("usage: node scripts/release/inventory.mjs --data-root <ST data>/<user> [--st-root <SillyTavern root>]   (read-only; never prints a secret value)");
    process.exit(1);
  }
  console.log(JSON.stringify(inventory({ dataRoot: resolve(dataRoot), stRoot: argValue("--st-root") ? resolve(argValue("--st-root")) : null }), null, 2));
}
