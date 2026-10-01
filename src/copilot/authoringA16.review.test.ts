import type { StoryV2 } from "@engine/index";
import { recordingModel } from "../../test/support/modelCall";
import { runAuthoringStage } from "./authoring";

const draft = {
  format: 2,
  id: "cal-crypt",
  title: "The Crypt",
  description: "A party of adventurers goes down into the crypt of an abandoned abbey.",
  qualities: [{ key: "door_open", type: "bool", source: "extractor", rubric: "Is the crypt door open?" }],
  checkpoints: [
    { id: "entrance", name: "The entrance", objective: "Find a way to open the crypt.", type: "anchor", start: true },
    { id: "crypt", name: "The crypt", objective: "Recover the relic.", type: "anchor" },
  ],
  transitions: [{ from: "entrance", to: "crypt", priority: 1, gate: { q: "door_open", op: "==", v: true } }],
  roster: [],
} as unknown as StoryV2;

const MESSAGE = "Add a final anchor, The exit, where the party escapes the abbey with the relic.";
const exit = { id: "exit", name: "The exit", objective: "Escape the abbey with the relic.", type: "anchor" };

const FIRST = JSON.stringify({
  summary: "Added the exit anchor and a path from the crypt to it.",
  ops: [
    { kind: "addQuality", quality: { key: "relic_recovered", type: "bool", source: "extractor", rubric: "Do the adventurers hold the relic?" } },
    { kind: "addCheckpoint", checkpoint: exit },
    { kind: "addTransition", transition: { from: "crypt", to: "exit", priority: 1 } },
    { kind: "setTransitionGate", ref: { from: "crypt", to: "exit" }, gate: { q: "relic_recovered", op: "==", v: true } },
  ],
});

const REPAIR = JSON.stringify({
  summary: "Adding the final anchor and setting the recovered relic state.",
  ops: [{ kind: "addCheckpoint", checkpoint: exit }, { kind: "setCheckpointSnapshot", id: "exit", snapshot: { relic_recovered: true } }],
});

const replay = async (responses: string[] = [FIRST, REPAIR]) => {
  let turn = 0;
  const model = recordingModel(() => responses[Math.min(turn++, responses.length - 1)]);
  const result = await runAuthoringStage({ draft, stage: "checkpoints", message: MESSAGE, history: [] }, model, { role: "authoring", pass: "copilot" });
  return { result, model };
};

describe("a16 (authoring, checkpoints stage): the 65733265d301 golden's two answers, scripted in English (W25)", () => {
  it("the repair still sets a snapshot on a quality the draft never declared, and the draft is refused", async () => {
    const { result, model } = await replay();
    expect(model.calls).toHaveLength(2);
    expect(result.status).toBe("failed");
    expect(result.issues).toEqual(["checkpoints.2.state_snapshot.relic_recovered: unknown quality 'relic_recovered'"]);
  });

  it("the repair prompt names the draft's declared quality keys and the key the refused addQuality would have declared", async () => {
    const { model } = await replay();
    const repair = model.calls[1].prompt.split("Previous response was invalid:")[1];
    expect(repair).toContain("Declared quality keys: door_open");
    expect(repair).toContain("Not declared, so no op in the checkpoints stage may use it: relic_recovered");
  });

  it("a repair that keeps to the declared keys is accepted", async () => {
    const corrected = JSON.stringify({ summary: "Final anchor.", ops: [{ kind: "addCheckpoint", checkpoint: exit }] });
    const { result } = await replay([FIRST, corrected]);
    expect(result.status).toBe("ok");
    expect(result.proposal.ops.map((op) => op.kind)).toEqual(["addCheckpoint"]);
  });

  it("names no undeclared key when the refused ops declare none", async () => {
    const response = JSON.stringify({
      summary: "x",
      ops: [
        { kind: "addCheckpoint", checkpoint: { id: "exit", name: "The exit", objective: "Leave.", type: "anchor" } },
        { kind: "addTransition", transition: { from: "crypt", to: "exit", priority: 1, gate: { q: "door_open", op: "==", v: true } } },
      ],
    });
    const { model } = await replay([response, response]);
    const repair = model.calls[1].prompt.split("Previous response was invalid:")[1];
    expect(repair).toContain("Declared quality keys: door_open");
    expect(repair).not.toContain("Not declared");
  });

  it("the qualities stage repair carries no declared-keys line, because that stage may declare new ones", async () => {
    const response = JSON.stringify({ summary: "x", ops: [{ kind: "addCheckpoint", checkpoint: { id: "x", name: "X", objective: "X.", type: "anchor" } }] });
    const model = recordingModel(() => response);
    await runAuthoringStage({ draft, stage: "qualities", message: "", history: [] }, model, { role: "authoring", pass: "copilot" });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1].prompt).not.toContain("Declared quality keys");
  });
});
