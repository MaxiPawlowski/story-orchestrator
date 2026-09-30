import { parseStoryV2 } from "@engine/index";
import { parseProposal } from "@copilot/index";
import { applyAgentOp, checkToolCall, describeAgentOp } from "../copilot/agent";
import { runDiagnostics } from "./diagnostics";
import { newStoryDraft } from "./draft";
import { setCheckpointMotive, setRosterDrive, setRosterView } from "./mutations";
import { sanitizeGlobalSettings } from "../runtime/settingsModel";

const base = () => ({
  ...newStoryDraft(),
  roster: [{ id: "kael", name: "Kael" }, { id: "lyria", name: "Lyria" }],
  requirements: { personas: ["Max"] },
});

describe("inner voice schema (v2.6 plan 06 A, D)", () => {
  it("parses drive, view and motives as optional authored fields, trimmed", () => {
    const parsed = parseStoryV2({
      ...base(),
      roster: [{ id: "kael", name: "Kael", drive: "  clear his name " }, { id: "dm", view: "omniscient" }],
      checkpoints: [{ ...newStoryDraft().checkpoints[0], motives: { kael: " get the ledger ", lyria: "   " } }],
    });
    expect(Array.isArray(parsed)).toBe(false);
    if (Array.isArray(parsed)) return;
    expect(parsed.roster).toEqual([{ id: "kael", name: "Kael", drive: "clear his name" }, { id: "dm", view: "omniscient" }]);
    expect(parsed.checkpoints[0].motives).toEqual({ kael: "get the ledger" });
  });

  it("refuses a wrong-typed drive, an unknown view and a non-text motive", () => {
    const errors = parseStoryV2({
      ...base(),
      roster: [{ id: "kael", drive: 3 }, { id: "dm", view: "god" }],
      checkpoints: [{ ...newStoryDraft().checkpoints[0], motives: { kael: 1 } }],
    });
    expect(Array.isArray(errors) ? errors.map((error) => error.path) : []).toEqual(["checkpoints.0.motives.kael", "roster.0.drive", "roster.1.view"]);
  });

  it("warns on a motive for no cast member, and on one for the player, with a declared consequence", () => {
    const draft = setCheckpointMotive(setCheckpointMotive(base(), "start", "ghost", "haunt"), "start", "Max", "win");
    const found = runDiagnostics(draft).filter((entry) => entry.code.startsWith("motive-"));
    expect(found.map((entry) => [entry.code, entry.severity, entry.path])).toEqual([
      ["motive-member-unknown", "warning", "checkpoints.0.motives.ghost"],
      ["motive-for-player", "warning", "checkpoints.0.motives.Max"],
    ]);
    expect(found.every((entry) => entry.consequence)).toBe(true);
  });
});

describe("inner voice mutations (the typed contract plan 11 proposes through)", () => {
  it("sets and clears a drive, a narrator view and a per-member motive without leaving empty fields", () => {
    const withDrive = setRosterDrive(base(), "kael", "clear his name");
    expect(withDrive.roster[0]).toEqual({ id: "kael", name: "Kael", drive: "clear his name" });
    expect(setRosterDrive(withDrive, "kael", "").roster[0]).toEqual({ id: "kael", name: "Kael" });
    expect(setRosterView(base(), "lyria", "omniscient").roster[1]).toEqual({ id: "lyria", name: "Lyria", view: "omniscient" });
    expect(setRosterView(setRosterView(base(), "lyria", "omniscient"), "lyria", "own").roster[1]).toEqual({ id: "lyria", name: "Lyria" });
    const motive = setCheckpointMotive(base(), "start", "kael", "get the ledger");
    expect(motive.checkpoints[0].motives).toEqual({ kael: "get the ledger" });
    expect(setCheckpointMotive(motive, "start", "lyria", "hide").checkpoints[0].motives).toEqual({ kael: "get the ledger", lyria: "hide" });
    expect(setCheckpointMotive(motive, "start", "kael", "").checkpoints[0]).not.toHaveProperty("motives");
  });

  it("the wizard's ordinary ops carry drive, view and motives through the patch grammar", () => {
    const parsed = parseProposal(JSON.stringify({ summary: "", ops: [
      { kind: "updateRosterMember", id: "kael", patch: { drive: "clear his name", view: "omniscient", bogus: 1 } },
      { kind: "updateCheckpoint", id: "start", patch: { motives: { kael: "get the ledger", lyria: 4 } } },
    ] }));
    expect(parsed.proposal.ops).toEqual([
      { kind: "updateRosterMember", id: "kael", patch: { drive: "clear his name", view: "omniscient" } },
      { kind: "updateCheckpoint", id: "start", patch: { motives: { kael: "get the ledger" } } },
    ]);
  });

  it("the agent's motive, drive and view tools apply through the same mutations and refuse unknown ids and views", () => {
    const motive = checkToolCall({ tool: "setCheckpointMotive", args: { id: "start", member: "kael", motive: "get the ledger" } });
    expect(motive.ok && motive.op && applyAgentOp(base(), motive.op).checkpoints[0].motives).toEqual({ kael: "get the ledger" });
    expect(motive.ok && motive.op && describeAgentOp(motive.op).label).toBe("kael wants at start: get the ledger");
    expect(checkToolCall({ tool: "setRosterView", args: { id: "kael", view: "god" } })).toEqual({ ok: false, message: "setRosterView.view: expected own or omniscient" });
    const drive = checkToolCall({ tool: "setRosterDrive", args: { id: "kael", drive: "clear his name" } });
    expect(drive.ok && drive.op && applyAgentOp(base(), drive.op).roster[0].drive).toBe("clear his name");
  });
});

describe("inner voice switches (v2.6 plan 06 Resolved: B2 and C off by default)", () => {
  it("the beat, its top-2 arm and the reasoning harvest are off unless switched on, and only true/top2 survive sanitizing", () => {
    const defaults = sanitizeGlobalSettings({}).memory;
    expect(defaults.innerBeat).toBeUndefined();
    expect(defaults.harvestReasoning).toBeUndefined();
    expect(defaults.innerFanOut).toBeUndefined();
    const on = sanitizeGlobalSettings({ memory: { innerBeat: true, innerFanOut: "top2", harvestReasoning: true } }).memory;
    expect(on).toMatchObject({ innerBeat: true, innerFanOut: "top2", harvestReasoning: true });
    const junk = sanitizeGlobalSettings({ memory: { innerBeat: "yes", innerFanOut: "all", harvestReasoning: 1 } }).memory;
    expect([junk.innerBeat, junk.innerFanOut, junk.harvestReasoning]).toEqual([undefined, undefined, undefined]);
  });
});
