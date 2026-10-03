import { evidenceSources } from "./evidence";
import { parseSharedReadResponse } from "./parse";

const story = { qualityByKey: {
  location: { key: "location", type: "string", source: "extractor", rubric: "Where?" },
  inside_fort: { key: "inside_fort", type: "bool", source: "extractor", rubric: "Inside the fort?" },
  ranked: { key: "ranked", type: "int", source: "extractor", rubric: "Rank?" },
  tally: { key: "tally", type: "int", source: "code", rubric: "Code-owned." },
} } as unknown as Parameters<typeof parseSharedReadResponse>[1];

const read = (line: string) => parseSharedReadResponse(line, story);

const SPEECH = "\"Lower the bridge,\" she calls. A chain rattles somewhere below.";

describe("T6-1-1 MEDIUM: a quote that opens with speech and never closes (journal.jsonl:537, 8 lines across the run)", () => {
  it("accepts a DELTA whose evidence quote is unterminated, keeping the speech's own opening quote", () => {
    const parsed = read(`DELTA q=location value="fort_gate" evidence=${SPEECH}`);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.deltas).toEqual([expect.objectContaining({ delta: { q: "location", v: "fort_gate", source: "extractor" }, evidence: SPEECH })]);
  });

  it("accepts the bool, bare and FACT forms of the same shape", () => {
    expect(read(`DELTA q=inside_fort value=true evidence=${SPEECH}`).deltas[0]?.delta.v).toBe(true);
    expect(read(`inside_fort=true evidence=${SPEECH}`).deltas[0]?.delta.v).toBe(true);
    const fact = read("FACT importance=3 text=\"The warden had the bridge lowered.\" evidence=\"Lower the bridge,\" she calls.");
    expect(fact.rejected).toEqual([]);
    expect(fact.facts).toEqual([{ importance: 3, text: "The warden had the bridge lowered.", evidence: "\"Lower the bridge,\" she calls." }]);
  });

  it("the accepted evidence is still checked against the window like any other quote", () => {
    const window = [{ messageId: 7, text: `The warden studies the seal. ${SPEECH}`, isUser: false }];
    expect(evidenceSources(read(`DELTA q=location value="fort_gate" evidence=${SPEECH}`).deltas[0].evidence, window)).toEqual([7]);
    expect(evidenceSources(read("DELTA q=location value=\"fort_gate\" evidence=\"Raise the bridge,\" she calls.").deltas[0].evidence, window)).toEqual([]);
  });

  it("control: the key and value grammar is unchanged", () => {
    expect(read(`DELTA q=unknown_key value="x" evidence=${SPEECH}`).rejected).toEqual([{ line: `DELTA q=unknown_key value="x" evidence=${SPEECH}`, reason: "unknown quality" }]);
    expect(read(`DELTA q=tally value=2 evidence=${SPEECH}`).rejected[0]?.reason).toBe("code-owned quality");
    expect(read(`DELTA q=ranked value="three" evidence=${SPEECH}`).rejected[0]?.reason).toBe("invalid value");
    const terminated = `${SPEECH.replace(/^"/, "")}"`;
    for (const head of ["DELTA q=location", "DELTA q=unknown_key value=\"x\"", "DELTA q=ranked value=three", "location"]) {
      expect(read(`${head} evidence=${SPEECH}`).rejected.map((row) => row.reason)).toEqual(read(`${head} evidence="${terminated}`).rejected.map((row) => row.reason));
    }
    expect(read("FACT importance=4 text=\"x\" evidence=\"Lower the bridge,\" she calls.").rejected[0]?.reason).toBe("unrecognized line");
    expect(read("FACT importance=3 text=unquoted evidence=\"Lower the bridge,\" she calls.").rejected[0]?.reason).toBe("unrecognized line");
  });

  it("control: a lone opening quote is still no evidence, and a terminated quote parses as before", () => {
    expect(read("DELTA q=location value=\"fort_gate\" evidence=\"").deltas).toEqual([]);
    expect(read("DELTA q=location value=\"fort_gate\" evidence=\"   ").deltas).toEqual([]);
    expect(read("DELTA q=location value=\"fort_gate\" evidence=\"she calls\"").deltas[0]?.evidence).toBe("she calls");
  });
});
