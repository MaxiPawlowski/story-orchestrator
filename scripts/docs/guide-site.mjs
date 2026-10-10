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

const HOME_IDS = ["README", "quick-start"];
const HOME_LABELS = { README: "Home", "quick-start": "Quick start" };
const PAGE_ORDER = [
  "player/README", "player/playing", "player/drawer-and-hud", "player/memory", "player/troubleshooting",
  "setup/README", "setup/models", "setup/memory-model", "setup/judge", "setup/images", "setup/sprites", "setup/harness", "setup/settings-reference",
  "author/README", "author/step-by-step", "author/how-a-story-plays", "author/good-practices", "author/wizard", "author/studio", "author/macros-and-commands",
];

const orderOf = (page) => {
  const at = PAGE_ORDER.indexOf(page.id);
  return at < 0 ? PAGE_ORDER.length : at;
};

export const topicGroups = (pages) => {
  const readme = pages.find((page) => page.id === "author/README");
  if (!readme) return [];
  const groups = [];
  let group = null;
  for (const line of readme.body.split("\n")) {
    const heading = /^### (.+)$/.exec(line);
    if (heading) groups.push(group = { title: heading[1].trim(), ids: [] });
    const topic = /\]\(topics\/([a-z0-9-]+)\.md\)/.exec(line);
    if (topic && group) group.ids.push(`author/topics/${topic[1]}`);
  }
  const listed = new Set(groups.flatMap((entry) => entry.ids));
  const rest = pages.filter((page) => page.id.startsWith("author/topics/") && !listed.has(page.id)).map((page) => page.id);
  return rest.length ? [...groups, { title: "More topics", ids: rest }] : groups;
};

const navLink = (currentId, page, label = page.title) => {
  const href = relativeHref(currentId, { id: page.id });
  const current = page.id === currentId ? ' aria-current="page"' : "";
  return `<li><a href="${escapeHtml(href)}"${current}>${escapeHtml(label)}</a></li>`;
};

export const navFor = (pages, currentId) => {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const home = HOME_IDS.filter((id) => byId.has(id)).map((id) => navLink(currentId, byId.get(id), HOME_LABELS[id])).join("");
  const sections = AUDIENCE_ORDER.map((audience) => {
    const items = pages
      .filter((page) => page.audience === audience && !HOME_IDS.includes(page.id) && !page.id.includes("/topics/"))
      .sort((a, b) => orderOf(a) - orderOf(b) || a.title.localeCompare(b.title));
    let links = items.map((page) => navLink(currentId, page, page.id.endsWith("/README") ? "Overview" : page.title)).join("");
    if (audience === "author") {
      const groups = topicGroups(pages);
      const count = groups.reduce((sum, group) => sum + group.ids.length, 0);
      const open = currentId.startsWith("author/topics/") ? " open" : "";
      const inner = groups.map((group) => `<li class="group">${escapeHtml(group.title)}</li>${group.ids.filter((id) => byId.has(id)).map((id) => navLink(currentId, byId.get(id))).join("")}`).join("");
      if (count) links += `<li><details${open}><summary>Story fields (${count})</summary><ul>${inner}</ul></details></li>`;
    }
    return `<section><h2>${AUDIENCE_LABELS[audience]}</h2><ul>${links}</ul></section>`;
  }).join("");
  return `<section><ul>${home}</ul></section>${sections}`;
};

export const homeLayout = (html) => {
  const marked = html.replace(/<p>(<strong>New here\?)/, '<p class="primary">$1');
  const card = /<h4\b[^>]*>[\s\S]*?<\/h4>(?:<p>[\s\S]*?<\/p>)?<ul[^>]*>[\s\S]*?<\/ul>/g;
  const cards = [...marked.matchAll(card)];
  if (cards.length < 2) return marked;
  const first = cards[0].index;
  const last = cards[cards.length - 1];
  const end = last.index + last[0].length;
  const body = cards.map((match) => `<section class="card">${match[0]}</section>`).join("");
  return `${marked.slice(0, first)}<div class="cards">${body}</div>${marked.slice(end)}`;
};

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
nav details summary{cursor:pointer;padding:2px 4px;color:var(--fg)}nav details ul{padding-left:8px}nav li.group{margin:8px 0 2px 4px;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.primary{padding:12px 16px;border:1px solid var(--accent);border-radius:8px;font-size:1.05rem}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0 24px}.card{border:1px solid var(--line);border-radius:8px;padding:4px 16px 8px}.card h4{margin:.6em 0 .2em;font-size:1.1rem}.card p{margin:.2em 0;color:var(--muted);font-size:.92rem}.card ul{margin:.4em 0;padding-left:18px}
.menu-toggle{position:absolute;opacity:0;pointer-events:none}.menu-button{display:none;cursor:pointer;padding:4px 10px;border:1px solid var(--line);border-radius:6px}
@media (max-width:760px){.cards{grid-template-columns:1fr}.menu-button{display:inline-block}nav{display:none}.menu-toggle:checked~.layout nav{display:block}.layout{display:block}nav{width:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:16px}}
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
<body data-base="${base}"><input type="checkbox" id="menu" class="menu-toggle" aria-hidden="true"><header><label for="menu" class="menu-button">Pages</label><strong><a href="${base}index.html">Story Orchestrator guide</a></strong>
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
    const shown = page.id === "README" ? homeLayout(content) : content;
    const target = join(out, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, pageHtml({ title: page.title, nav: navFor(GUIDE_PAGES, page.id), content: shown, base, home: homePage }));
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
