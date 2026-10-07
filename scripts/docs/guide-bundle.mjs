#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GUIDE_DIR = join(root, "docs", "guide");
export const GUIDE_OUT = join(root, "src", "guide", "pages.generated.ts");

export const ASSET_DIR = join(GUIDE_DIR, "assets");
export const ASSET_MAX_BYTES = 150_000;

const AUDIENCE = { player: "player", setup: "setup", author: "author" };
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const ASSET_FILE = /^assets\/[A-Za-z0-9][A-Za-z0-9_-]*\.(png|jpe?g|webp)$/;

export const slugify = (text) => text
  .toLowerCase()
  .replace(/[`*_~]/g, "")
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[^\p{L}\p{N}\s-]/gu, "")
  .trim()
  .replace(/\s/g, "-");

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return walk(path);
  return entry.name.endsWith(".md") ? [path] : [];
});

export const headingsOf = (body) => {
  const seen = new Map();
  const headings = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const match = !fenced && /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = slugify(match[2]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    headings.push({ level: match[1].length, text: match[2].trim(), slug: count ? `${base}-${count}` : base });
  }
  return headings;
};

export const pageId = (doc) => doc.replace(/\.md$/, "");

export const buildGuide = (dir = GUIDE_DIR) => walk(dir)
  .map((file) => relative(dir, file).split("\\").join("/"))
  .sort()
  .map((doc) => {
    const body = readFileSync(join(dir, doc), "utf8").replace(/\r\n/g, "\n");
    const headings = headingsOf(body);
    const top = doc.split("/")[0];
    return { id: pageId(doc), doc, audience: AUDIENCE[top] ?? "player", title: headings[0]?.text ?? doc, headings, body };
  });

export const buildAssets = (dir = ASSET_DIR) => (existsSync(dir) ? readdirSync(dir).sort() : [])
  .filter((name) => statSync(join(dir, name)).isFile())
  .map((name) => {
    const bytes = readFileSync(join(dir, name));
    const extension = /\.([a-z]+)$/i.exec(name)?.[1].toLowerCase() ?? "";
    return { path: `assets/${name}`, bytes: bytes.length, mime: MIME[extension] ?? null, data: bytes.toString("base64") };
  });

export const assetPath = (doc, src) => {
  const trimmed = src.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || /^[/\\]/.test(trimmed) || /[?#\\]/.test(trimmed)) return null;
  const path = posix.normalize(posix.join(posix.dirname(doc), trimmed));
  return ASSET_FILE.test(path) ? path : null;
};

export const imageProblems = (pages, assets) => {
  const known = new Set(assets.map((asset) => asset.path));
  const used = new Set();
  const problems = [];
  for (const page of pages) {
    for (const [, alt, src] of page.body.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)) {
      const path = assetPath(page.doc, src);
      if (!alt.trim()) problems.push(`${page.doc}: image ${src} has no alt text`);
      if (!path) problems.push(`${page.doc}: image ${src} is not in docs/guide/assets`);
      else if (!known.has(path)) problems.push(`${page.doc}: image ${src} does not exist`);
      else used.add(path);
    }
  }
  for (const asset of assets) {
    if (!ASSET_FILE.test(asset.path) || !asset.mime) problems.push(`${asset.path}: not a png, jpg or webp file`);
    if (asset.bytes > ASSET_MAX_BYTES) problems.push(`${asset.path}: ${asset.bytes} B, over the ${ASSET_MAX_BYTES} B limit (compress it)`);
    if (!used.has(asset.path)) problems.push(`${asset.path}: no page uses it`);
  }
  return problems;
};

export const brokenLinks = (pages) => {
  const byDoc = new Map(pages.map((page) => [page.doc, page]));
  const broken = [];
  for (const page of pages) {
    for (const match of page.body.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^[a-z]+:/i.test(target)) continue;
      const [path, anchor] = target.split("#");
      const doc = path ? posix.normalize(posix.join(posix.dirname(page.doc), path)) : page.doc;
      const hit = byDoc.get(doc);
      if (!doc.endsWith(".md") || doc.startsWith("../")) continue;
      if (!hit) broken.push(`${page.doc} -> ${target}`);
      else if (anchor && !hit.headings.some((heading) => heading.slug === anchor)) broken.push(`${page.doc} -> ${target} (no heading)`);
    }
  }
  return broken;
};

export const render = (pages, assets = buildAssets()) => [
  "import type { GuidePage } from \"./types\";",
  "",
  `export const GUIDE_PAGES: GuidePage[] = ${JSON.stringify(pages, null, 1)};`,
  "",
  `export const GUIDE_ASSETS: Record<string, string> = ${JSON.stringify(Object.fromEntries(assets.map((asset) => [asset.path, `data:${asset.mime};base64,${asset.data}`])), null, 1)};`,
  "",
].join("\n");

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pages = buildGuide();
  const assets = buildAssets();
  writeFileSync(GUIDE_OUT, render(pages, assets));
  console.log(`guide: ${pages.length} pages, ${assets.length} images -> ${relative(root, GUIDE_OUT)}`);
}

const LEAKS = [/\b[A-Za-z]:[\\/](?![\\/])/, /docs\/plans\//, /\bso-lanes\b/, /\.debug[\\/]/, /test\/sessions\//];

export const leaksIn = (pages) => pages.flatMap((page) => LEAKS
  .filter((pattern) => pattern.test(page.body))
  .map((pattern) => `${page.doc}: ${pattern}`));
