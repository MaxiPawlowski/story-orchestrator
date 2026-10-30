import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { FEATURES, SOURCE_FEATURES, type FeatureSurface } from "./registry";
import { canShow } from "@components/help/HelpPanel";
import { COACH_FLOWS } from "@guide/tour/coachFlows";
import { GUIDE_PAGES } from "@guide/pages.generated";
import { guideShowOf } from "@guide/showTarget";

const ROOT = resolve(__dirname, "../..");

type Read = (path: string) => string | null;

interface Root {
  file: string;
  component?: string;
}

const SURFACE_ROOTS: Record<FeatureSurface, readonly Root[]> = {
  settings: [{ file: "src/index.tsx", component: "WorkspaceHost" }],
  drawer: [{ file: "src/index.tsx", component: "WorkspaceHost" }],
  studio: [{ file: "src/index.tsx", component: "StudioHost" }],
  chat: [{ file: "src/index.tsx", component: "HudMount" }, { file: "src/index.tsx", component: "InlineMount" }],
};

const ALIASES = ["components", "services", "utils", "constants", "engine", "runtime", "extraction", "pacing", "generation", "memory", "copilot", "talk", "wizard",
  "stagecraft", "judge", "features", "guide"];

const diskRead: Read = (path) => {
  const full = join(ROOT, path);
  return existsSync(full) ? readFileSync(full, "utf-8").replace(/\r\n/g, "\n") : null;
};

const resolveSpecifier = (from: string, specifier: string, read: Read): string | null => {
  const alias = /^@([a-z]+)\/(.*)$/.exec(specifier);
  const base = alias && ALIASES.includes(alias[1]) ? `src/${alias[1]}/${alias[2]}` : specifier.startsWith(".") ? posix.join(posix.dirname(from), specifier) : null;
  if (!base) return null;
  return [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((candidate) => /\.tsx?$/.test(candidate) && read(candidate) !== null) ?? null;
};

const componentSpan = (source: string, name: string): string | null => {
  const start = source.search(new RegExp(`^(?:export )?(?:const|function) ${name}\\b`, "m"));
  if (start < 0) return null;
  const rest = source.slice(start + 1);
  const next = rest.search(/^(?:export )?(?:const|function|class|let) /m);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
};

const importedFrom = (source: string): Map<string, string> => {
  const names = new Map<string, string>();
  for (const [, clause, specifier] of source.matchAll(/^import\s+(?!type\b)([^;]*?)\s+from\s+"([^"]+)";?$/gms)) {
    const defaultName = /^([A-Za-z_$][\w$]*)/.exec(clause)?.[1];
    if (defaultName) names.set(defaultName, specifier);
    for (const [, member] of (/\{([^}]*)\}/.exec(clause)?.[1] ?? "").matchAll(/(?:^|,)\s*(?:type\s+)?(?:[\w$]+\s+as\s+)?([\w$]+)\s*(?=,|$)/g)) names.set(member, specifier);
  }
  for (const [, name, specifier] of source.matchAll(/const\s+([A-Z][\w$]*)\s*=\s*(?:lazyRetry|lazy)\(\s*\(\)\s*=>\s*import\("([^"]+)"\)/g)) names.set(name, specifier);
  return names;
};

export const renderedFiles = (roots: readonly Root[], read: Read = diskRead): Map<string, string> => {
  const seen = new Map<string, string>();
  const visit = (file: string, component?: string) => {
    const key = component ? `${file}#${component}` : file;
    if (seen.has(key)) return;
    const source = read(file);
    if (source === null) return;
    const span = component ? componentSpan(source, component) : source;
    if (span === null) return;
    seen.set(key, span);
    const imports = importedFrom(source);
    for (const [, tag] of span.matchAll(/<([A-Z][\w$]*)[\s/>]/g)) {
      const specifier = imports.get(tag);
      if (specifier) {
        const target = resolveSpecifier(file, specifier, read);
        if (target) visit(target);
      } else if (componentSpan(source, tag)) visit(file, tag);
    }
  };
  roots.forEach((root) => visit(root.file, root.component));
  return seen;
};

const templateRegex = (body: string) => new RegExp(`^${body.split(/\$\{[^}]*\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[A-Za-z0-9-]+")}$`);

export const definesSelector = (sources: Iterable<string>, selector: string): boolean => {
  const texts = [...sources];
  const idMatch = /^#([A-Za-z0-9_-]+)$/.exec(selector);
  if (idMatch) {
    const id = idMatch[1];
    return texts.some((text) => [...text.matchAll(/"([A-Za-z0-9_-]+)"|'([A-Za-z0-9_-]+)'/g)].some((match) => (match[1] ?? match[2]) === id)
      || [...text.matchAll(/`(so-[^`]*\$\{[^`]*)`/g)].some((match) => templateRegex(match[1]).test(id)));
  }
  const dataSo = /^\[data-so=\\?"([^"\\]+)\\?"\]$/.exec(selector);
  if (dataSo) return texts.some((text) => text.includes(`data-so="${dataSo[1]}"`));
  return false;
};

const brokenTargets = (read: Read = diskRead, features = FEATURES) => {
  const rendered = Object.fromEntries((Object.keys(SURFACE_ROOTS) as FeatureSurface[]).map((surface) => [surface, [...renderedFiles(SURFACE_ROOTS[surface], read).values()]]));
  return features.filter((feature) => !definesSelector(rendered[feature.where.surface], feature.where.selector))
    .map((feature) => `${feature.id}: ${feature.where.selector} (${feature.where.surface})`);
};

describe("v2.7 plan 29 (finding 20): every Help \"Show me\" target exists in the UI it names", () => {
  it("each surface root renders a real component tree", () => {
    const settings = [...renderedFiles(SURFACE_ROOTS.settings).keys()];
    expect(settings).toEqual(expect.arrayContaining(["src/components/settings/SettingsPanel.tsx", "src/components/settings/DisplayPage.tsx", "src/image/ImageGroup.tsx", "src/components/ui/FeatureList.tsx"]));
    expect([...renderedFiles(SURFACE_ROOTS.drawer).keys()]).toEqual(expect.arrayContaining(["src/components/drawer/DrawerTabs.tsx", "src/components/drawer/PlayerOverview.tsx"]));
    expect([...renderedFiles(SURFACE_ROOTS.studio).keys()]).toEqual(expect.arrayContaining(["src/studio/StudioModal.tsx", "src/studio/components/GuideDisclosure.tsx"]));
    expect([...renderedFiles(SURFACE_ROOTS.chat).keys()]).toEqual(expect.arrayContaining(["src/components/drawer/HudStrip.tsx"]));
    expect(settings).toContain("src/components/workspace/WorkspaceShell.tsx");
  });

  it("every feature's selector is defined by a component its surface renders", () => {
    expect(brokenTargets()).toEqual([]);
  });

  it("every feature's own target renders too, before the feature-policy routing replaces it", () => {
    expect(brokenTargets(diskRead, SOURCE_FEATURES)).toEqual([]);
  });

  it("every feature Help offers Show me for sits on a surface Show me can open", () => {
    const shown = FEATURES.filter((feature) => canShow(feature.where));
    expect(shown.length).toBeGreaterThan(40);
    expect(shown.every((feature) => feature.where.surface === "settings" || feature.where.surface === "drawer")).toBe(true);
  });

  it("catches a missing id, an id on another surface and an id only an unrendered file defines (controls)", () => {
    const drawer = [...renderedFiles(SURFACE_ROOTS.drawer).values()];
    const settings = [...renderedFiles(SURFACE_ROOTS.settings).values()];
    expect(definesSelector(settings, "#so-not-a-control")).toBe(false);
    expect(definesSelector(drawer, "#so-memory-search")).toBe(true);
    expect(definesSelector(settings, "#so-memory-search")).toBe(true);
    expect(definesSelector(settings, "#so-diagnostics")).toBe(true);
    expect(definesSelector(settings, "#so-judge-use-director")).toBe(true);
    expect(definesSelector(drawer, "[data-so=\"repetition\"]")).toBe(true);
    const files: Record<string, string> = {
      "src/root.tsx": "import Shown from \"./shown\";\nimport { helper } from \"./orphan\";\nexport const Root = () => <Shown />;\n",
      "src/shown.tsx": "export default function Shown() { return <div id=\"so-shown\" />; }\n",
      "src/orphan.tsx": "export const helper = 1;\nexport const Orphan = () => <div id=\"so-orphan\" />;\n",
    };
    const read: Read = (path) => files[path] ?? null;
    const tree = [...renderedFiles([{ file: "src/root.tsx", component: "Root" }], read).values()];
    expect(definesSelector(tree, "#so-shown")).toBe(true);
    expect(definesSelector(tree, "#so-orphan")).toBe(false);
  });

  it("resolves the repo's own path aliases", () => {
    expect(resolveSpecifier("src/index.tsx", "@components/settings/SettingsPanel", diskRead)).toBe("src/components/settings/SettingsPanel.tsx");
    expect(resolveSpecifier("src/studio/StudioModal.tsx", "./components/GuideDisclosure", diskRead)).toBe("src/studio/components/GuideDisclosure.tsx");
    expect(dirname("src/x.tsx")).toBe("src");
  });
});

describe("tour coach marks anchor on rendered controls", () => {
  const ids = (selector: string) => [...selector.matchAll(/#([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  const stops = Object.values(COACH_FLOWS).flatMap((flow) => flow.stops.map((stop) => ({ view: flow.view, stop })));

  it("every anchor id of a workspace, studio or chat stop is defined by the tree that stop shows", () => {
    const trees = {
      workspace: [...renderedFiles(SURFACE_ROOTS.settings).values()],
      studio: [...renderedFiles(SURFACE_ROOTS.studio).values()],
      chat: [...renderedFiles(SURFACE_ROOTS.chat).values(), diskRead("src/index.tsx") ?? ""],
      guide: [...renderedFiles([{ file: "src/guide/GuideHost.tsx" }]).values()],
    };
    const treeOf = (kind: string) => (kind === "workspace" ? trees.workspace : kind === "studio" ? trees.studio : kind === "guide" ? trees.guide : trees.chat);
    const missing = stops.flatMap(({ view, stop }) => stop.anchors.flatMap((anchor) => ids(anchor.selector)
      .filter((id) => !definesSelector(treeOf(stop.action.kind), `#${id}`)).map((id) => `${view}.${stop.id}: #${id}`)));
    expect(stops.length).toBeGreaterThanOrEqual(15);
    expect(missing).toEqual([]);
    expect(definesSelector(trees.workspace, "#so-coach-nowhere")).toBe(false);
  });

  it("every guide Show me that opens the workspace lands on a control the workspace renders", () => {
    const workspace = [...renderedFiles(SURFACE_ROOTS.settings).values()];
    const controls = GUIDE_PAGES.flatMap((page) => [...page.body.matchAll(/<!--\s*so:show\s+(open:[\w:.-]+)\s*-->/g)].map((match) => ({ page: page.id, value: match[1] })));
    const broken = controls.filter(({ value }) => {
      const target = guideShowOf(value);
      return target?.kind !== "open" || (target.intent.control !== undefined && !definesSelector(workspace, `#${target.intent.control}`));
    });
    expect(controls.length).toBeGreaterThan(5);
    expect(broken).toEqual([]);
    expect(definesSelector(workspace, "#so-capabilities-nowhere")).toBe(false);
  });
});

const WORKSPACE = "src/components/workspace/Workspace.tsx";
const workspacePage = (page: "play"): Read => (path) => {
  const source = diskRead(path);
  if (path !== WORKSPACE || source === null) return source;
  const start = source.indexOf(`if (location.page === "${page}") return`);
  const end = source.indexOf("\n      if (", start + 1);
  const imports = source.slice(0, source.search(/^export default function/m));
  return `${imports}export const Page = () => <>${source.slice(source.indexOf("return", start) + 6, end)}</>;\n`;
};

describe("v2.8 plan 41: a feature routed to the workspace Play page renders there", () => {
  it("every Play-routed feature selector is defined by the Play page tree", () => {
    const play = [...renderedFiles([{ file: WORKSPACE, component: "Page" }], workspacePage("play")).values()];
    expect(play.join("\n")).toContain("PlayerOverview");
    const misrouted = FEATURES.filter((feature) => feature.where.workspace?.context === "story" && feature.where.workspace.page === "play"
      && !definesSelector(play, feature.where.selector)).map((feature) => `${feature.id}: ${feature.where.selector}`);
    expect(misrouted).toEqual([]);
    expect(definesSelector(play, "#so-cast-scene")).toBe(false);
    expect(FEATURES.find((feature) => feature.id === "cast-illustration")?.where.workspace).toMatchObject({ context: "story", page: "author", control: "so-cast-scene" });
  });
});
