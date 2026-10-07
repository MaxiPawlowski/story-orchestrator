import { readFileSync } from "fs";
import { join } from "path";
import { loadStylesheet, STYLESHEET_WARNING, stylesheetMissing } from "./stylesheet";
import { CHECKS, runCheck, type Check } from "./checks";
import { setupAlert, viewerRepairStep } from "./repair";
import { createSaveHealth } from "./saveHealth";
import type { RuntimeSnapshot } from "./types";

const ENTRY = readFileSync(join(__dirname, "..", "index.tsx"), "utf8");

const UI_STARTS = ["startRuntime(", "createMountRegistry(", "ui.root(", "createRoot("];

const startupOrderIssues = (source: string): string[] => {
  const styles = source.search(/^await loadStylesheet\(\(\) => import\("\.\/styles\.css"/m);
  if (styles < 0) return ["the entry does not await loadStylesheet over the styles.css chunk at top level"];
  const issues = UI_STARTS.filter((call) => {
    const at = source.indexOf(call);
    return at >= 0 && at < styles;
  }).map((call) => `${call} runs before the stylesheet loads`);
  if (/^import\s+["']\.\/styles\.css["']/m.test(source)) issues.push("styles.css is also imported statically, into the main entry");
  return issues;
};

const quiet = (overrides: Record<string, unknown> = {}): RuntimeSnapshot => ({
  storyId: null,
  extraction: { settings: { enabled: true, profileId: "p" } },
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  saveHealth: createSaveHealth(),
  ui: { authorView: false },
  ...overrides,
}) as unknown as RuntimeSnapshot;

const STYLES_CHECK = CHECKS.find((check) => check.id === "styles-missing") as Check;

describe("coverage gap 5: the stylesheet loads before the UI mounts", () => {
  it("the entry awaits the stylesheet chunk before the runtime starts and before any root mounts", () => {
    expect(startupOrderIssues(ENTRY)).toEqual([]);
    expect(UI_STARTS.filter((call) => ENTRY.includes(call))).toEqual(expect.arrayContaining(["startRuntime(", "createMountRegistry(", "ui.root("]));
  });

  it("control: a planted entry that starts the runtime first, mounts first, drops the await or imports statically fails", () => {
    const line = ENTRY.split(/\r?\n/).find((text) => text.startsWith("await loadStylesheet(")) as string;
    expect(line).toBeDefined();
    const withoutStyles = ENTRY.replace(line, "");
    expect(startupOrderIssues(withoutStyles.replace("const manager = startRuntime();", `const manager = startRuntime();\n${line}`)))
      .toEqual(["startRuntime( runs before the stylesheet loads"]);
    expect(startupOrderIssues(`ui.root(host, <App />);\n${ENTRY}`)).toEqual(["ui.root( runs before the stylesheet loads"]);
    expect(startupOrderIssues(ENTRY.replace(line, line.replace(/^await /, "void ")))).toEqual(["the entry does not await loadStylesheet over the styles.css chunk at top level"]);
    expect(startupOrderIssues(`import "./styles.css";\n${ENTRY}`)).toEqual(["styles.css is also imported statically, into the main entry"]);
  });

  it("a load that resolves leaves nothing flagged and warns nothing", async () => {
    const warn = jest.fn();
    await expect(loadStylesheet(async () => ({}), warn)).resolves.toBe(true);
    expect(stylesheetMissing()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("a failed load warns, flags the snapshot fact and raises the player-visible check", async () => {
    const warn = jest.fn();
    const error = new Error("ChunkLoadError");
    await expect(loadStylesheet(() => Promise.reject(error), warn)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(STYLESHEET_WARNING, error);
    expect(stylesheetMissing()).toBe(true);
    const snapshot = quiet({ stylesMissing: stylesheetMissing() });
    expect(viewerRepairStep(snapshot)).toMatchObject({ check: "styles-missing", severity: "degrades", consequence: "Story Orchestrator's panels did not load their layout. Reload the page to fix it." });
    expect(setupAlert(snapshot)?.check).toBe("styles-missing");
    await loadStylesheet(async () => ({}), warn);
    expect(stylesheetMissing()).toBe(false);
  });

  it("the check is quiet while the stylesheet loaded, and runs with no story", () => {
    expect(runCheck(STYLES_CHECK, quiet())).toBeNull();
    expect(runCheck(STYLES_CHECK, quiet({ stylesMissing: false }))).toBeNull();
    expect(runCheck(STYLES_CHECK, quiet({ stylesMissing: true }))?.dismissable).toBe(true);
  });
});
