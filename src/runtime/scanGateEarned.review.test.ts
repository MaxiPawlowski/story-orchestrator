import { readFileSync } from "fs";
import { join } from "path";
import { agendaStepKey, parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import "@engine/life/derive";
import { ScanGateProvider } from "./worldInfoScan";
import { ScanGuard } from "./worldInfoScanGuard";

const STORY = parseStoryV2OrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")));
const STEP = agendaStepKey("arin", "debt");

const world = { values: { [STEP]: 1 } as Record<string, unknown> };

const sources = (withValues: boolean) => ({
  chatId: () => "c1", ownedChat: () => "c1", openChat: () => "c1", storyChat: () => "c1",
  story: (): NormalizedStoryV2 | null => STORY, path: () => ["start"], ready: () => true,
  library: () => [STORY], libraryRevision: () => "r1", ledger: () => ({}),
  ...(withValues ? { values: () => world.values } : {}),
});

const smuggler = (gate: Map<string, { entries: Map<string, boolean> }>) => [...gate.values()].map((book) => book.entries.get("Smuggler paid")).find((on) => on !== undefined);

describe("v2.8: an earned world_info switch (agenda step, quest reward) reaches the per-scan gate, not only the file path", () => {
  beforeEach(() => { world.values = { [STEP]: 1 }; });

  it("scan mode: the agenda entry is off before its step lands, on after, and off again when the step rolls back", () => {
    const provider = new ScanGateProvider(sources(true));
    expect(smuggler(provider.choose().gate)).toBe(false);
    world.values = { [STEP]: 2 };
    expect(smuggler(provider.choose().gate)).toBe(true);
    world.values = { [STEP]: 1 };
    expect(smuggler(provider.choose().gate)).toBe(false);
  });

  it("file mode: the scan guard keeps the copy the file path wrote, instead of forcing the earned entry back off", () => {
    const guard = new ScanGuard(sources(true));
    world.values = { [STEP]: 2 };
    expect(smuggler(guard.gate().gate)).toBe(true);
    world.values = { [STEP]: 1 };
    expect(smuggler(guard.gate().gate)).toBe(false);
  });

  it("control: without the blackboard values the gate cannot see the landed step (the defect: the entry stays off)", () => {
    world.values = { [STEP]: 2 };
    expect(smuggler(new ScanGateProvider(sources(false)).choose().gate)).toBe(false);
    expect(smuggler(new ScanGuard(sources(false)).gate().gate)).toBe(false);
  });
});
