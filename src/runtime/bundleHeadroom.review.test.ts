import * as fs from "node:fs";
import * as path from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const lazyLoads: string[] = [];

jest.mock("@utils/lazyRetry", () => {
  const actual = jest.requireActual<typeof import("@utils/lazyRetry")>("@utils/lazyRetry");
  return {
    ...actual,
    lazyRetry: (factory: () => Promise<{ default: never }>) => actual.lazyRetry(() => {
      lazyLoads.push(factory.toString());
      return factory();
    }),
  };
});

import { DrawerTabs, type DrawerDriver } from "../components/drawer/DrawerTabs";
import { HudStrip } from "../components/drawer/HudStrip";
import { PlayerOverview } from "../components/drawer/PlayerOverview";
import { createSaveHealth } from "./saveHealth";
import { defaultInlineSettings } from "./settingsModel";
import type { RuntimeManager } from "./index";
import type { RuntimeSnapshot } from "./types";

const noop = () => undefined;
const manager = {} as unknown as RuntimeManager;
const driver = { context: null, activeNudge: null, controller: {} } as unknown as DrawerDriver;

const snapshot = (authorView: boolean): RuntimeSnapshot => ({
  ready: true,
  storyId: "sun-ruins",
  storyIdentity: { id: "sun-ruins", pinned: true, drifted: false },
  ui: { authorView, hudEnabled: true, inline: defaultInlineSettings(), announceTransitions: true },
  inline: { level: authorView ? 4 : 2, requested: 4, window: 20, categories: {}, newestMessageId: 0, byMessage: {} },
  pipeline: { state: "idle", text: "Up to date.", detail: "", needsSetup: false, nextAction: "wait" },
  narrative: { title: "Sun Ruins", text: "", sections: [{ id: "now", label: "Where you are", lines: ["The Gate"] }] },
  lastRollback: null,
  rollbackUnavailable: null,
  tension: { level: null },
  pendingDeltas: [],
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [], mutedMembers: [] },
  extraction: { settings: { enabled: true, profileId: "p" }, audits: [] },
  memory: { settings: { enabled: true, epistemicLedgerCapable: true }, entries: [], backfill: null, pinnedOverflow: 0, sceneCount: 0 },
  castNames: {},
  copilot: { enabled: false },
  library: [{ id: "sun-ruins", title: "Sun Ruins" }],
  saveHealth: createSaveHealth(),
  loreEvidence: { last: null, hiddenBooks: [] },
  chapters: { declared: false, current: null, records: [], ended: false, epilogue: null },
  talk: { enabled: true },
  pacing: { alpha: 0.3, shapeOverride: null, hintEnabled: true },
  scene: null,
  convergence: [],
  checkpoints: [],
  activeCheckpointId: null,
}) as unknown as RuntimeSnapshot;

const render = (element: ReactElement) => {
  lazyLoads.length = 0;
  let suspended = false;
  try {
    renderToStaticMarkup(element);
  } catch {
    suspended = true;
  }
  return { loads: [...lazyLoads], suspended };
};

describe("bundle headroom: player mode's first render loads no lazy chunk", () => {
  it("renders the player drawer and the HUD from the main entry alone", () => {
    expect(render(createElement(DrawerTabs, { snapshot: snapshot(false), manager, driver }))).toEqual({ loads: [], suspended: false });
    expect(render(createElement(PlayerOverview, { snapshot: snapshot(false) }))).toEqual({ loads: [], suspended: false });
    expect(render(createElement(HudStrip, { snapshot: snapshot(false), onOpenDrawer: noop }))).toEqual({ loads: [], suspended: false });
  });

  it("control: the author's inspector does reach a lazy chunk, so the counter sees one", () => {
    const { loads, suspended } = render(createElement(DrawerTabs, { snapshot: snapshot(true), manager, driver, inspect: { messageId: 0, onClose: noop } }));
    expect(suspended).toBe(true);
    expect(loads.some((source) => source.includes("MessageInspector"))).toBe(true);
  });
});

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("bundle headroom: author-only code stays out of the main entry", () => {
  it("the engine barrel does not re-export the story diff, which only the author's story update loads", () => {
    expect(read("src/engine/index.ts")).not.toMatch(/storyDiff/);
    const update = read("src/runtime/storyUpdate.ts");
    expect(update).toMatch(/await import\("@engine\/storyDiff"\)/);
    expect(update).not.toMatch(/^import \{[^}]*\b(diffStories|pruneEngineState)\b/m);
  });

  it("the settings panel loads the judge group lazily", () => {
    const panel = read("src/components/settings/SettingsPanel.tsx");
    expect(panel).toMatch(/lazyRetry\(\(\) => import\("\.\/JudgeSettingsGroup"\)\)/);
    expect(panel).not.toMatch(/^import JudgeSettingsGroup\b/m);
  });

  it("the host barrel does not re-export the image and sprite wrappers, which only their lazy chunks import", () => {
    const barrel = read("src/services/STAPI.ts");
    expect(barrel).not.toMatch(/stHost\/(image|imageSurface|sprites|gpuBroker)"/);
  });

  it("the expansion coordinator loads generation, its critic and its prompts only when it generates", () => {
    const coordinator = read("src/runtime/coordinators/expansionCoordinator.ts");
    expect(coordinator).toMatch(/import\("\.\.\/expansionUnit"\)/);
    expect(coordinator).not.toMatch(/^import [^;]*"@generation\/(index|generate|prompts|critic|parse)"/m);
    expect(read("src/runtime/extras.ts")).not.toMatch(/"@generation\/index"/);
  });

  it("postcss keeps the mount-root :is() list instead of expanding every utility five times", () => {
    expect(read("postcss.config.js")).toMatch(/"is-pseudo-class": false/);
  });
});
