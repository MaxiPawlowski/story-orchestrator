import { parseSharedReadResponse } from "./parse";

const story = { qualityByKey: {} } as unknown as Parameters<typeof parseSharedReadResponse>[1];

const read = (line: string) => parseSharedReadResponse(line, story);

describe("v3.0 25: a FACT line carrying MEMORY-style fields is a fact, not an unrecognized line (extractor28)", () => {
  it("keeps a facts-tier type and drops the expiration: a FACT is permanent", () => {
    const parsed = read("FACT importance=3 type=event text=\"The courier reached the keep.\" evidence=\"The courier rides through the gate.\"");
    expect(parsed.rejected).toEqual([]);
    expect(parsed.facts).toEqual([{ importance: 3, type: "event", text: "The courier reached the keep.", evidence: "The courier rides through the gate." }]);
  });

  it("reads quoted values, an expiration and an entity list as a MEMORY line would", () => {
    const parsed = read("FACT importance=2 type=\"event\" expiration=\"permanent\" entity=\"Vex, Keep\" text=\"Vex sealed the keep.\" evidence=\"Vex bars the door.\"");
    expect(parsed.rejected).toEqual([]);
    expect(parsed.facts).toEqual([{ importance: 2, type: "event", entities: ["Vex", "Keep"], text: "Vex sealed the keep.", evidence: "Vex bars the door." }]);
  });

  it("a session-tier or unknown type does not move a FACT out of the facts tier", () => {
    expect(read("FACT importance=2 type=scene text=\"Rain on the yard.\" evidence=\"Rain falls.\"").facts).toEqual([{ importance: 2, text: "Rain on the yard.", evidence: "Rain falls." }]);
    expect(read("FACT importance=2 type=rumour text=\"Rain on the yard.\" evidence=\"Rain falls.\"").facts).toEqual([{ importance: 2, text: "Rain on the yard.", evidence: "Rain falls." }]);
  });

  it("accepts the extra fields with an unterminated evidence quote", () => {
    const parsed = read("FACT importance=3 type=event text=\"The warden lowered the bridge.\" evidence=\"Lower the bridge,\" she calls.");
    expect(parsed.rejected).toEqual([]);
    expect(parsed.facts).toEqual([{ importance: 3, type: "event", text: "The warden lowered the bridge.", evidence: "\"Lower the bridge,\" she calls." }]);
  });

  it("control: the canonical FACT line parses to the same shape as before", () => {
    expect(read("FACT importance=1 text=\"Arin owns a dagger.\" evidence=\"Arin draws a dagger.\"").facts).toEqual([{ importance: 1, text: "Arin owns a dagger.", evidence: "Arin draws a dagger." }]);
  });

  it("control: a FACT without a valid importance is still not a fact", () => {
    for (const line of [
      "FACT type=event text=\"Arin owns a dagger.\" evidence=\"Arin draws a dagger.\"",
      "FACT importance=5 type=event text=\"Arin owns a dagger.\" evidence=\"Arin draws a dagger.\"",
      "FACT importance=2 type=event text=\"Arin owns a dagger.\"",
    ]) {
      const parsed = read(line);
      expect(parsed.facts).toEqual([]);
      expect(parsed.rejected.map((entry) => entry.reason)).toEqual(["unrecognized line"]);
    }
  });
});
