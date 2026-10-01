import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HudStrip } from "../components/drawer/HudStrip";
import { MemoryTab } from "../components/drawer/tabs/MemoryTab";
import { PlayerOverview } from "../components/drawer/PlayerOverview";
import { InlineControls } from "../components/settings/InlineControls";
import { ChapterControls } from "../components/settings/ChapterControls";
import { RoleProfilesGroup } from "../components/settings/RoleProfilesGroup";
import { WorldInfoGatingGroup } from "../components/settings/WorldInfoGatingGroup";
import EntryPoints from "../components/settings/EntryPoints";
import { CheckRow } from "../components/settings/Field";
import { PLAYER_COPY } from "./narrative";
import { createSaveHealth } from "./saveHealth";
import { defaultInlineSettings } from "./settingsModel";
import type { RuntimeManager } from "./index";
import type { RuntimeSnapshot } from "./types";

const html = (element: ReactElement) => renderToStaticMarkup(element);
const manager = {} as unknown as RuntimeManager;
const noop = () => undefined;

const snapshot = (authorView: boolean, overrides: Record<string, unknown> = {}): RuntimeSnapshot => ({
  ready: true,
  storyId: "sun-ruins",
  ui: { authorView, hudEnabled: true, inline: defaultInlineSettings(), announceTransitions: true },
  inline: { level: authorView ? 4 : 2, requested: 4, window: 20, categories: {}, newestMessageId: 0, byMessage: {} },
  pipeline: { state: "error", text: "The story stopped keeping up.", detail: "SECRET-PIPELINE-DETAIL", needsSetup: false, nextAction: "wait" },
  narrative: { title: "Sun Ruins", text: "", sections: [{ id: "now", label: "Where you are", lines: ["The Gate"] }] },
  lastRollback: { checkpointName: "CP2 - Author Name", playerName: "The Gate", at: "t" },
  rollbackUnavailable: null,
  tension: { level: null },
  pendingDeltas: [],
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [], mutedMembers: [] },
  extraction: { settings: { enabled: true, profileId: "p" }, audits: [] },
  memory: {
    settings: { enabled: true, epistemicLedgerCapable: true, chapters: { seal: true, storySoFar: true, fold: true, recap: true, chronicleTokens: 400 } },
    entries: [{
      id: "m1", tier: "facts", text: "Belle keeps the key.", characterId: "belle", evidence: "SECRET-EVIDENCE-QUOTE", importance: 2, expiration: "permanent",
      recallCount: 0, provenance: { source: "extractor", messageId: 2, boundary: 1, pass: "shared-read", validity: "source-removed", override: true },
    }],
    backfill: { running: false, processed: 3, total: 9, lastError: "TypeError: RAW-ERROR-MESSAGE" },
    pinnedOverflow: 0,
    sceneCount: 0,
  },
  castNames: { belle: "Belle Hart" },
  copilot: { enabled: false },
  library: [{ id: "sun-ruins", title: "Sun Ruins" }],
  saveHealth: createSaveHealth(),
  loreEvidence: { last: null, hiddenBooks: ["Sun Ruins Lore"] },
  chapters: { declared: false, current: null, records: [], ended: false, epilogue: null },
  ...overrides,
}) as unknown as RuntimeSnapshot;

describe("CR-U: player mode never shows ids, internals or raw errors", () => {
  it("H1/H2: the HUD chip says the pipeline text and the player's place name, never the detail or the author checkpoint name", () => {
    const rolled = html(createElement(HudStrip, { snapshot: snapshot(false), onOpenDrawer: noop }));
    expect(rolled).toContain("The Gate");
    expect(rolled).not.toContain("CP2 - Author Name");
    const failing = html(createElement(HudStrip, { snapshot: snapshot(false, { lastRollback: null }), onOpenDrawer: noop }));
    expect(failing).not.toContain("SECRET-PIPELINE-DETAIL");
    expect(failing).toContain("The story stopped keeping up.");
    expect(html(createElement(HudStrip, { snapshot: snapshot(true, { lastRollback: null }), onOpenDrawer: noop }))).toContain("SECRET-PIPELINE-DETAIL");
  });

  it("H2: the player overview's rollback notice names the player's place", () => {
    const page = html(createElement(PlayerOverview, { snapshot: snapshot(false) }));
    expect(page).toContain("stepped back to The Gate");
    expect(page).not.toContain("CP2 - Author Name");
  });

  it("H3/H6/M2: the memory tab shows a constant error, a player phrase for provenance, the character's name and no evidence", () => {
    const page = html(createElement(MemoryTab, { snapshot: snapshot(false), manager, authorView: false }));
    expect(page).not.toContain("RAW-ERROR-MESSAGE");
    expect(page).toContain(PLAYER_COPY.memorizeError);
    expect(page).not.toContain("SECRET-EVIDENCE-QUOTE");
    expect(page).not.toContain("source-removed");
    expect(page).toContain(PLAYER_COPY.sourceChanged);
    expect(page).toContain("Belle Hart");
    expect(page).not.toContain("(belle)");
  });

  it("H5: player mode offers inline levels 0-2 only and shows the effective level", () => {
    const page = html(createElement(InlineControls, { snapshot: snapshot(false, { ui: { authorView: false, inline: { ...defaultInlineSettings(), level: 4 } } }), manager }));
    expect(page).not.toMatch(/<option value="3"/);
    expect(page).not.toMatch(/<option value="4"/);
    const author = html(createElement(InlineControls, { snapshot: snapshot(true, { ui: { authorView: true, inline: { ...defaultInlineSettings(), level: 4 } } }), manager }));
    expect(author).toMatch(/<option value="4" selected/);
  });

  it("M3: a role route's failure detail and the scan capability detail are author-only", () => {
    const routes = [{ role: "read", label: "Story reads", profileId: "p", state: "failed", detail: "SECRET-ROUTE-DETAIL", effort: "default" }];
    const props = { routes, assigned: {}, profiles: [], testing: null, onAssign: noop, onTest: noop, onEffort: noop } as unknown as Parameters<typeof RoleProfilesGroup>[0];
    expect(html(createElement(RoleProfilesGroup, props))).not.toContain("SECRET-ROUTE-DETAIL");
    expect(html(createElement(RoleProfilesGroup, { ...props, authorView: true }))).toContain("SECRET-ROUTE-DETAIL");
    const status = {
      mode: "scan", active: false, capability: { state: "error", detail: "SECRET-CAPABILITY" }, ledger: { books: 1, entries: 2 },
      drift: [{ lorebook: "Ruins", comment: "CP2 - SECRET ENTRY" }], missingKey: [], missing: [], unreadable: [], busy: false,
    } as const;
    const player = html(createElement(WorldInfoGatingGroup, { status: status as never, authorView: false, onChoose: noop, onRenormalize: noop, scanMemory: false, onScanMemory: noop }));
    expect(player).not.toContain("SECRET-CAPABILITY");
    expect(player).not.toContain("CP2 - SECRET ENTRY");
    const author = html(createElement(WorldInfoGatingGroup, { status: status as never, authorView: true, onChoose: noop, onRenormalize: noop, scanMemory: false, onScanMemory: noop }));
    expect(author).toContain("SECRET-CAPABILITY");
    expect(author).toContain("CP2 - SECRET ENTRY");
  });

  it("M5: chapter seal, fold, story-so-far and budget are author-only; the Previously toggle stays", () => {
    const player = html(createElement(ChapterControls, { snapshot: snapshot(false), manager }));
    for (const id of ["so-chapter-seal", "so-chapter-fold", "so-chapter-story-so-far", "so-chapter-budget"]) expect(player).not.toContain(`id="${id}"`);
    expect(player).toContain('id="so-chapter-recap"');
    const author = html(createElement(ChapterControls, { snapshot: snapshot(true), manager }));
    for (const id of ["so-chapter-seal", "so-chapter-fold", "so-chapter-story-so-far", "so-chapter-budget"]) expect(author).toContain(`id="${id}"`);
  });

  it("M6/M7/17: Repair in player mode is player copy, with no author-only step, detail or wizard; the wizard entry says why it is off", () => {
    const props = { busy: false, importOpen: false, onToggleImport: noop, onNewStory: noop, onOpenStudio: noop, onOpenDrawer: noop, onRevealSetting: noop, onFixWithWizard: noop };
    const hidden = html(createElement(EntryPoints, { ...props, snapshot: snapshot(false) }));
    expect(hidden).not.toContain("Another extension");
    expect(hidden).not.toContain("Sun Ruins Lore");
    expect(hidden).toContain("Nothing is missing.");
    const lore = snapshot(false, { requirements: { ready: false, missingPersonas: [], missingMembers: [], missingLorebooks: ["Wendhope Lore"] } });
    const page = html(createElement(EntryPoints, { ...props, snapshot: lore }));
    expect(page).not.toContain("Wendhope Lore");
    expect(page).not.toContain("so-entry-fix-with-wizard");
    expect(page).toMatch(/id="so-new-story-wizard"[^>]*disabled/);
    expect(page).toContain("Turn on the wizard under Author services first.");
    const author = html(createElement(EntryPoints, { ...props, snapshot: snapshot(true, { ...lore, ui: { authorView: true } }) }));
    expect(author).toContain("Wendhope Lore");
    expect(author).toContain("so-entry-fix-with-wizard");
  });

  it("1/2: a checkbox's label never contains its help button", () => {
    const row = html(createElement(CheckRow, { id: "x", checked: false, onChange: noop, label: "Continuity warden", help: "Help text" }));
    const label = row.slice(row.indexOf("<label"), row.indexOf("</label>"));
    expect(label).toContain("Continuity warden");
    expect(label).not.toContain("Help text");
    expect(row).toContain("Help: Help text");
  });
});
