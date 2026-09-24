import * as fs from "node:fs";
import * as path from "node:path";
import { isValidationErrorList, parseStoryV2, storyWarnings } from "@engine/index";

const fixture = fs.readFileSync(path.join(process.cwd(), "test/fixtures/placeholder-enums.story.json"), "utf8");
const parsed = parseStoryV2(JSON.parse(fixture));

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  showConfirmPopup: async () => true,
}));
jest.mock("./persistence", () => ({
  adoptChatState: jest.fn(() => true),
  unreadableStored: () => null,
  blobMismatch: () => null,
  dropPersistedRuntime: jest.fn(),
  getSelectedStoryId: () => null,
  loadPersistedRuntime: () => null,
  setSelectedStoryId: jest.fn(),
}));
jest.mock("./storyLibrary", () => ({
  findStoryRecord: () => ({ id: "placeholder-enums", raw: {} }),
  listStoryRecords: () => [],
  loadPinnedStory: () => null,
  loadStoryRecord: () => ({ record: { id: "placeholder-enums" }, story: parsed }),
  removeStoryRecord: () => true,
  saveStoryRecord: () => ({ record: { id: "placeholder-enums" }, story: parsed }),
}));

import { importStoryJson, type StorySelectionDeps } from "./storySelection";
import { finding } from "../../test/findings/ledger";

// V18 (S1): the placeholder warning lived only in the Studio's diagnostics, so a story imported as
// JSON — the way every campaign story reached a chat — never showed it. The in-tree fixture carries
// the five placeholder shapes and one non-latching control; no test read it until now.
describe("V18: a latching enum with a placeholder warns outside the Studio", () => {
  finding("S1", () => {
    if (isValidationErrorList(parsed)) throw new Error(JSON.stringify(parsed));
    const warnings = storyWarnings(parsed);
    expect(warnings.map((warning) => warning.path)).toEqual(["qualities.0.values", "qualities.1.values", "qualities.2.values", "qualities.3.values", "qualities.4.values"]);
    expect(warnings.map((warning) => warning.message.split("'")[1])).toEqual(["verdict", "allegiance", "oath", "wound", "pay"]);
    expect(warnings.every((warning) => warning.message.includes("the unset state is the absence of a value"))).toBe(true);
  });

  it("an import hands the warnings to the host and still plays the story", async () => {
    const warn = jest.fn();
    const loadStory = jest.fn(async () => undefined);
    const deps = { loadStory, warn, fail: jest.fn(), setStatus: jest.fn(), isLoaded: () => false, loadedFallback: () => null, clearStory: jest.fn() } as unknown as StorySelectionDeps;
    await importStoryJson(deps, fixture);
    expect(warn).toHaveBeenCalledTimes(1);
    expect((warn.mock.calls[0] as unknown[][])[0]).toHaveLength(5);
    expect(loadStory).toHaveBeenCalled();
    expect(loadStory.mock.invocationCallOrder[0]).toBeLessThan(warn.mock.invocationCallOrder[0]);
  });
});
