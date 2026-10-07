import type { GuideLink, GuideTarget } from "./types";

const SAFE_SCHEME = /^(https?:|mailto:)/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export const normalizePath = (path: string): string => {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length && out[out.length - 1] !== "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
};

const dirOf = (doc: string) => (doc.includes("/") ? doc.slice(0, doc.lastIndexOf("/")) : "");

export const docToId = (doc: string): string => doc.replace(/\.md$/, "");

export const targetForDoc = (doc: string): GuideTarget => {
  const [path, anchor] = doc.split("#");
  return anchor ? { id: docToId(path), anchor } : { id: docToId(path) };
};

export const resolveLink = (fromDoc: string, href: string, homePage: string): GuideLink => {
  const trimmed = href.trim();
  if (SAFE_SCHEME.test(trimmed)) return { kind: "external", url: trimmed };
  if (ANY_SCHEME.test(trimmed) || trimmed.startsWith("//")) return { kind: "none" };
  const [path, anchor] = trimmed.split("#");
  if (!path) return { kind: "page", target: anchor ? { id: docToId(fromDoc), anchor } : { id: docToId(fromDoc) } };
  const joined = normalizePath(`${dirOf(fromDoc)}/${path}`);
  if (joined.startsWith("..")) {
    const repoPath = normalizePath(`docs/guide/${joined}`);
    return homePage ? { kind: "external", url: `${homePage}/blob/master/${repoPath}${anchor ? `#${anchor}` : ""}` } : { kind: "none" };
  }
  if (!joined.endsWith(".md")) return { kind: "none" };
  return { kind: "page", target: anchor ? { id: docToId(joined), anchor } : { id: docToId(joined) } };
};

export const slugify = (text: string): string => text
  .toLowerCase()
  .replace(/[`*_~]/g, "")
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[^\p{L}\p{N}\s-]/gu, "")
  .trim()
  .replace(/\s/g, "-");

export const slugger = () => {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugify(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
};
