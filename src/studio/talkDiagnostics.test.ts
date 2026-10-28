import type { Story, TalkControl } from "@engine/index";
import { runDiagnostics } from "./diagnostics";

const story = (control: TalkControl, roster = [{ id: "nar", name: "Narrator" }, { id: "mara", name: "Mara" }]): Story => ({
  id: "s", title: "T", description: "D", qualities: [{ key: "trust", type: "int", source: "extractor", rubric: "r" }],
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true, talk_control: control }, { id: "end", name: "End", objective: "o", type: "anchor" }],
  transitions: [{ from: "start", to: "end", priority: 0, gate: { q: "trust", op: ">=", v: 1 } }], roster,
}) as Story;

const codes = (draft: Story) => runDiagnostics(draft).map((entry) => [entry.code, entry.path]).filter(([code]) => String(code).startsWith("talk-lead-cap"));

describe("v3.0 19 stage 3: lead cap diagnostics", () => {
  it("warns when the cap can never hold: no lead, or nobody but the lead", () => {
    expect(codes(story({ lead_max_consecutive: 1 }))).toEqual([["talk-lead-cap-idle", "checkpoints.0.talk_control.lead_max_consecutive"]]);
    expect(codes(story({ lead: "Narrator", speakers: [{ member: "Narrator" }], profile: "conversation" }))).toEqual([["talk-lead-cap-idle", "checkpoints.0.talk_control"]]);
    expect(codes(story({ lead: "Narrator", lead_max_consecutive: 1 }, [{ id: "nar", name: "Narrator" }]))).toEqual([["talk-lead-cap-idle", "checkpoints.0.talk_control.lead_max_consecutive"]]);
  });

  it("says a scripted chain is not capped", () => {
    expect(codes(story({ lead: "Narrator", lead_max_consecutive: 1, chain: { mode: "scripted", sequence: ["Narrator", "Mara"] } })))
      .toEqual([["talk-lead-cap-scripted", "checkpoints.0.talk_control.lead_max_consecutive"]]);
  });

  it("control: a lead with another speaker, or a profile on a beat with no lead, says nothing", () => {
    expect(codes(story({ lead: "Narrator", speakers: [{ member: "Narrator" }, { member: "Mara" }], lead_max_consecutive: 1 }))).toEqual([]);
    expect(codes(story({ lead: "Narrator", profile: "conversation" }))).toEqual([]);
    expect(codes(story({ profile: "conversation" }))).toEqual([]);
  });
});
