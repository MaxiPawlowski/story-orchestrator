import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildBackgroundRequest, buildContinuityRequest, buildContradictionRequest, buildCuratorFilterRequest, buildPairRequest, buildVerifyRequest,
  choice, defaultJudgeSettings, noul, score, type JudgeRequest, type JudgeResponse, type JudgeSettings, type JudgeTransport,
} from "@judge/index";
import { JudgeRuntime } from "./judge";
import { testOwnership } from "../../test/findings/testOwnership";

const GOLDEN = join(process.cwd(), "test/goldens/judge/seam-typesafe.requests.json");

interface SentRequest {
  use: string;
  timeoutMs: number;
  body: string;
}

const answered: JudgeResponse = { model: "jev-1.13.0", answers: {} };

const settings = (): JudgeSettings => ({ ...defaultJudgeSettings(), enabled: true });

const drive = async (): Promise<SentRequest[]> => {
  const sent: SentRequest[] = [];
  let current = "";
  const transport: JudgeTransport = async (request, options) => {
    sent.push({ use: current, timeoutMs: options.timeoutMs, body: JSON.stringify(request) });
    return answered;
  };
  const runtime = new JudgeRuntime({
    ownership: testOwnership(),
    getSettings: settings,
    transport,
    status: async () => ({ configured: true }),
    record: () => undefined,
    context: () => ({ boundary: 3, messageId: 9 }),
    now: () => 1_000,
  });
  const ask = async (use: string, request: JudgeRequest, timeoutMs?: number) => {
    current = use;
    await runtime.ask(use, request, timeoutMs ? { timeoutMs } : {});
  };
  current = "director";
  await runtime.director({
    checkpointName: "Gate",
    objective: "Open it",
    player: "Max",
    candidates: [{ rosterId: "guard", name: "Mara", role: "gate captain" }, { rosterId: "sage", name: "Finn", role: "old scholar" }],
    allowSilence: true,
    window: [{ speaker: "Max", text: "Mara, abre la puerta." }],
  });
  await ask("memoryPairs", buildPairRequest("Mara carries a silver sword.", "Mara's sword is now broken."), 3000);
  await ask("memoryVerify", buildVerifyRequest({ storyTitle: "Gate", cast: ["Mara", "Finn"], transcript: [{ id: "1", speaker: "Mara", text: "I lost the key." }], lines: ["Mara lost the key", "Finn has the key"] }));
  await ask("curatorFilter", buildCuratorFilterRequest({
    checkpoint: { name: "Gate", objective: "Open it" },
    canon: "The gate fell.",
    openThreads: ["the key"],
    entries: [{ title: "Gate", content: "The gate stands.", enabled: true }, { title: "Key", content: "Lost.", enabled: false }],
  }));
  await ask("memoryPairs", buildContradictionRequest("The gate is open.", "La puerta está cerrada."));
  await ask("warden", buildContinuityRequest({ speaker: "Mara", text: "The gate was never locked." }, ["The gate is locked."]));
  await ask("stage", buildBackgroundRequest(["forest.jpg", "castle gate.png"], "A stone gate at dusk"));
  await ask("critic", { state: { beats: ["Mara opens the gate"] }, questions: { shape: score("How well does `beats` rise?", ["flat", "some", "rising", "sharp"]), ok: noul("Is it fine?"), pick: choice("Which?", { a: "first", b: null }) } }, 2500);
  current = "probe";
  await runtime.probe({ state: { text: "The gate is shut." }, questions: { q: noul("Is the gate shut?") } }, "jev-latest");
  return sent;
};

describe("TypeSafe requests through the decision-provider seam", () => {
  it("guards the byte-identity contract: every request the typesafe transport receives matches the pre-seam golden, byte for byte", async () => {
    const sent = await drive();
    if (process.env.SO_RECORD_SEAM_GOLDEN === "1") writeFileSync(GOLDEN, `${JSON.stringify(sent, null, 2)}\n`);
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as SentRequest[];
    expect(sent.length).toBe(golden.length);
    sent.forEach((request, index) => {
      expect(request.use).toBe(golden[index].use);
      expect(request.timeoutMs).toBe(golden[index].timeoutMs);
      expect(request.body).toBe(golden[index].body);
    });
  });
});
