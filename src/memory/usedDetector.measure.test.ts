import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createMentions, heldForMember, MENTION_HOLD_BOUNDARIES, raisedBy, recordMentions, usedInReply, type OfferedItem } from "./used";
import { contentWords } from "./words";

interface Line { index: number; speaker: string; text: string }

const dir = join(__dirname, "../../test/fixtures");
const transcripts: Line[][] = readdirSync(dir).filter((name) => name.endsWith(".transcript.json")).sort()
  .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as Line[]).filter((lines) => Array.isArray(lines) && lines.length > 0);

const sentences = (line: Line): string[] => line.text.split(/(?<=[.!?])\s+/).map((part) => part.trim())
  .filter((part) => [...contentWords(part)].filter((word) => !contentWords(line.speaker).has(word)).length >= 4);

export function measureDetector() {
  let truePositives = 0;
  let trueTotal = 0;
  let falsePositives = 0;
  let falseTotal = 0;
  transcripts.forEach((lines, which) => {
    const others = transcripts.filter((_, index) => index !== which).flatMap((other) => other.flatMap((line) => sentences(line)));
    lines.forEach((line, lineIndex) => {
      const own = sentences(line).map((text, index): OfferedItem => ({ id: `own-${lineIndex}-${index}`, kind: "row", text }));
      const foreign = others.filter((_, index) => (index + lineIndex) % 7 === 0).slice(0, 12).map((text, index): OfferedItem => ({ id: `other-${index}`, kind: "row", text }));
      const used = new Set(usedInReply([...own, ...foreign], line.text, [line.speaker]));
      trueTotal += own.length;
      truePositives += own.filter((item) => used.has(item.id)).length;
      falseTotal += foreign.length;
      falsePositives += foreign.filter((item) => used.has(item.id)).length;
    });
  });
  return { transcripts: transcripts.length, trueTotal, recall: truePositives / Math.max(1, trueTotal), falseTotal, falseRate: falsePositives / Math.max(1, falseTotal) };
}

describe("v3.0 41 B1/B2: detector and hold invariant over the recorded transcripts", () => {
  it("F-B1 (informational): prints true-use recall and false-use rate", () => {
    const result = measureDetector();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    expect(result.trueTotal).toBeGreaterThan(20);
    expect(result.falseTotal).toBeGreaterThan(20);
  });

  it("F-B2 (hard): every row a member voiced is held from that member for the window, released when the player names it, never held from another member", () => {
    let checked = 0;
    for (const lines of transcripts) {
      lines.forEach((line, boundary) => {
        const offered = sentences(line).map((text, index): OfferedItem => ({ id: `${boundary}-${index}`, kind: "row", text }));
        const used = usedInReply(offered, line.text, [line.speaker]);
        const state = recordMentions(createMentions(), used, offered, { member: line.speaker, messageId: line.index, revision: "r", boundary });
        for (const id of used) {
          for (let later = boundary; later < boundary + MENTION_HOLD_BOUNDARIES; later += 1) {
            expect(heldForMember(state, line.speaker, later, () => false).has(id)).toBe(true);
            expect(heldForMember(state, `${line.speaker}-other`, later, () => false).has(id)).toBe(false);
          }
          const text = offered.find((item) => item.id === id)?.text ?? "";
          expect(heldForMember(state, line.speaker, boundary + 1, () => raisedBy({ text, entities: [], triggers: [] }, text, [line.speaker])).has(id)).toBe(false);
          checked += 1;
        }
      });
    }
    expect(checked).toBeGreaterThan(10);
  });
});
