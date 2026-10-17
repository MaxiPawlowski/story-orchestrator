import { harvestReasoning } from "@memory/innerRender";
import { pickCarry } from "./spikes/thoughtCarry";
import { observeRenderedReasoning, reasoningStale, withoutStaleReasoning } from "./reasoningRevision";

let stamp = 0;
const reply = (mes: string, reasoning = "Mara wants to reach the tower before dark.", swipe = 0) =>
  ({ name: "Mara", is_user: false, send_date: `2026-10-16 ${(stamp += 1)}`, swipe_id: swipe, mes, extra: { reasoning } });
const player = (mes: string) => ({ name: "Max", is_user: true, mes });

describe("plan 69 K6b: a text revision change makes a reply's reasoning stale for its readers", () => {
  it("control: a reply read as rendered keeps its reasoning", () => {
    const row = reply("Mara strides toward the tower.");
    observeRenderedReasoning(row);
    expect(reasoningStale(row)).toBe(false);
    expect(withoutStaleReasoning([row])[0]).toBe(row);
  });

  it("an in-place rewrite of the visible reply makes the reasoning stale; an unobserved reply is never called stale", () => {
    const row = reply("Mara strides toward the tower.");
    observeRenderedReasoning(row);
    row.mes = "Mara sits down by the fire instead.";
    expect(reasoningStale(row)).toBe(true);
    expect(reasoningStale(reply("Never rendered here."))).toBe(false);
  });

  it("a new swipe is its own revision", () => {
    const row = reply("Mara strides toward the tower.");
    observeRenderedReasoning(row);
    const swiped = { ...row, swipe_id: 1, mes: "Mara waits.", extra: { reasoning: "Mara wants to wait for the others." } };
    observeRenderedReasoning(swiped);
    expect(reasoningStale(swiped)).toBe(false);
  });

  it("54: thought carry never carries the stale reasoning of a rewritten reply", () => {
    const own = reply("Mara strides toward the tower.");
    observeRenderedReasoning(own);
    const rows = [player("Where to?"), own, player("And now?"), reply("Mara looks up.")];
    const input = { rosterId: "mara", name: "Mara", players: ["Max"], from: 0 };
    expect(pickCarry({ ...input, rows: withoutStaleReasoning(rows) }).line).toContain("reach the tower");
    own.mes = "Mara sits down by the fire instead.";
    expect(pickCarry({ ...input, rows: withoutStaleReasoning(rows) })).toMatchObject({ line: "", reason: "no-reasoning" });
  });

  it("43 path: the reasoning harvest the memory read takes never holds the stale reasoning of a rewritten reply", () => {
    const own = reply("Mara strides toward the tower.");
    observeRenderedReasoning(own);
    const rows = [player("Where to?"), own];
    expect(harvestReasoning(withoutStaleReasoning(rows), { from: 0, to: 1 })).toContain("reach the tower");
    own.mes = "Mara sits down by the fire instead.";
    expect(harvestReasoning(withoutStaleReasoning(rows), { from: 0, to: 1 })).toBe("");
    expect(own.extra.reasoning).toContain("reach the tower");
  });
});
