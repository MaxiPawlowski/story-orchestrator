import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GUIDE_DIR, headingsOf, pageId, SITE_ONLY_DIRS } from "./guide-bundle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const MERMAID_VERSION = "11.4.1";
export const MERMAID_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.esm.min.mjs`;
export const SITE_SECTIONS = { how: { label: "How it works", title: "Diagrams" }, showcase: { label: "Showcase", title: "Demos" } };
export const SHOWCASE_MEDIA_DIR = join(GUIDE_DIR, "assets", "showcase");
export const MEDIA_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "webm"];
export const MEDIA_NOTES = ["LICENSES.md"];
export const PAGE_BUDGET_BYTES = 5 * 1024 * 1024;
export const UI_DIR = "ui";
export const DENY_FILE = join(root, ".guide-deny.txt");

const escapeHtml = (text) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const extOf = (path) => /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? "";
const isLocal = (href) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href) && !href.startsWith("/");

export const walkFiles = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walkFiles(path) : [path];
}) : []);

const toPosix = (path) => path.split("\\").join("/");

export const sitePages = (dir = GUIDE_DIR) => SITE_ONLY_DIRS.flatMap((section) => {
  const base = join(dir, section);
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((name) => name.endsWith(".md")).sort().map((name) => {
    const doc = `${section}/${name}`;
    const body = readFileSync(join(base, name), "utf8").replace(/\r\n/g, "\n");
    const headings = headingsOf(body);
    return { id: pageId(doc), doc, audience: section, title: headings[0]?.text ?? doc, headings, body };
  });
});

export const siteNav = (pages) => SITE_ONLY_DIRS.map((section) => {
  const own = pages.filter((page) => page.audience === section);
  const index = own.find((page) => page.id === `${section}/README`);
  const linked = index ? [...index.body.matchAll(/\]\(([^)\s#]+\.md)\)/g)].map((match) => pageId(posix.normalize(posix.join(section, match[1])))) : [];
  const ids = [...new Set([index?.id, ...linked, ...own.map((page) => page.id)])].filter((id) => own.some((page) => page.id === id));
  return { audience: section, title: SITE_SECTIONS[section].title, ids };
}).filter((section) => section.ids.length);

const FENCE = /^```(mermaid|embed)[ \t]*\n([\s\S]*?)^```[ \t]*$/gm;

export const parseEmbed = (text) => Object.fromEntries(text.split("\n").map((line) => /^([a-z]+):\s*(.+?)\s*$/.exec(line)).filter(Boolean).map((match) => [match[1], match[2]]));

export const embedHtml = ({ src, title, height }) => {
  const shown = Number(height) > 0 ? Math.min(Number(height), 1200) : 520;
  return `<figure class="embed"><iframe src="${escapeHtml(src)}" title="${escapeHtml(title)}" loading="lazy" style="height:${shown}px"></iframe><figcaption>${escapeHtml(title)} · <a href="${escapeHtml(src)}">Open full page</a></figcaption></figure>`;
};

export const mediaHtml = (src, alt, standalone) => {
  const tag = extOf(src) === "webm"
    ? `<video src="${escapeHtml(src)}" controls muted loop playsinline preload="metadata" aria-label="${escapeHtml(alt)}"></video>`
    : `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">`;
  return standalone ? `<figure class="media">${tag}<figcaption>${escapeHtml(alt)}</figcaption></figure>` : tag;
};

export const prepareSitePage = (page) => {
  const blocks = [];
  const token = (html) => `SOSITEPH${blocks.push(html) - 1}X`;
  const fileDir = posix.dirname(page.doc);
  let body = page.body.replace(FENCE, (_all, kind, text) => {
    if (kind === "mermaid") return `${token({ kind, html: `<pre class="mermaid">${escapeHtml(text.replace(/\n$/, ""))}</pre>` })}\n`;
    const embed = parseEmbed(text);
    if (!embed.src || !embed.title || !isLocal(embed.src)) throw new Error(`${page.doc}: an embed needs a local src and a title`);
    return `${token({ kind, html: embedHtml(embed) })}\n`;
  });
  body = body.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (all, alt, src) => {
    if (!isLocal(src)) return all;
    const target = posix.normalize(posix.join(fileDir, src));
    if (!target.startsWith("assets/showcase/")) return all;
    if (!alt.trim()) throw new Error(`${page.doc}: ${src} has no alt text`);
    return token({ kind: "media", src, alt });
  });
  body = body.replace(/(^|[^!])\[([^\]]+)\]\(([^)\s]+)\)/g, (all, lead, label, href) => {
    if (!isLocal(href) || /\.md(?:#|$)/.test(href)) return all;
    return `${lead}${token({ kind: "link", html: `<a href="${escapeHtml(href)}">${escapeHtml(label.replace(/[`*_]/g, ""))}</a>` })}`;
  });
  const finish = (html) => html
    .replace(/<p>SOSITEPH(\d+)X<\/p>/g, (_all, at) => { const block = blocks[Number(at)]; return block.kind === "media" ? mediaHtml(block.src, block.alt, true) : block.html; })
    .replace(/SOSITEPH(\d+)X/g, (_all, at) => { const block = blocks[Number(at)]; return block.kind === "media" ? mediaHtml(block.src, block.alt, false) : block.html; });
  return { body, finish, mermaid: blocks.some((block) => block.kind === "mermaid") };
};

export const MERMAID_SCRIPT = `<script type="module">
import mermaid from "${MERMAID_URL}";
const nodes=[...document.querySelectorAll("pre.mermaid")];for(const n of nodes)n.dataset.src=n.textContent;
const query=matchMedia("(prefers-color-scheme: dark)");
const draw=async()=>{mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:query.matches?"dark":"default"});for(const n of nodes){n.removeAttribute("data-processed");n.textContent=n.dataset.src;}await mermaid.run({nodes});};
query.addEventListener("change",draw);draw();
</script>`;

export const demoDirs = (dir = join(GUIDE_DIR, "showcase")) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [])
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({ name: entry.name, dir: join(dir, entry.name) }));

export const demoProblems = (demos) => demos.flatMap(({ name, dir }) => {
  const problems = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) problems.push(`showcase/${name}: name must be lowercase words joined by -`);
  if (!existsSync(join(dir, "index.html"))) problems.push(`showcase/${name}: no index.html`);
  for (const file of walkFiles(dir).filter((path) => /\.(html|m?js|css)$/.test(path))) {
    const text = readFileSync(file, "utf8");
    for (const [, url] of [...text.matchAll(/<script\b[^>]*\bsrc=["'](https?:[^"']+)["']|<link\b[^>]*\bhref=["'](https?:[^"']+)["']|(?:^|[\s;])(?:import|export)\b[^"'`;]*?\bfrom\s*["'](https?:[^"']+)["']|import\(\s*["'](https?:[^"']+)["']|@import\s+(?:url\()?["'](https?:[^"']+)["']/g)].map((match) => [match[0], match.slice(1).find(Boolean)])) {
      if (!/^https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com|cdnjs\.cloudflare\.com\/ajax\/libs)\/(@[^/]+\/)?[^/@]+@\d+\.\d+\.\d+\//.test(url) && !/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/[^/]+\/\d+\.\d+\.\d+\//.test(url)) {
        problems.push(`${toPosix(relative(dir, file))} in showcase/${name}: ${url} is not a CDN script pinned to an exact version`);
      }
    }
  }
  return problems;
});

export const copyDemos = async (demos, out) => {
  for (const { name, dir } of demos) {
    const target = join(out, "showcase", name);
    mkdirSync(target, { recursive: true });
    cpSync(dir, target, { recursive: true, filter: (source) => !/[\\/]build\.mjs$/.test(source) });
    const builder = join(dir, "build.mjs");
    if (existsSync(builder)) await (await import(pathToFileURL(builder).href)).default({ outDir: target, root });
  }
};

export const mediaProblems = (dir = SHOWCASE_MEDIA_DIR) => walkFiles(dir).flatMap((file) => {
  const rel = toPosix(relative(dir, file));
  if (MEDIA_NOTES.includes(rel)) return [];
  if (rel.endsWith(".json")) {
    const media = file.slice(0, -".json".length);
    return existsSync(media) ? [] : [`assets/showcase/${rel}: sidecar without its media file`];
  }
  if (!MEDIA_EXTENSIONS.includes(extOf(file))) return [`assets/showcase/${rel}: not one of ${MEDIA_EXTENSIONS.join(", ")}`];
  if (statSync(file).size > PAGE_BUDGET_BYTES) return [`assets/showcase/${rel}: over the ${PAGE_BUDGET_BYTES} B page budget on its own`];
  const sidecar = `${file}.json`;
  if (!existsSync(sidecar)) return [`assets/showcase/${rel}: no ${posix.basename(rel)}.json recording the build it came from`];
  let meta;
  try { meta = JSON.parse(readFileSync(sidecar, "utf8")); } catch { return [`assets/showcase/${rel}.json: not JSON`]; }
  const problems = [];
  if (!/^[0-9a-f]{7,40}$/.test(meta.build ?? "")) problems.push(`assets/showcase/${rel}.json: build must be the commit sha the media was made from`);
  if (!String(meta.licence ?? "").trim()) problems.push(`assets/showcase/${rel}.json: licence missing`);
  if (!String(meta.source ?? "").trim()) problems.push(`assets/showcase/${rel}.json: source missing (how it was made)`);
  return problems;
});

export const copyMedia = (out, dir = SHOWCASE_MEDIA_DIR) => {
  for (const file of walkFiles(dir).filter((path) => MEDIA_EXTENSIONS.includes(extOf(path)))) {
    const target = join(out, "assets", "showcase", relative(dir, file));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
};

export const UI_STUB = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI components</title></head>
<body style="font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px"><h1>UI components</h1><p>The component browser (Storybook) is built by the site workflow. Locally: <code>npm run storybook:build</code>, then <code>node scripts/docs/guide-site.mjs --storybook .sb-static</code>.</p></body></html>
`;

export const placeStorybook = (out, storybook) => {
  const target = join(out, UI_DIR);
  if (storybook) {
    if (!existsSync(join(storybook, "index.html"))) throw new Error(`${storybook}: no Storybook build (run npm run storybook:build)`);
    cpSync(storybook, target, { recursive: true });
    return true;
  }
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "index.html"), UI_STUB);
  return false;
};

const ownFiles = (out) => walkFiles(out).filter((file) => !toPosix(relative(out, file)).startsWith(`${UI_DIR}/`));

export const brokenSiteLinks = (out) => {
  const broken = [];
  const cache = new Map();
  const read = (file) => { if (!cache.has(file)) cache.set(file, readFileSync(file, "utf8")); return cache.get(file); };
  for (const file of ownFiles(out).filter((path) => path.endsWith(".html"))) {
    const rel = toPosix(relative(out, file));
    const html = read(file);
    for (const [, attr, raw] of html.matchAll(/\b(href|src)="([^"]*)"/g)) {
      const href = raw.replace(/&amp;/g, "&");
      if (!href) { broken.push(`${rel}: empty ${attr}`); continue; }
      if (!isLocal(href)) {
        if (href.startsWith("#") && !html.includes(`id="${href.slice(1)}"`)) broken.push(`${rel} -> ${href} (no heading)`);
        continue;
      }
      const [pathPart, anchor] = href.split("#");
      const clean = pathPart.split("?")[0];
      let target = join(dirname(file), clean);
      if (clean.endsWith("/") || (existsSync(target) && statSync(target).isDirectory())) target = join(target, "index.html");
      if (!existsSync(target)) { broken.push(`${rel} -> ${href}`); continue; }
      if (anchor && target.endsWith(".html") && !read(target).includes(`id="${anchor}"`)) broken.push(`${rel} -> ${href} (no heading)`);
    }
  }
  return broken;
};

export const pageWeights = (out) => {
  const weights = [];
  for (const file of ownFiles(out).filter((path) => path.endsWith(".html"))) {
    const rel = toPosix(relative(out, file));
    if (/^showcase\/[^/]+\//.test(rel)) continue;
    let bytes = statSync(file).size;
    const seen = new Set();
    for (const [, src] of readFileSync(file, "utf8").matchAll(/<(?:img|video|source|audio)\b[^>]*\bsrc="([^"]+)"/g)) {
      if (!isLocal(src)) continue;
      const target = join(dirname(file), src.split(/[?#]/)[0]);
      if (seen.has(target) || !existsSync(target)) continue;
      seen.add(target);
      bytes += statSync(target).size;
    }
    weights.push({ page: rel, bytes });
  }
  const demoRoot = join(out, "showcase");
  for (const entry of existsSync(demoRoot) ? readdirSync(demoRoot, { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) continue;
    weights.push({ page: `showcase/${entry.name}/`, bytes: walkFiles(join(demoRoot, entry.name)).reduce((sum, file) => sum + statSync(file).size, 0) });
  }
  return weights;
};

export const overBudget = (weights, budget = PAGE_BUDGET_BYTES) => weights.filter((weight) => weight.bytes > budget).map((weight) => `${weight.page}: ${weight.bytes} B, over the ${budget} B page budget`);

export const SECRET_PATTERNS = [
  { name: "OpenAI-style key", pattern: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Hugging Face token", pattern: /\bhf_[A-Za-z0-9]{30,}\b/ },
  { name: "RunPod key", pattern: /\brpa_[A-Za-z0-9]{20,}\b/ },
  { name: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{30,}={0,2}/ },
  { name: "owner machine path", pattern: /\b[A-Za-z]:(?:\\{1,2}|\/)(?:dev|Users)(?:\\{1,2}|\/)/i },
  { name: "owner home path", pattern: /(?:^|[\s"'(=])\/(?:home|Users)\/(?!runner\b)[A-Za-z0-9._-]+\//m },
];

export const denyTerms = ({ env = process.env, file = DENY_FILE } = {}) => {
  const source = env.SO_SITE_DENY_FILE || (existsSync(file) ? file : "");
  if (!source) return { source: null, terms: [] };
  const terms = readFileSync(source, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  return { source, terms };
};

const TEXT_FILE = /\.(html?|m?js|cjs|css|json|md|svg|txt|xml|map)$/i;

export const privacyHits = (out, { terms = [] } = {}) => {
  const deny = terms.map((term, at) => ({ at: at + 1, pattern: new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu") }));
  const hits = [];
  for (const file of walkFiles(out).filter((path) => TEXT_FILE.test(path))) {
    const rel = toPosix(relative(out, file));
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const { name, pattern } of SECRET_PATTERNS) if (pattern.test(line)) hits.push(`${rel}:${index + 1}: ${name}`);
      for (const { at, pattern } of deny) if (pattern.test(line)) hits.push(`${rel}:${index + 1}: deny-list term #${at}`);
    });
  }
  return hits;
};

const EXPORT_DECL = (name) => new RegExp(`export\\s+(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?(?:abstract\\s+)?(?:function\\*?|class|const|let|var|interface|type|enum)\\s+${name}\\b`);

export const exportsName = (text, name) => EXPORT_DECL(name).test(text)
  || [...text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)].some((match) => match[1].split(",").some((part) => part.trim().split(/\s+as\s+/).pop().replace(/^type\s+/, "").trim() === name))
  || new RegExp(`(?:module\\.)?exports\\.${name}\\s*=`).test(text);

export const sourceList = (body) => {
  const section = /^##\s+Sources\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(body)?.[1] ?? "";
  return section.split("\n").map((line) => /^-\s+`([^`]+)`:\s*(.*)$/.exec(line.trim())).filter(Boolean)
    .map((match) => ({ file: match[1], symbols: [...match[2].matchAll(/`([^`]+)`/g)].map((symbol) => symbol[1]) }));
};

export const sourceProblems = (pages, repo = root) => pages.flatMap((page) => {
  const list = sourceList(page.body);
  if (!list.length) return [`${page.doc}: no "## Sources" list`];
  return list.flatMap(({ file, symbols }) => {
    const path = join(repo, file);
    if (!existsSync(path)) return [`${page.doc}: ${file} no longer exists`];
    const text = readFileSync(path, "utf8");
    if (!symbols.length) return [`${page.doc}: ${file} lists no symbol`];
    return symbols.flatMap((symbol) => {
      const [owner, member] = symbol.split(".");
      if (!exportsName(text, owner)) return [`${page.doc}: ${file} no longer exports ${owner}`];
      if (member && !new RegExp(`(?:^|\\s)(?:public\\s+|private\\s+|protected\\s+|static\\s+|readonly\\s+|async\\s+|get\\s+|set\\s+)*${member}\\s*(?:[(=:<]|\\?\\s*[(:])`, "m").test(text)) return [`${page.doc}: ${file} has no ${owner}.${member}`];
      return [];
    });
  });
});
