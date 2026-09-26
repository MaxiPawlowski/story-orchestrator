import { readFileSync } from "fs";
import { join } from "path";
import { ROOT, prodFiles, rel } from "../../test/support/codeHealth";

const LINK = /(?:href|src)=\{?["'`]([^"'`]+)["'`]/g;
const EXTENSION_PREFIX = /^\/?scripts\/extensions\/third-party\/story-orchestrator\//;
const UNSHIPPED_IN_EXTENSION = /^(?:\.\/)?(?:docs|test|scripts|src|dist-dev|\.debug|\.claude)\//;
const UNSHIPPED_RELATIVE = /^\.?\/?(?:docs|test|src|dist-dev|\.debug|\.claude)\//;
const isUnshipped = (href: string) => (EXTENSION_PREFIX.test(href) ? UNSHIPPED_IN_EXTENSION.test(href.replace(EXTENSION_PREFIX, "")) : UNSHIPPED_RELATIVE.test(href));
const README_ANCHORS = (text: string) => new Set(text.split(/\r?\n/).filter((line) => line.startsWith("#")).map((line) => line.replace(/^#+\s*/, "").toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")));

const unshippedLinks = (files: Array<{ path: string; text: string }>) =>
  files.flatMap(({ path, text }) => [...text.matchAll(LINK)].filter((match) => isUnshipped(match[1])).map((match) => `${path}: ${match[1]}`));

describe("UI links point only at shipped files (v2.5 plan 12 D4)", () => {
  const tsx = prodFiles().filter((path) => path.endsWith(".tsx")).map((path) => ({ path: rel(path), text: readFileSync(path, "utf8") }));

  it("no href in the UI points into docs/, test/, scripts/ or a dev folder", () => {
    expect(unshippedLinks(tsx)).toEqual([]);
  });

  it("control: a planted docs/plans href is caught", () => {
    expect(unshippedLinks([{ path: "src/p.tsx", text: '<a href="scripts/extensions/third-party/story-orchestrator/docs/plans/v2.3/recommended-config.md">x</a>' }])).toHaveLength(1);
  });

  it("control: planted relative links into dev folders are caught, shipped and ST paths are not", () => {
    const text = ['<a href="./test/journeys/x.json">', '<img src=".debug/run.json" />', '<a href="scripts/extensions/third-party/story-orchestrator/scripts/plugin-install.mjs">', '<a href="scripts/extensions/third-party/story-orchestrator/README.md#x">', '<a href="scripts/slash-commands.js">', '<a href="https://example.com/docs/x">'].join(" ");
    expect(unshippedLinks([{ path: "src/p.tsx", text }]).map((line) => line.split(": ")[1])).toEqual(["./test/journeys/x.json", ".debug/run.json", "scripts/extensions/third-party/story-orchestrator/scripts/plugin-install.mjs"]);
  });

  it("every README anchor the UI links to exists", () => {
    const anchors = README_ANCHORS(readFileSync(join(ROOT, "README.md"), "utf8"));
    const linked = tsx.flatMap(({ text }) => [...text.matchAll(/README\.md#([\w-]+)/g)].map((match) => match[1]));
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.filter((anchor) => !anchors.has(anchor))).toEqual([]);
  });
});
