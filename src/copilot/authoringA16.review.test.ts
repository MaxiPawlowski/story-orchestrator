import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoryV2 } from "@engine/index";
import { recordingModel } from "../../test/support/modelCall";
import { runAuthoringStage } from "./authoring";
import type { CopilotStage } from "./types";

interface GoldenRecord { id: string; responses: string[] }
interface FixtureCase { id: string; stage: CopilotStage; draft: string; message: string }

const read = <T>(path: string): T => JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as T;

const golden = read<{ bundle: string; records: GoldenRecord[] }>("test/goldens/live/role-calibration/authoring-shared-65733265d301.json");
const fixture = read<{ drafts: Record<string, StoryV2>; cases: FixtureCase[] }>("test/fixtures/role-calibration/authoring.json");

const replay = async (id: string, responses?: string[]) => {
  const recorded = golden.records.find((record) => record.id === id);
  const entry = fixture.cases.find((row) => row.id === id);
  if (!recorded || !entry) throw new Error(`case ${id} missing from the golden or the fixture`);
  const answers = responses ?? recorded.responses;
  let turn = 0;
  const model = recordingModel(() => answers[Math.min(turn++, answers.length - 1)]);
  const result = await runAuthoringStage({ draft: fixture.drafts[entry.draft], stage: entry.stage, message: entry.message, history: [] }, model, { role: "authoring", pass: "copilot" });
  return { result, model, draft: fixture.drafts[entry.draft] };
};

describe("a16 (es authoring, checkpoints stage) replayed from the 65733265d301 golden", () => {
  it("the recorded repair still sets a snapshot on a quality the draft never declared, and the draft is refused", async () => {
    const { result, model } = await replay("a16");
    expect(golden.bundle).toBe("65733265d301");
    expect(model.calls).toHaveLength(2);
    expect(result.status).toBe("failed");
    expect(result.issues).toEqual(["checkpoints.2.state_snapshot.reliquia_recuperada: unknown quality 'reliquia_recuperada'"]);
  });

  it("the repair prompt names the draft's declared quality keys and the key the refused addQuality would have declared", async () => {
    const { model } = await replay("a16");
    const repair = model.calls[1].prompt.split("Previous response was invalid:")[1];
    expect(repair).toContain("Declared quality keys: puerta_abierta");
    expect(repair).toContain("Not declared, so no op in the checkpoints stage may use it: reliquia_recuperada");
  });

  it("a repair that keeps to the declared keys is accepted", async () => {
    const [first] = golden.records.find((record) => record.id === "a16")!.responses;
    const corrected = JSON.stringify({
      summary: "Ancla final.",
      ops: [{ kind: "addCheckpoint", checkpoint: { id: "salida", name: "La salida", objective: "Escapar de la abadía con la reliquia.", type: "anchor" } }],
    });
    const { result } = await replay("a16", [first, corrected]);
    expect(result.status).toBe("ok");
    expect(result.proposal.ops.map((op) => op.kind)).toEqual(["addCheckpoint"]);
  });

  it("names no undeclared key when the refused ops declare none", async () => {
    const response = JSON.stringify({
      summary: "x",
      ops: [
        { kind: "addCheckpoint", checkpoint: { id: "salida", name: "La salida", objective: "Salir.", type: "anchor" } },
        { kind: "addTransition", transition: { from: "cripta", to: "salida", priority: 1, gate: { q: "puerta_abierta", op: "==", v: true } } },
      ],
    });
    const { model } = await replay("a16", [response, response]);
    const repair = model.calls[1].prompt.split("Previous response was invalid:")[1];
    expect(repair).toContain("Declared quality keys: puerta_abierta");
    expect(repair).not.toContain("Not declared");
  });

  it("the qualities stage repair carries no declared-keys line, because that stage may declare new ones", async () => {
    const response = JSON.stringify({ summary: "x", ops: [{ kind: "addCheckpoint", checkpoint: { id: "x", name: "X", objective: "X.", type: "anchor" } }] });
    const model = recordingModel(() => response);
    await runAuthoringStage({ draft: fixture.drafts.cripta, stage: "qualities", message: "", history: [] }, model, { role: "authoring", pass: "copilot" });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1].prompt).not.toContain("Declared quality keys");
  });
});
