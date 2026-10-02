import { plantedModel } from "../../test/support/modelCall";
// Promoted from the 2026-09-18 external review. R8: the wizard is create-only by contract, but it
// treats a story's `requirements.lorebooks` as write authority — so importing a story that merely
// DECLARES a dependency on one of the user's own books lets the wizard overwrite entries in it.
// v2.3 plan 01 §A.

import { parseStoryV2OrThrow } from "@engine/index";
import { CopilotCoordinator } from "@runtime/coordinators/copilotCoordinator";
import { control, finding, must } from "../../test/findings/ledger";
import { testOwnership } from "../../test/findings/testOwnership";

const host = {
  loadLorebook: jest.fn(),
  upsertWIEntry: jest.fn(),
  enableWIEntry: jest.fn(),
  disableWIEntry: jest.fn(),
  getContext: () => ({ chat: [], extensionSettings: {} }),
  listAllLorebooks: () => ["Existing user book"],
};
const { upsertWIEntry } = host;

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "review-independent",
  title: "Review crossing",
  description: "Independent fixture",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [
    { id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true },
    { id: "island", name: "Island", objective: "Rest", type: "anchor" },
  ],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
  roster: [],
});

const coordinator = (storyValue: ReturnType<typeof story>) => new CopilotCoordinator({ hosts: { prompt: host, chat: { lastMessageText: () => "" }, provisioning: host }, ownership: testOwnership(),
  getStory: () => storyValue,
  getState: () => null,
  getSettings: () => ({}) as never,
  model: plantedModel,
  getCanon: () => "",
  notify: () => {},
} as never);

beforeEach(() => jest.clearAllMocks());

control("the wizard refuses a book the story never mentions", async () => {
  const result = await coordinator(story()).applyProvisioning({ kind: "upsertLorebookEntry", lorebook: "Other book", comment: "Entry", content: "Text", keys: [] } as never);
  expect(result.ok).toBe(false);
});

finding("R8", async () => {
  const s = story();
  s.requirements = { lorebooks: ["Existing user book"] } as never;
  (upsertWIEntry as jest.Mock).mockResolvedValue("updated");
  const result = await coordinator(s).applyProvisioning({ kind: "upsertLorebookEntry", lorebook: "Existing user book", comment: "User entry", content: "Overwritten", keys: [] } as never);
  must(
    result.ok === false && (upsertWIEntry as jest.Mock).mock.calls.length === 0,
    `a story that merely declares a dependency on the user's own lorebook was granted write authority over it (ok=${result.ok}, host writes=${(upsertWIEntry as jest.Mock).mock.calls.length}) — a requirement is not a grant`,
  );
});
