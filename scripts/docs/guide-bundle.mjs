#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GUIDE_DIR = join(root, "docs", "guide");
export const GUIDE_OUT = join(root, "src", "guide", "pages.generated.ts");

const AUDIENCE = { player: "player", setup: "setup", author: "author" };

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

export const render = (pages) => [
  "import type { GuidePage } from \"./types\";",
  "",
  `export const GUIDE_PAGES: GuidePage[] = ${JSON.stringify(pages, null, 1)};`,
  "",
].join("\n");

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pages = buildGuide();
  writeFileSync(GUIDE_OUT, render(pages));
  console.log(`guide: ${pages.length} pages -> ${relative(root, GUIDE_OUT)}`);
}

const LEAKS = [/\b[A-Za-z]:[\\/](?![\\/])/, /docs\/plans\//, /\bso-lanes\b/, /\.debug[\\/]/, /test\/sessions\//];

export const leaksIn = (pages) => pages.flatMap((page) => LEAKS
  .filter((pattern) => pattern.test(page.body))
  .map((pattern) => `${page.doc}: ${pattern}`));
