import { applyArcSignals, capOpenArcs, capResolvedArcs, matchArcBridges, openArcTexts, removeArc, rollbackArcs, setArcPinned, setArcSummary } from "./arcs";
import { parseArcLine } from "./parse";
import type { ArcEntry, ParsedArcSignal } from "./types";

const ctx = (boundary: number, messageId?: number) => ({ boundary, messageId });

describe("parseArcLine", () => {
  it("parses an [arc] line", () => {
    expect(parseArcLine("[arc] The identity of whoever burned the granary is still unknown.")).toEqual({
      kind: "open",
      text: "The identity of whoever burned the granary is still unknown.",
    });
  });

  it("parses a [resolved] line", () => {
    expect(parseArcLine("[resolved] The missing heir was found alive in the northern keep.")).toEqual({
      kind: "resolved",
      text: "The missing heir was found alive in the northern keep.",
    });
  });

  it("is case-insensitive on the tag", () => {
    expect(parseArcLine("[ARC]   Mira swore revenge on the merchant.")?.kind).toBe("open");
  });

  it("rejects non-arc lines and empty text", () => {
    expect(parseArcLine("MEMORY type=fact importance=2 expiration=permanent text=\"x\" evidence=\"y\"")).toBeNull();
    expect(parseArcLine("[arc]   ")).toBeNull();
  });
});

describe("applyArcSignals", () => {
  const openSig = (text: string): ParsedArcSignal => ({ kind: "open", text });
  const resolveSig = (text: string): ParsedArcSignal => ({ kind: "resolved", text });

  it("opens a new arc above the minimum length", () => {
    const result = applyArcSignals([], [openSig("Mira swore revenge on the merchant and has not acted yet.")], ctx(3, 12));
    expect(result.opened).toHaveLength(1);
    expect(result.arcs[0]).toMatchObject({ status: "open", openedAt: 3, openedMessageId: 12 });
  });

  it("drops arc candidates at or below the minimum length", () => {
    const result = applyArcSignals([], [openSig("too short")], ctx(1));
    expect(result.opened).toHaveLength(0);
  });

  it("deduplicates near-identical open arcs within a batch", () => {
    const result = applyArcSignals([], [
      openSig("The identity of the granary arsonist is still unknown to everyone."),
      openSig("The identity of the granary arsonist is still unknown to all of them."),
    ], ctx(1));
    expect(result.opened).toHaveLength(1);
  });

  it("does not re-open an arc that duplicates an existing open one", () => {
    const existing: ArcEntry = { id: "a1", text: "The identity of the granary arsonist is still unknown to everyone.", status: "open", entities: [], openedAt: 0 };
    const result = applyArcSignals([existing], [openSig("The identity of the granary arsonist is still unknown to all of them.")], ctx(2));
    expect(result.opened).toHaveLength(0);
    expect(result.arcs).toHaveLength(1);
  });

  it("resolves the best-matching open arc conservatively", () => {
    const arcs: ArcEntry[] = [
      { id: "a1", text: "Mira swore revenge on the merchant and has not acted yet.", status: "open", entities: [], openedAt: 0 },
      { id: "a2", text: "The identity of the granary arsonist is still unknown.", status: "open", entities: [], openedAt: 0 },
    ];
    const result = applyArcSignals(arcs, [resolveSig("Mira took her revenge on the merchant at last.")], ctx(5));
    expect(result.resolved.map((arc) => arc.id)).toEqual(["a1"]);
    expect(result.arcs.find((arc) => arc.id === "a1")).toMatchObject({ status: "resolved", resolvedAt: 5 });
    expect(result.arcs.find((arc) => arc.id === "a2")?.status).toBe("open");
  });

  it("does not resolve when no open arc clears the threshold", () => {
    const arcs: ArcEntry[] = [{ id: "a1", text: "Mira swore revenge on the merchant.", status: "open", entities: [], openedAt: 0 }];
    const result = applyArcSignals(arcs, [resolveSig("The northern keep collapsed in the storm.")], ctx(4));
    expect(result.resolved).toHaveLength(0);
    expect(result.arcs[0].status).toBe("open");
  });
});

describe("arc utilities", () => {
  const arc = (id: string, over: Partial<ArcEntry> = {}): ArcEntry => ({ id, text: `arc ${id}`, status: "open", entities: [], openedAt: 0, ...over });

  it("caps resolved unpinned arcs but keeps open and pinned ones", () => {
    const arcs = [
      arc("open-1"),
      arc("pin-1", { status: "resolved", pinned: true }),
      ...Array.from({ length: 35 }, (_, i) => arc(`res-${i}`, { status: "resolved" })),
    ];
    const capped = capResolvedArcs(arcs, 30);
    expect(capped.filter((a) => a.status === "resolved" && !a.pinned)).toHaveLength(30);
    expect(capped.find((a) => a.id === "open-1")).toBeDefined();
    expect(capped.find((a) => a.id === "pin-1")).toBeDefined();
    expect(capped.find((a) => a.id === "res-0")).toBeUndefined();
  });

  it("drops arcs opened at or after the rollback message and re-opens later-resolved ones", () => {
    const arcs = [
      arc("keep", { openedMessageId: 2, openedAt: 1 }),
      arc("drop", { openedMessageId: 9, openedAt: 4 }),
      arc("reopen", { openedMessageId: 3, openedAt: 2, status: "resolved", resolvedAt: 6, summary: "done" }),
    ];
    const rolled = rollbackArcs(arcs, 8, 5);
    expect(rolled.find((a) => a.id === "drop")).toBeUndefined();
    expect(rolled.find((a) => a.id === "keep")).toBeDefined();
    const reopened = rolled.find((a) => a.id === "reopen");
    expect(reopened).toMatchObject({ status: "open" });
    expect(reopened?.summary).toBeUndefined();
  });

  it("pins, summarizes, removes, and lists open arc texts", () => {
    const arcs = [arc("a1"), arc("a2", { status: "resolved" })];
    expect(setArcPinned(arcs, "a1", true).find((a) => a.id === "a1")?.pinned).toBe(true);
    expect(setArcSummary(arcs, "a2", "wrapped up").find((a) => a.id === "a2")?.summary).toBe("wrapped up");
    expect(removeArc(arcs, "a1")).toHaveLength(1);
    expect(openArcTexts(arcs)).toEqual(["arc a1"]);
  });

  it("bounds injected open arcs to the most recent, always keeping pinned ones", () => {
    const arcs = [
      arc("old", { pinned: true, text: "pinned old thread" }),
      ...Array.from({ length: 10 }, (_, i) => arc(`o-${i}`, { text: `open thread ${i}` })),
    ];
    const texts = openArcTexts(arcs, 3);
    expect(texts).toHaveLength(3);
    expect(texts).toContain("pinned old thread");
    expect(texts).toContain("open thread 9");
    expect(texts).not.toContain("open thread 0");
  });

  it("caps total open unpinned arcs, dropping the oldest and keeping pinned", () => {
    const arcs = [
      arc("pin", { pinned: true }),
      ...Array.from({ length: 45 }, (_, i) => arc(`o-${i}`)),
    ];
    const capped = capOpenArcs(arcs, 40);
    expect(capped.filter((a) => a.status === "open" && !a.pinned)).toHaveLength(40);
    expect(capped.find((a) => a.id === "pin")).toBeDefined();
    expect(capped.find((a) => a.id === "o-0")).toBeUndefined();
    expect(capped.find((a) => a.id === "o-44")).toBeDefined();
  });
});

describe("matchArcBridges", () => {
  const arc = (text: string): ArcEntry => ({ id: text, text, status: "resolved", entities: [], openedAt: 0 });

  it("sums increments per anchor for keyword-matched resolved arcs", () => {
    const bridges = [
      { arcMatch: "granary", anchor: "reveal", amount: 2 },
      { arcMatch: "revenge", anchor: "reveal", amount: 1 },
      { arcMatch: "vault", anchor: "escape", amount: 3 },
    ];
    const resolved = [arc("The granary arsonist was unmasked."), arc("Mira took her revenge on the merchant.")];
    const increments = matchArcBridges(bridges, resolved);
    expect(increments.get("reveal")).toBe(3);
    expect(increments.has("escape")).toBe(false);
  });

  it("ignores arcs that match no bridge keyword", () => {
    const increments = matchArcBridges([{ arcMatch: "granary", anchor: "reveal", amount: 2 }], [arc("The northern keep collapsed.")]);
    expect(increments.size).toBe(0);
  });
});
