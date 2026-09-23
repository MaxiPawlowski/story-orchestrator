// F2, from the v2.2 acceptance findings: "the in-memory settings view disagrees with stored
// settings after reload". Reproduced live on 2026-09-20 while running J1 — on a chat with no story
// selected, `getSnapshot().extraction.settings.profileId` reads `null` while
// `getGlobalSettings().extraction.profileId` holds the configured profile.
//
// Traced to source: `extras` is built by `createExtras()` on the storyless paths (the field
// initialiser and `clearStory`), which fills `settings` from `defaultExtractionSettings()` and
// never calls `applyGlobalSettings`. Only `hydrateExtras` — the path a chat WITH a story takes —
// folds the install-wide settings in. So anything reading the snapshot on a storyless chat sees
// defaults presented as settings, and cannot tell "not configured" from "not loaded yet".
//
// Owner: plan 06. v2.3 plan 01 §A writes the reproduction; plan 06 flips the row.

import { createExtras, hydrateExtras } from "@runtime/extras";
import { defaultExtractionSettings } from "@runtime/settingsStore";
import { control, finding, must } from "../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({
    chatId: "storyless-chat",
    chat: [],
    extensionSettings: {
      "story-orchestrator": {
        // What the install actually holds: a configured memory profile.
        settings: { extraction: { enabled: true, profileId: "artemis-memory", cadence: 7, stabilityLag: 0, reconciliationMultiplier: 1.5 } },
      },
    },
  }),
  saveMetadata: jest.fn(),
}));

const storedProfile = "artemis-memory";

control("a chat that hydrates a story sees the install-wide extraction settings", () => {
  const extras = hydrateExtras(undefined);
  expect(extras.extraction.settings.profileId).toBe(storedProfile);
  expect(extras.extraction.settings.cadence).toBe(7);
});

control("the shipped defaults do not name a profile", () => {
  expect(defaultExtractionSettings().profileId).toBeNull();
});

finding("F2", () => {
  // The storyless path: no persisted blob, so `createExtras()` is what the snapshot is built from.
  const extras = createExtras();
  must(
    extras.extraction.settings.profileId === storedProfile,
    `on a chat with no story the settings view reports profileId=${JSON.stringify(extras.extraction.settings.profileId)} and cadence=${extras.extraction.settings.cadence}, while the install holds ${JSON.stringify(storedProfile)} and cadence 7 — createExtras() fills settings from the defaults and never applies the install-wide settings, so the panel cannot tell "not configured" from "not loaded yet"`,
  );
});
