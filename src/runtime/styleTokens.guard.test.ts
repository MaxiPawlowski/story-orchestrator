import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const TOKENS = "src/styles/tokens.css";
const ACCENT_TABLE = /^#so-panels-root \[data-accent="[a-z]+"\] \{ --so-game-accent: #[0-9a-fA-F]{6}; \}$/;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
const rel = (path: string) => relative(ROOT, path).replace(/\\/g, "/");
const files = walk(SRC).map(rel);
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const prod = (path: string) => !/\.(test|stories)\.tsx?$/.test(path);

const HEX = /#[0-9a-fA-F]{3,8}(?![\w-])/;
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]/;
const NAMED = /(?<![\w-])(?:white|black|red|green|blue|yellow|orange|gr[ae]y|silver|purple|fuchsia|lime|navy|teal|aqua|maroon|olive)(?![\w-])/;
const TW_COLOR = new RegExp("(?<![\\w-])(?:bg|text|border(?:-[trblxy])?|ring|outline|divide|fill|stroke|from|via|to|shadow|accent|caret|decoration|placeholder)-"
  + "(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3})"
  + "(?:\\/\\d{1,3})?(?![\\w-])|-\\[(?:#|rgba?\\(|hsla?\\()");
const TSX_LITERAL = /["'`]#[0-9a-fA-F]{3,8}["'`]|["'`][^"'`]*\b(?:rgba?|hsla?)\(\s*\d/;

const cssColorLiterals = (path: string, text: string): string[] =>
  text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " ")).split(/\r?\n/).flatMap((line, index) => {
    if (ACCENT_TABLE.test(line.trim())) return [];
    const values = [...line.matchAll(/(?:^|[;{\s])(?:--)?[a-zA-Z][\w-]*\s*:\s*([^;{}]*)/g)].map((match) => match[1]);
    return values.some((value) => HEX.test(value) || COLOR_FN.test(value) || NAMED.test(value)) ? [`${path}:${index + 1}: ${line.trim()}`] : [];
  });

const sourceColorLiterals = (path: string, text: string): string[] =>
  text.split(/\r?\n/).flatMap((line, index) => (TW_COLOR.test(line) || (path.endsWith(".tsx") && TSX_LITERAL.test(line))
    ? [`${path}:${index + 1}: ${line.trim()}`] : []));

const tagAround = (text: string, at: number): string => {
  const start = text.lastIndexOf("<", at);
  let depth = 0;
  let quote = "";
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return text.slice(start, index + 1);
  }
  return text.slice(start);
};

const topLevelClassName = (tag: string): string | null => {
  let depth = 0;
  for (let index = 0; index < tag.length; index += 1) {
    const char = tag[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (depth === 0 && tag.startsWith("className=", index)) {
      const rest = tag.slice(index + "className=".length);
      return /^["']([^"']*)["']/.exec(rest)?.[1] ?? /^\{\s*["'`]([^"'`]*)["'`]\s*\}/.exec(rest)?.[1] ?? rest.slice(0, 80);
    }
  }
  return null;
};

const mountRootUtilities = (path: string, text: string, roots: string[]): string[] =>
  roots.flatMap((root) => [...text.matchAll(new RegExp(`\\bid=(?:"${root}"|'${root}'|\\{\\s*"${root}"\\s*\\})`, "g"))].flatMap((match) => {
    const className = topLevelClassName(tagAround(text, match.index ?? 0));
    if (className === null) return [];
    const bad = className.split(/\s+/).filter((token) => token && !/^so-[\w-]+$/.test(token));
    return bad.length ? [`${path}: #${root} carries ${bad.join(" ")}`] : [];
  }));

const scopeRoots = (): string[] => {
  const scope = /:is\(([^)]*)\)\s*\{\s*@apply text-base;/.exec(read("src/styles.css"))?.[1] ?? "";
  return scope.split(",").map((part) => part.trim().replace(/^#/, "")).filter(Boolean);
};

describe("v3.0 29 phase 0a: colour comes from the token file, mount roots carry no utilities", () => {
  it("the Tailwind scope names the mount roots this guard checks", () => {
    expect(scopeRoots()).toEqual(expect.arrayContaining(["drawer-manager", "so-hud-root", "story-orchestrator-settings", "so-studio-modal", "so-panels-root",
      "so-workspace-modal", "so-briefing"]));
  });

  it("no colour literal in src CSS outside tokens.css and the authored game accent table", () => {
    const hits = files.filter((path) => path.endsWith(".css") && path !== TOKENS).flatMap((path) => cssColorLiterals(path, read(path)));
    expect(hits).toEqual([]);
  });

  it("no palette colour utility or colour literal in components", () => {
    const hits = files.filter((path) => /\.tsx?$/.test(path) && prod(path)).flatMap((path) => sourceColorLiterals(path, read(path)));
    expect(hits).toEqual([]);
  });

  it("tokens.css derives every colour from ST variables except the status hues it mixes toward the theme text", () => {
    const tokens = read(TOKENS);
    const fake = /--SmartTheme(?:BodyActive|Active|Hover|Success|Error|Warning)Color/;
    expect(tokens).not.toMatch(/--st-/);
    expect(tokens).not.toMatch(fake);
    expect(read("src/styles.css")).not.toMatch(fake);
    for (const tone of ["ok", "warn", "error"]) {
      expect(tokens).toMatch(new RegExp(`--so-${tone}: color-mix\\(in oklab, #[0-9a-f]{6} \\d+%, var\\(--SmartThemeBodyColor\\)\\);`));
    }
  });

  it("no mount-root element carries a Tailwind utility (utilities only reach descendants)", () => {
    const roots = scopeRoots();
    const hits = files.filter((path) => path.endsWith(".tsx")).flatMap((path) => mountRootUtilities(path, read(path), roots));
    expect(hits).toEqual([]);
  });

  it("controls: planted literals and a utility on a mount root are caught", () => {
    const css = "#so-x .y { background: #202126; }\n.z { color: rgb(0 0 0 / .3); }\n.w { border-color: white; }\n.ok { white-space: nowrap; color: var(--so-fg); }";
    expect(cssColorLiterals("a.css", css)).toHaveLength(3);
    expect(cssColorLiterals("a.css", '#so-panels-root [data-accent="gold"] { --so-game-accent: #c9a227; }')).toEqual([]);
    const tsx = '<div className="border-t border-white/10 text-red-300 bg-[#123]" />\n<i style={box("#f66")} />\n<p className="text-[var(--so-error)]" />';
    expect(sourceColorLiterals("a.tsx", tsx)).toHaveLength(2);
    const planted = '<div id="story-orchestrator-settings" onClick={() => go()} className="p-3 flex so-ok">x</div>\n'
      + '<dialog id="so-workspace-modal" onCancel={(e) => { e.x(); }}><div className="p-3" /></dialog>';
    expect(mountRootUtilities("a.tsx", planted, ["story-orchestrator-settings", "so-workspace-modal"])).toEqual(["a.tsx: #story-orchestrator-settings carries p-3 flex"]);
  });
});
