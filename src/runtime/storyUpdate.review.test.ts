// Promoted from the 2026-09-18 external review. R7 is rewritten: the review asserted the escaped
// string the old string-building API would produce, but the accepted remedy returns a structured
// description the popup renders as text nodes. The contract below holds either way — what must be
// true is that authored story text never reaches the popup as live markup. v2.3 plan 01 §A.

import { describeStoryUpdate } from "@runtime/storyUpdate";
import { control, finding, must } from "../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [], extensionSettings: {} }) }));

const invalidating = { classification: "invalidating", entries: [], droppedQualityKeys: [] } as never;

// Whatever shape the description takes, this is the text a renderer would put on screen.
const rendered = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

control("an ordinary story title survives the update description", () => {
  expect(rendered(describeStoryUpdate("Crossing", invalidating))).toContain("Crossing");
});

finding("R7", () => {
  const marker = '<img src=x onerror="globalThis.reviewMarker=1">';
  const text = rendered(describeStoryUpdate(marker, invalidating));
  must(
    !text.includes(marker),
    "an imported story title reached the update popup as live markup: the description interpolates the title into HTML and the host assigns it to innerHTML, so an authored story can execute script in the popup",
  );
});
