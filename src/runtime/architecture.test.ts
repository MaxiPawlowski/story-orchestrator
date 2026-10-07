import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { INJECTION_REGISTRY } from "../constants/injectionRegistry";

// Structural rules the harness enforces so nobody has to remember them (v2.1 rule 9). Each budget
// here is a measured post-plan-03 fact: raising one is a decision, not a side effect.
const SRC = join(__dirname, "..");

// V22b: budgets are EFFECTIVE lines (every started 120 characters of a line counts as one), because
// a raw line count was being met by packing: memoryCoordinator read 614/620 lines while holding 676
// effective ones, the manager 679/700 while holding 766. V22b raised both to cover the measured size;
// V26 part 1 moved prompt injection into runtime/memoryInjector.ts (memoryCoordinator 687 -> 597), so
// the coordinator budget is back at 620. V26 part 2 moved the save chokepoint into runtime/chatSave.ts
// and shared the coordinators' story/engine/lifecycle accessors (manager 775 -> 738). What is left is
// the public delegate API plus lifecycle, boundary commit and load, so the budget is the measured size
// (740), not 700: a stated decision, and any growth past it still fails. v2.5 plan 03 D3 moved the
// coordinator wiring, the canon, the conflict queue, the memorize backlog and the curator's write
// edge into delegated units, so both budgets come down to the design values with headroom below them.
const MANAGER_LINE_BUDGET = 700;
const COORDINATOR_LINE_BUDGET = 560;
const DELEGATED_UNITS = ["runtime/memoryQueue.ts", "runtime/canonSynthesis.ts", "runtime/memorizeBacklog.ts", "runtime/curatorWriter.ts"];
const COORDINATOR_SPECIFIER = /(^|\/)coordinators\/|^\.\/\w+Coordinator$/;
const valueImportsOf = (source: string) => [...source.matchAll(/^import\s+(?!type\s)([\s\S]+?)\s+from\s+"([^"]+)"/gm)]
  .filter((match) => !/^\{[^}]*\}$/.test(match[1].trim()) || match[1].replace(/\btype\s+\w+(\s+as\s+\w+)?/g, "").replace(/[{},\s]/g, "") !== "")
  .map((match) => match[2]);
const unitLeaks = (source: string) => ({
  host: [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]).filter((specifier) => /@services|STAPI/.test(specifier)),
  coordinators: valueImportsOf(source).filter((specifier) => COORDINATOR_SPECIFIER.test(specifier)),
});
const EFFECTIVE_WIDTH = 120;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

export const effectiveLines = (text: string) => text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.replace(/\r$/, "").length / EFFECTIVE_WIDTH)), 0);
const lineCount = (path: string) => effectiveLines(readFileSync(path, "utf8"));
const importsOf = (path: string) => [...readFileSync(path, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
const STAGECRAFT_ISOLATED = ["runtime/coordinators/stagecraftCoordinator.ts", "runtime/curatorWriter.ts"];
const stagecraftLeaks = (source: string) => ({
  offenders: [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]).filter((specifier) => /@memory|@generation|@pacing/.test(specifier)),
  writes: [...source.matchAll(/enqueue\w*\(|applyEntries\(|setMemory\(/g)].map((match) => match[0]),
});

describe("architecture guards", () => {
  it("counts a packed line as the lines it replaces, so packing cannot meet a budget", () => {
    const spread = Array.from({ length: 10 }, (_, index) => `const value${index} = ${"x".repeat(100)};`).join("\n");
    const packed = spread.split("\n").join(" ");
    expect(effectiveLines(packed)).toBeGreaterThanOrEqual(effectiveLines(spread) - 1);
    expect(effectiveLines("a\n\nb")).toBe(3);
  });

  it("keeps RuntimeManager within its size budget", () => {
    expect(lineCount(join(SRC, "runtime/runtimeManager.ts"))).toBeLessThanOrEqual(MANAGER_LINE_BUDGET);
  });

  it("keeps every coordinator smaller than the manager budget", () => {
    for (const path of walk(join(SRC, "runtime/coordinators"))) {
      expect({ path, overBudget: lineCount(path) > COORDINATOR_LINE_BUDGET }).toEqual({ path, overBudget: false });
    }
  });

  it("never lets the drawer or any other component import the studio", () => {
    for (const path of walk(join(SRC, "components"))) {
      const offenders = importsOf(path).filter((specifier) => /(^@studio|studio\/(?!.*components\/studio))/.test(specifier) && !specifier.includes("components/studio"));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("lets the studio reach components only through the shared primitives", () => {
    for (const path of walk(join(SRC, "studio"))) {
      const offenders = importsOf(path).filter((specifier) => specifier.includes("components") && /@components|\.\.\/components/.test(specifier) && !specifier.startsWith("@components/studio/"));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("keeps drawer render paths on the snapshot instead of manager getters", () => {
    for (const path of walk(join(SRC, "components/drawer"))) {
      const getterCalls = [...readFileSync(path, "utf8").matchAll(/manager\.get\w+\(/g)].map((match) => match[0]);
      expect({ path, getterCalls }).toEqual({ path, getterCalls: [] });
    }
  });

  it("keeps the inline timeline on the snapshot: no manager getters and no host imports in components/inline", () => {
    const offenders = (source: string) => [
      ...[...source.matchAll(/manager\.get\w+\(/g)].map((match) => match[0]),
      ...[...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]).filter((specifier) => /@services|STAPI/.test(specifier)),
    ];
    for (const path of walk(join(SRC, "components/inline"))) {
      expect({ path, offenders: offenders(readFileSync(path, "utf8")) }).toEqual({ path, offenders: [] });
    }
    expect(offenders('import { getContext } from "@services/STAPI";\nmanager.getSnapshot();')).toEqual(["manager.getSnapshot(", "@services/STAPI"]);
  });

  it("lets only the declared host modules touch ST's message DOM, and only inlineMount write into .mes_block", () => {
    const relative = (path: string) => path.slice(SRC.length + 1).replace(/\\/g, "/");
    const MESSAGE_DOM = /mes_block|\.mes\[mesid|closest\("\.mes"\)|#chat \.mes/;
    const touchers = walk(SRC).filter((path) => MESSAGE_DOM.test(readFileSync(path, "utf8"))).map(relative).sort();
    expect(touchers).toEqual(["services/stHost/image.ts", "services/stHost/imageSurface.ts", "services/stHost/inlineMount.ts", "sprites/stage.ts"]);
    const blockWriters = walk(SRC).filter((path) => /mes_block/.test(readFileSync(path, "utf8"))).map(relative);
    expect(blockWriters).toEqual(["services/stHost/inlineMount.ts"]);
    expect(MESSAGE_DOM.test('document.querySelector(`.mes[mesid="3"] .mes_text`)')).toBe(true);
  });

  it("lets only the badge module touch ST's character, recent-chat and past-chat lists (v2.7 06 B)", () => {
    const relative = (path: string) => path.slice(SRC.length + 1).replace(/\\/g, "/");
    const LIST_DOM = /\.group_select\b|\.recentChat[.[]|\.select_chat_block\b|rm_print_characters_block|select_chat_div/;
    const touchers = walk(SRC).filter((path) => !path.endsWith(".stories.tsx") && LIST_DOM.test(readFileSync(path, "utf8"))).map(relative).sort();
    expect(touchers).toEqual(["services/stHost/charListBadges.ts"]);
    expect(LIST_DOM.test('document.querySelector(".group_select[data-grid]")')).toBe(true);
    expect(LIST_DOM.test("context.recentChat")).toBe(false);
  });

  it("keeps the story presence UI away from everything sent to a model (v2.7 06 payload invariance, static half)", () => {
    const PRESENCE = [
      "runtime/rolls.ts", "runtime/playsIndex.ts", "runtime/playsIndexHost.ts", "runtime/playsBackfill.ts", "runtime/presence.ts", "runtime/presenceBadges.ts",
      "runtime/chapterCards.ts", "runtime/displayToggles.ts", "runtime/activityFeed.ts", "runtime/panelGeometry.ts", "runtime/panelStore.ts",
      "services/stHost/charListBadges.ts", "services/stHost/storyWand.ts", "services/stHost/groupChatFiles.ts", "presenceUi.tsx",
      "components/panels/PanelFrame.tsx", "components/panels/ActivityPanel.tsx", "components/inline/ChapterCard.tsx", "components/inline/RollChips.tsx",
      "components/settings/ContinueList.tsx", "components/settings/PresenceControls.tsx", "studio/components/StoryDisplayEditor.tsx",
      "runtime/widgets.ts", "runtime/gameSheet.ts", "runtime/gameSnapshot.ts", "runtime/gameTypes.ts", "runtime/gameSummary.ts",
      "components/widgets/WidgetCard.tsx", "components/panels/JournalPanel.tsx", "components/panels/StatSheetPanel.tsx", "components/panels/WidgetPanel.tsx",
    ];
    const PROMPT_SEAM = /setStoryExtensionPrompt|clearStoryExtensionPrompt|setExtensionPrompt|INJECTION_REGISTRY|updateInjection|GENERATE_AFTER_DATA|registerHostMacro|chat_metadata\.note/;
    const offenders = PRESENCE.filter((file) => PROMPT_SEAM.test(readFileSync(join(SRC, file), "utf8")));
    expect(offenders).toEqual([]);
    expect(PROMPT_SEAM.test("setStoryExtensionPrompt(key, text)")).toBe(true);
  });

  it("keeps engine purity: no host imports below src/engine", () => {
    for (const path of walk(join(SRC, "engine"))) {
      const offenders = importsOf(path).filter((specifier) => specifier.includes("@services") || specifier.includes("STAPI"));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("keeps the pure engine and stagecraft cores from importing the runtime layer that consumes them", () => {
    for (const path of [...walk(join(SRC, "engine")), ...walk(join(SRC, "stagecraft"))]) {
      const offenders = importsOf(path).filter((specifier) => specifier.startsWith("@runtime") || /\.\.\/runtime\//.test(specifier));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  // The one stagecraft invariant that must never be re-argued: a curator proposes presentation and
  // nothing else. It cannot reach a memory tier or the apply queue, so it cannot write either.
  // v2.2 rule 6: the judge core is pure (questions, parsing, policy); the transport is stHost/judge.ts.
  it("keeps the judge core pure and out of the engine", () => {
    for (const path of walk(join(SRC, "judge"))) {
      const offenders = importsOf(path).filter((specifier) => specifier.includes("@services") || specifier.includes("STAPI") || specifier.includes("@runtime") || specifier.startsWith("../"));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
    for (const path of walk(join(SRC, "engine"))) {
      const offenders = importsOf(path).filter((specifier) => specifier.includes("@judge") || specifier.includes("/judge"));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("keeps the stagecraft coordinator and its curator writer away from the blackboard and the memory tiers", () => {
    for (const path of STAGECRAFT_ISOLATED.map((file) => join(SRC, file))) {
      expect({ path, ...stagecraftLeaks(readFileSync(path, "utf8")) }).toEqual({ path, offenders: [], writes: [] });
    }
    expect(stagecraftLeaks('import { addMemoryEntries } from "@memory/index";\nthis.deps.enqueueExtractorDeltas([]);')).toEqual({
      offenders: ["@memory/index"], writes: ["enqueueExtractorDeltas("],
    });
  });

  it("lets only the declared writer write the continuity note (v2.2 plan 05)", () => {
    const spec = INJECTION_REGISTRY.continuityNote;
    const declared = `${spec.writer}.ts`;
    const WRITE_SEAM = /setStoryExtensionPrompt\(|clearStoryExtensionPrompt\(/;
    const relative = (path: string) => path.slice(SRC.length + 1).replace(/\\/g, "/");
    // A reader is fine — the next-turn preview labels the row from the same registry entry.
    const writers = walk(SRC)
      .filter((path) => new RegExp(`INJECTION_REGISTRY\\.continuityNote|${spec.key}`).test(readFileSync(path, "utf8")))
      .filter((path) => WRITE_SEAM.test(readFileSync(path, "utf8")))
      .map(relative)
      .sort();
    expect({ writers, declared }).toEqual({ writers: [declared], declared });
  });

  it("keeps the scene coordinator a reader: no memory, generation or pacing, no spine writes (v2.2 plan 03)", () => {
    const path = join(SRC, "runtime/coordinators/sceneCoordinator.ts");
    const source = readFileSync(path, "utf8");
    expect({ path, offenders: importsOf(path).filter((specifier) => /@memory|@generation|@pacing|@services/.test(specifier)) }).toEqual({ path, offenders: [] });
    expect({ path, writes: [...source.matchAll(/enqueue\w*\(|applyEntries\(|setMemory\(|commitBoundary\(/g)].map((match) => match[0]) }).toEqual({ path, writes: [] });
  });

  it("keeps coordinators from importing each other outside their typed deps", () => {
    for (const path of walk(join(SRC, "runtime/coordinators"))) {
      const valueImports = valueImportsOf(readFileSync(path, "utf8")).filter((specifier) => COORDINATOR_SPECIFIER.test(specifier));
      expect({ path, valueImports }).toEqual({ path, valueImports: [] });
    }
    expect(valueImportsOf('import { MemoryCoordinator } from "./memoryCoordinator";\nimport type { X } from "./copilotCoordinator";').filter((specifier) => COORDINATOR_SPECIFIER.test(specifier))).toEqual(["./memoryCoordinator"]);
  });

  it("keeps the delegated units host-free and off the coordinators they serve", () => {
    for (const path of DELEGATED_UNITS.map((file) => join(SRC, file))) {
      expect({ path, ...unitLeaks(readFileSync(path, "utf8")) }).toEqual({ path, host: [], coordinators: [] });
    }
    expect(unitLeaks('import { getContext } from "@services/STAPI";\nimport { MemoryCoordinator } from "./coordinators/memoryCoordinator";\nimport type { ExtractionCoordinator } from "./coordinators/extractionCoordinator";')).toEqual({
      host: ["@services/STAPI"], coordinators: ["./coordinators/memoryCoordinator"],
    });
  });
});
