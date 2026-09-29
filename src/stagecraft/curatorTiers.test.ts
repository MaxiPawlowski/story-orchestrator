import { SP8_CONTROLS, SP8_ENTRIES, SP8_VIOLATIONS } from "../../test/support/curatorSpikeCases";
import { entryMarks, protectedRefusal, refuseProtected, routeByTier } from "./curatorTiers";
import { previewCuratorOp } from "./proposal";
import type { CuratorEntryView, CuratorOpRecord } from "./types";

const views: CuratorEntryView[] = SP8_ENTRIES.map((entry) => ({ lorebook: "Story Lore", comment: entry.comment, keys: entry.key, content: entry.content, disabled: entry.disable, uid: entry.uid }));
const viewOf = (comment: string) => views.find((view) => view.comment === comment)!;

describe("v2.5 plan 09 SP8 W1: protected spans (pure)", () => {
  it("reads the tier and the spans from ST comment markers, an unclosed span running to the end", () => {
    expect(entryMarks(viewOf("The Crown").content).spans.map((span) => span.text)).toEqual(["{{// so:protect}}The king died in the winter of 402.{{// so:end}}"]);
    expect(entryMarks(viewOf("The Vault").content).spans.map((span) => span.text)).toEqual(["{{// so:protect}}Only the abbot holds the key. Nobody else may enter."]);
    expect(entryMarks("{{//so:AUTO}}Market day.").tier).toBe("auto");
    expect(entryMarks("Market day.").tier).toBe("review");
    expect(entryMarks("{{// so:end}}stray").spans).toEqual([]);
  });

  it("every case is a change today's preview accepts, so a refusal below is the spike's and nothing else's", () => {
    for (const entry of [...SP8_VIOLATIONS, ...SP8_CONTROLS]) expect({ id: entry.id, ok: previewCuratorOp(entry.op, viewOf(entry.op.comment)).ok }).toEqual({ id: entry.id, ok: true });
  });

  it.each(SP8_VIOLATIONS.map((entry) => [entry.id, entry] as const))("refuses violation %s", (_id, entry) => {
    expect(protectedRefusal(entry.op, viewOf(entry.op.comment).content)).toMatch(/touches protected text|adds a curator marker/);
  });

  it.each(SP8_CONTROLS.map((entry) => [entry.id, entry] as const))("lets control %s through", (_id, entry) => {
    expect(protectedRefusal(entry.op, viewOf(entry.op.comment).content)).toBeNull();
  });

  it("drops a refused record at plan time with its reason and keeps the rest", () => {
    const records: CuratorOpRecord[] = [SP8_VIOLATIONS[0], SP8_CONTROLS[1]].map((entry) => ({ op: entry.op, status: "pending" }));
    const plan = refuseProtected({ records, dropped: ["earlier"], refused: [] }, views);
    expect(plan.records.map((record) => record.op)).toEqual([SP8_CONTROLS[1].op]);
    expect(plan.dropped).toEqual(["earlier", 'rewrite: "The Crown": the rewrite touches protected text']);
    expect(plan.refused).toEqual([SP8_VIOLATIONS[0].op]);
  });

  it("checks a fuzzy patch at the anchor the author will accept, not the one the model wrote", () => {
    const fuzzy: CuratorOpRecord = { op: { ...SP8_CONTROLS[1].op, anchor: "no such words" } as CuratorOpRecord["op"], status: "pending", fuzzy: { anchor: "The realm is || winter of 402", span: "", score: 0.9 } };
    expect(refuseProtected({ records: [fuzzy], dropped: [], refused: [] }, views).records).toEqual([]);
  });
});

describe("v2.5 plan 09 SP8 W2: tier routing (pure)", () => {
  const auto = { ...viewOf("The Ferry"), comment: "Market", content: "{{// so:auto}}Market day is Thursday." };
  const records: CuratorOpRecord[] = [
    { op: { kind: "disable", lorebook: "Story Lore", comment: "Market" }, status: "pending" },
    { op: { kind: "disable", lorebook: "Story Lore", comment: "The Ferry" }, status: "pending" },
  ];

  it("accepts only auto-tier ops in auto mode", () => {
    expect(routeByTier(records, [...views, auto], "auto").map((record) => record.status)).toEqual(["accepted", "pending"]);
  });

  it("leaves everything pending in review mode", () => {
    expect(routeByTier(records, [...views, auto], "review").map((record) => record.status)).toEqual(["pending", "pending"]);
  });
});
