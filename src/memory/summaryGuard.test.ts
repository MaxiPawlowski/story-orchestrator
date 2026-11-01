import { coverageOf, guardSummary, mentions, namesIn, SUMMARY_MIN_SHARE } from "./summaryGuard";

const nothing = () => false;

const CHAIN = [
  "Wren and Mira reached the Lantern Inn at dusk. Tobin warned them about the Grey Quarry road and the toll Esk keeps.",
  "Wren and Mira took a room at the Lantern Inn. Tobin repeated his warning about the Grey Quarry road, and Esk counted the toll coins.",
  "Wren and Mira slept at the Lantern Inn while Tobin kept watch.",
  "At dawn Wren paid Esk the toll at the Lantern Inn. Tobin and Mira readied the cart for the Grey Quarry road.",
  "They left.",
  "Wren and Mira rolled out at first light, heading north with the cart and the last of their coin.",
];

const WINDOW = "Tobin: The road is clear for now.\nMira: Then we go.";
const VOCAB = ["Wren", "Mira", "Tobin", "Esk", "Lantern Inn"];

function replay(guarded: boolean, covered: (name: string) => boolean = nothing) {
  let current = CHAIN[0];
  const refusals: string[] = [];
  for (const candidate of CHAIN.slice(1)) {
    const verdict = guardSummary({ summary: candidate, previous: current, window: WINDOW, vocabulary: VOCAB, covered });
    if (!guarded || verdict.ok) current = candidate;
    else refusals.push(verdict.reason);
  }
  const first = namesIn(CHAIN[0], VOCAB);
  const kept = first.filter((name) => mentions(current, name) || covered(name));
  return { retention: kept.length / first.length, refusals };
}

describe("v3.0 41 A2: collapse guard on the rolling short-term summary (memory.summaryGuard)", () => {
  it("names: vocabulary names and capitalised spans, a sentence-opening word only when it is a name elsewhere", () => {
    expect(namesIn("Later that night Mira met the Abbot of Stone. Exhausted, she slept. The Abbot of Stone left.", ["Mira"]).sort())
      .toEqual(["Abbot of Stone", "Mira"].sort());
    expect(namesIn("Then Mirabel waved.", ["Mira"])).toEqual(["Mirabel"]);
    expect(namesIn("Mirabel waved.", ["Mira"])).toEqual([]);
  });

  it("floor (declared before the run): entity retention >= 0.9 over 5 chained compactions with the guard; the unguarded chain is the before", () => {
    const before = replay(false);
    const after = replay(true);
    process.stdout.write(`${JSON.stringify({ retentionBefore: before.retention, retentionAfter: after.retention, refusals: after.refusals })}\n`);
    expect(after.retention).toBeGreaterThanOrEqual(0.9);
    expect(before.retention).toBeLessThan(after.retention);
  });

  it("a name still held by a live row, the ledger, an open arc or a sealed chapter may leave the summary", () => {
    const covered = coverageOf({
      entries: [{ tier: "facts", text: "Esk keeps the toll box.", entities: ["Esk"] }, { tier: "short_term", text: "Grey Quarry road", entities: [] }],
      ledger: [], arcs: [{ text: "Reach the Grey Quarry", status: "resolved" }], chapters: [{ summary: "", short: "They passed the Lantern Inn." }],
    });
    expect([covered("Esk"), covered("Lantern Inn"), covered("Grey Quarry")]).toEqual([true, true, false]);
    expect(guardSummary({ summary: "Wren, Mira and Tobin left at dawn with the cart, ready at last for the long climb to the Grey Quarry.", previous: CHAIN[1], window: WINDOW, vocabulary: VOCAB, covered }))
      .toMatchObject({ ok: true });
  });

  it("refuses a collapse below the share of the previous summary, but not with nothing new to fold in or on the first summary", () => {
    const previous = "Wren and Mira reached the inn and spoke at length with Tobin about the road ahead and its many dangers.";
    const short = "Wren, Mira and Tobin talked.";
    expect(short.length).toBeLessThan(previous.length * SUMMARY_MIN_SHARE);
    expect(guardSummary({ summary: short, previous, window: WINDOW, vocabulary: VOCAB, covered: nothing })).toEqual({ ok: false, reason: "collapsed", dropped: 0 });
    expect(guardSummary({ summary: short, previous, window: "", vocabulary: VOCAB, covered: nothing })).toMatchObject({ ok: true });
    expect(guardSummary({ summary: short, previous: null, window: WINDOW, vocabulary: VOCAB, covered: nothing })).toEqual({ ok: true, entities: ["Wren", "Mira", "Tobin"] });
  });

  it("a refusal names a count, never the dropped names", () => {
    const verdict = guardSummary({ summary: "They left.", previous: CHAIN[0], window: WINDOW, vocabulary: VOCAB, covered: nothing });
    expect(verdict).toEqual({ ok: false, reason: "dropped-detail", dropped: 6 });
  });
});
