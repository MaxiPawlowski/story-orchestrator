import { quoteSpans, sentenceSpans } from "./text";
import { align, assemble, findingsIn, windowsFor } from "./windows";

const REPLY = "*Mara smirks.* \"Indeed, it is late,\" she says. The rope holds. Her voice is, indeed, low. The deck creaks.";
const TARGETS = { avoid: ["indeed"], tics: ["smirks"], repeats: [] };

describe("v2.9 plan 03 S1: finding windows and anchors", () => {
  it("splits sentences but never inside a quote", () => {
    const text = "\"Stop. Now,\" she said. He left.";
    const spans = sentenceSpans(text, quoteSpans(text) ?? []).map((span) => text.slice(span.start, span.end));
    expect(spans).toEqual(["\"Stop. Now,\" she said.", "He left."]);
  });

  it("finds avoid and tic hits only outside quoted dialogue", () => {
    const found = findingsIn(REPLY, TARGETS) ?? [];
    expect(found.map((finding) => [finding.kind, REPLY.slice(finding.start, finding.end)])).toEqual([["tic", "smirks"], ["avoid", "indeed"]]);
  });

  it("refuses a reply whose quotes do not balance", () => {
    expect(findingsIn("\"Unclosed, she says, and smirks.", TARGETS)).toBeNull();
    expect(findingsIn("“Curly” and ” stray, smirks.", TARGETS)).toBeNull();
  });

  it("makes each finding's sentence a window and keeps the rest as anchors", () => {
    const windows = windowsFor(REPLY, findingsIn(REPLY, TARGETS) ?? []);
    expect(windows.map((window) => window.text)).toEqual(["*Mara smirks.*", "Her voice is, indeed, low."]);
    const candidate = assemble(REPLY, windows, ["*Mara grins.*", "Her voice is low."]);
    expect(candidate).toBe("*Mara grins.* \"Indeed, it is late,\" she says. The rope holds. Her voice is low. The deck creaks.");
    expect(align(REPLY, windows, candidate)).toEqual({ ok: true, replaced: ["*Mara grins.*", "Her voice is low."] });
  });

  it("merges findings in neighbouring sentences into one window", () => {
    const text = "She smirks. Indeed she does. The end.";
    expect(windowsFor(text, findingsIn(text, TARGETS) ?? []).map((window) => window.text)).toEqual(["She smirks. Indeed she does."]);
  });

  it("refuses an alignment that touched an anchor or is ambiguous", () => {
    const windows = windowsFor(REPLY, findingsIn(REPLY, TARGETS) ?? []);
    expect(align(REPLY, windows, REPLY.replace("rope holds", "rope snaps"))).toEqual({ ok: false, code: "outside-window" });
    const twice = "A smirks. B waits. A smirks. B waits. C.";
    const repeated = windowsFor(twice, findingsIn(twice, TARGETS) ?? []);
    expect(align(twice, repeated, "A grins. B waits. B waits. A grins. B waits. C.")).toEqual({ ok: false, code: "ambiguous-alignment" });
  });

  it("treats a continue's already-read prefix as no window", () => {
    const prefix = "She smirks at the door.";
    const text = `${prefix} Indeed, she waits.`;
    expect((findingsIn(text, TARGETS, prefix.length) ?? []).map((finding) => finding.phrase)).toEqual(["indeed"]);
  });
});
