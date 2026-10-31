import { parseStoryOrThrow } from "@engine/index";
import { CHECKS } from "./checks";
import { LORE_BUDGET_RING, LoreBudgetLedger, readScanDone, uncappedFinding } from "./loreBudget";
import { startLoreBudget } from "./loreBudgetHost";
import type { RuntimeSnapshot } from "./types";

jest.mock("@services/STAPI", () => ({ observeWorldInfoScanDone: () => () => undefined, readWorldInfoBudgetCap: () => 0 }));

const entry = (world: string, uid: number, content = "x".repeat(400), patch: Record<string, unknown> = {}) => ({ world, uid, comment: `${world} ${uid}`, content, ...patch });

const scan = (options: { overflowed: boolean; all: ReturnType<typeof entry>[]; successful?: ReturnType<typeof entry>[]; activated: ReturnType<typeof entry>[]; loop?: number; sorted?: ReturnType<typeof entry>[] }) => ({
  state: { current: 1, next: 0, loopCount: options.loop ?? 1 },
  new: { all: options.all, successful: options.successful ?? options.all },
  activated: { entries: new Map(options.activated.map((item) => [`${item.world}.${item.uid}`, item])), text: "" },
  sortedEntries: options.sorted ?? options.all,
  budget: { current: 100, overflowed: options.overflowed },
});

const STORY = ["Harbour Lore"];

describe("lore budget evidence (plan 42a G4)", () => {
  it("counts an entry as cut only when the budget overflowed and it matched without activating", () => {
    const cut = entry("Harbour Lore", 3);
    const read = readScanDone(scan({ overflowed: true, all: [entry("Atlas", 1), cut], activated: [entry("Atlas", 1)] }));
    expect(read?.cut.map((item) => item.uid)).toEqual([3]);
    expect(readScanDone(scan({ overflowed: false, all: [entry("Atlas", 1), cut], activated: [entry("Atlas", 1)] }))?.cut).toEqual([]);
  });

  it("leaves out an entry that failed its probability roll (not in new.successful)", () => {
    const rolled = entry("Harbour Lore", 4);
    const read = readScanDone(scan({ overflowed: true, all: [entry("Atlas", 1), rolled], successful: [entry("Atlas", 1)], activated: [entry("Atlas", 1)] }));
    expect(read?.cut).toEqual([]);
  });

  it("names a story entry cut in 2 of the last 10 loud scans, its via, and the book that used the budget", () => {
    const ledger = new LoreBudgetLedger();
    const forced = new Set(["Harbour Lore.3"]);
    const one = () => readScanDone(scan({ overflowed: true, all: [entry("Atlas", 1, "y".repeat(4000)), entry("Harbour Lore", 3), entry("Other", 9)], activated: [entry("Atlas", 1, "y".repeat(4000))] }));
    ledger.note("c1", one()!, STORY, forced, 0);
    expect(ledger.view("c1")?.starved).toEqual([]);
    ledger.note("c1", one()!, STORY, forced, 0);
    const view = ledger.view("c1");
    expect(view?.starved).toEqual([{ book: "Harbour Lore", uid: 3, comment: "Harbour Lore 3", via: "forced", count: 2 }]);
    expect(view?.consumer).toBe("Atlas");
    expect(ledger.view("c2")).toBeNull();
  });

  it("folds the loops of one scan together and keeps only the last ten scans", () => {
    const ledger = new LoreBudgetLedger();
    const cut = (loop: number) => readScanDone(scan({ loop, overflowed: true, all: [entry("Harbour Lore", 3)], activated: [] }))!;
    ledger.note("c1", cut(1), STORY, new Set(), 0);
    ledger.note("c1", cut(2), STORY, new Set(), 0);
    expect(ledger.view("c1")?.scans).toBe(1);
    for (let index = 0; index < 12; index += 1) ledger.note("c1", readScanDone(scan({ overflowed: false, all: [], activated: [] }))!, STORY, new Set(), 0);
    expect(ledger.view("c1")?.scans).toBe(LORE_BUDGET_RING);
    expect(ledger.view("c1")?.starved).toEqual([]);
  });

  it("warns about an uncapped budget only when the story's own books are large", () => {
    const ledger = new LoreBudgetLedger();
    const big = Array.from({ length: 30 }, (_, uid) => entry("Harbour Lore", uid, "z".repeat(400)));
    ledger.note("c1", readScanDone(scan({ overflowed: false, all: [], activated: [], sorted: big }))!, STORY, new Set(), 0);
    expect(uncappedFinding(ledger.view("c1") ?? undefined)).toEqual({ cap: 0, tokens: 3000 });
    ledger.note("c1", readScanDone(scan({ overflowed: false, all: [], activated: [], sorted: big }))!, STORY, new Set(), 2000);
    expect(uncappedFinding(ledger.view("c1") ?? undefined)).toBeNull();
    ledger.note("c1", readScanDone(scan({ overflowed: false, all: [], activated: [], sorted: big.slice(0, 5) }))!, STORY, new Set(), 0);
    expect(uncappedFinding(ledger.view("c1") ?? undefined)).toBeNull();
  });

  it("the two checks fire from the view and stay quiet without it", () => {
    const starved = CHECKS.find((check) => check.id === "lore-budget-starved")!;
    const uncapped = CHECKS.find((check) => check.id === "lore-budget-uncapped")!;
    const loreBudget = { chatId: "c1", scans: 10, starved: [{ book: "Harbour Lore", uid: 3, comment: "Harbour master", via: "forced" as const, count: 3 }], consumer: "Atlas", lastCut: [], cap: 0, storyTokens: 4000 };
    expect(starved.detect({ loreBudget } as unknown as RuntimeSnapshot)?.detail).toContain("Harbour master (3 of 10)");
    expect(uncapped.detect({ loreBudget } as unknown as RuntimeSnapshot)?.player).toBeTruthy();
    expect(starved.detect({} as RuntimeSnapshot)).toBeNull();
    expect(uncapped.detect({} as RuntimeSnapshot)).toBeNull();
  });
});

describe("lore budget host (plan 42a G4)", () => {
  const story = parseStoryOrThrow({
    id: "dock", title: "Dock", description: "",
    qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
    checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
    transitions: [], roster: [], requirements: { lorebooks: ["Harbour Lore"] },
  });

  const run = (overrides: Partial<Parameters<typeof startLoreBudget>[0]> = {}) => {
    let emit: (args: unknown) => void = () => undefined;
    const ledger = new LoreBudgetLedger();
    const notified: number[] = [];
    startLoreBudget({
      enabled: () => true, chatId: () => "c1", ownedChat: () => "c1", story: () => story, loud: () => true, forced: () => [{ world: "Harbour Lore", uid: 3 }],
      notify: () => { notified.push(1); }, observe: (handler) => { emit = handler; return () => undefined; }, cap: () => 0, ledger, ...overrides,
    });
    const args = scan({ overflowed: true, all: [entry("Atlas", 1), entry("Harbour Lore", 3)], activated: [entry("Atlas", 1)] });
    emit(args);
    return { ledger, notified, args };
  };

  it("records a loud scan in the story's chat and never writes to the scan", () => {
    const { ledger, notified, args } = run();
    expect(ledger.view("c1")?.lastCut).toEqual([{ book: "Harbour Lore", uid: 3, comment: "Harbour Lore 3", via: "forced" }]);
    expect(notified).toHaveLength(1);
    expect(args.new.all).toHaveLength(2);
    expect(args.activated.entries.size).toBe(1);
  });

  it("ignores a quiet scan, another chat, and the switch off", () => {
    for (const overrides of [{ loud: () => false }, { ownedChat: () => "c2" }, { enabled: () => false }]) {
      expect(run(overrides).ledger.view("c1")).toBeNull();
    }
  });
});
