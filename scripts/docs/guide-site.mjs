#!/usr/bin/env node
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { ASSET_DIR, buildAssets } from "./guide-bundle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SITE_OUT = join(root, ".guide-site");
const SOURCES = ["types.ts", "links.ts", "markdown.ts", "GuideMarkdown.tsx", "pages.generated.ts"];
const AUDIENCE_LABELS = { player: "Playing", setup: "Setup", author: "Writing stories" };
const AUDIENCE_ORDER = ["player", "setup", "author"];
const SITE_TITLE = "Story Orchestrator guide";

const compileRenderer = () => {
  const build = mkdtempSync(join(root, ".guide-site-build-"));
  for (const file of SOURCES) {
    const source = readFileSync(join(root, "src", "guide", file), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false },
      fileName: file,
    });
    const rewritten = outputText.replace(/from "\.\/([A-Za-z.]+)"/g, (_match, name) => `from "./${name.replace(/\.tsx?$/, "")}.mjs"`);
    writeFileSync(join(build, file.replace(/\.tsx?$/, ".mjs")), rewritten);
  }
  return build;
};

export const fileFor = (id) => (id === "README" ? "index.html" : id.endsWith("/README") ? `${id.slice(0, -"README".length)}index.html` : `${id}.html`);

export const relativeHref = (fromId, target) => {
  const from = posix.dirname(fileFor(fromId));
  const to = fileFor(target.id);
  const path = posix.relative(from, to) || posix.basename(to);
  return target.anchor ? `${path}#so-guide-h-${target.anchor}` : path;
};

const escapeHtml = (text) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const rank = (page) => (page.id.endsWith("README") ? 0 : page.id.includes("/topics/") ? 2 : 1);

const navFor = (pages, currentId) => AUDIENCE_ORDER.map((audience) => {
  const items = pages.filter((page) => page.audience === audience).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  const links = items.map((page) => {
    const href = relativeHref(currentId, { id: page.id });
    const current = page.id === currentId ? ' aria-current="page"' : "";
    return `<li><a href="${escapeHtml(href)}"${current}>${escapeHtml(page.title)}</a></li>`;
  }).join("");
  return `<section><h2>${AUDIENCE_LABELS[audience]}</h2><ul>${links}</ul></section>`;
}).join("");

const STYLE = `
:root{--bg:#fbfaf7;--fg:#1d1d1f;--muted:#5d5d63;--line:#dedbd2;--accent:#7a3e9d;--code:#efece4}
@media (prefers-color-scheme:dark){:root{--bg:#17161a;--fg:#ecebe8;--muted:#a7a6ad;--line:#34323a;--accent:#c79bea;--code:#25232a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent)}header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
header strong{font-size:1.05rem}header input{flex:1;min-width:180px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit;font:inherit}
.layout{display:flex;max-width:1200px;margin:0 auto}nav{width:260px;flex-shrink:0;padding:16px;border-right:1px solid var(--line);font-size:.9rem}
nav h2{margin:16px 0 4px;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}nav ul{list-style:none;margin:0;padding:0}
nav li a{display:block;padding:2px 4px;border-radius:4px;text-decoration:none;color:var(--fg)}nav li a[aria-current]{font-weight:600;background:var(--code)}
main{flex:1;min-width:0;padding:16px 24px 64px}main img{max-width:100%;height:auto;border-radius:6px}main h2{font-size:1.7rem;margin:.4em 0}main h3{font-size:1.25rem;margin-top:1.4em}main h4,main h5,main h6{font-size:1.05rem}
code{background:var(--code);padding:0 .25em;border-radius:4px;font-size:.88em}pre{background:var(--code);padding:12px;border-radius:6px;overflow-x:auto}pre code{padding:0}
table{border-collapse:collapse;display:block;overflow-x:auto;font-size:.92rem}th,td{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}
blockquote{margin:0;padding-left:12px;border-left:3px solid var(--line);color:var(--muted)}#results{list-style:none;padding:0}#results li{margin:0 0 12px}#results small{display:block;color:var(--muted)}
footer{color:var(--muted);font-size:.85rem;margin-top:48px}
@media (max-width:760px){.layout{display:block}nav{width:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:16px}}
`;

const SEARCH = `
(()=>{const box=document.getElementById("q"),main=document.querySelector("main"),page=main.innerHTML,base=document.body.dataset.base;let index=null;
const run=async()=>{const words=box.value.toLowerCase().split(/\\s+/).filter(Boolean);if(!words.length){main.innerHTML=page;return;}
index=index||await (await fetch(base+"search-index.json")).json();const hits=index.filter(e=>words.every(w=>(e.title+" "+e.text).toLowerCase().includes(w)))
.map(e=>({e,score:words.reduce((s,w)=>s+(e.title.toLowerCase().includes(w)?6:0)+Math.min(5,e.text.toLowerCase().split(w).length-1),0)})).sort((a,b)=>b.score-a.score);
const list=document.createElement("ul");list.id="results";for(const {e} of hits){const li=document.createElement("li"),a=document.createElement("a"),s=document.createElement("small");
a.href=base+e.url;a.textContent=e.title;s.textContent=e.text.slice(0,160)+"…";li.append(a,s);list.append(li);}
main.replaceChildren(hits.length?list:Object.assign(document.createElement("p"),{textContent:"No page matches. Try another word."}));};
box.addEventListener("input",run);})();
`;

const pageHtml = ({ title, nav, content, base, home }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title === SITE_TITLE ? SITE_TITLE : `${escapeHtml(title)} · ${SITE_TITLE}`}</title><style>${STYLE}</style></head>
<body data-base="${base}"><header><strong><a href="${base}index.html">Story Orchestrator guide</a></strong>
<input id="q" type="search" placeholder="Search the guide" aria-label="Search the guide"><a href="${escapeHtml(home)}">GitHub</a></header>
<div class="layout"><nav aria-label="Pages">${nav}</nav><main>${content}<footer>Generated from <code>docs/guide</code>. The same pages ship inside the extension: Help → Open the guide.</footer></main></div>
<script>${SEARCH}</script></body></html>
`;

export async function buildSite({ out = SITE_OUT, homePage = "https://github.com/MaxiPawlowski/story-orchestrator" } = {}) {
  const build = compileRenderer();
  const load = (name) => import(pathToFileURL(join(build, name)).href);
  const [{ GuideMarkdown }, { GUIDE_PAGES }, { plainText }, React, { renderToStaticMarkup }] = await Promise.all([
    load("GuideMarkdown.mjs"), load("pages.generated.mjs"), load("markdown.mjs"), import("react"), import("react-dom/server"),
  ]);
  rmSync(out, { recursive: true, force: true });
  const assets = buildAssets();
  mkdirSync(join(out, "assets"), { recursive: true });
  for (const asset of assets) copyFileSync(join(ASSET_DIR, posix.basename(asset.path)), join(out, asset.path));
  const known = new Set(assets.map((asset) => asset.path));
  const index = [];
  for (const page of GUIDE_PAGES) {
    const file = fileFor(page.id);
    const depth = file.split("/").length - 1;
    const base = depth ? "../".repeat(depth) : "./";
    const content = renderToStaticMarkup(React.createElement(GuideMarkdown, {
      doc: page.doc, body: page.body, homePage, hrefFor: (target) => relativeHref(page.id, target),
      assetSrc: (asset) => (known.has(asset) ? posix.relative(posix.dirname(file), asset) : undefined),
    }));
    const target = join(out, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, pageHtml({ title: page.title, nav: navFor(GUIDE_PAGES, page.id), content, base, home: homePage }));
    index.push({ id: page.id, title: page.title, url: file, text: plainText(page.body).replace(/\s+/g, " ").slice(0, 4000) });
  }
  writeFileSync(join(out, "search-index.json"), JSON.stringify(index));
  writeFileSync(join(out, ".nojekyll"), "");
  rmSync(build, { recursive: true, force: true });
  return { pages: GUIDE_PAGES.length, out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pages, out } = await buildSite();
  console.log(`guide site: ${pages} pages -> ${relative(root, out)}`);
}
