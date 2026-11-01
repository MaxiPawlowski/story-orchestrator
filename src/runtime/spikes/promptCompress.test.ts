import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { COMPRESS_FLOORS, compressSegments, compressVerdict, measureCompression, splitSentences, type CompressSegment } from "./promptCompress";

const FIXTURES = join(__dirname, "../../../test/fixtures");

const histories = (): CompressSegment[][] => readdirSync(FIXTURES).filter((name) => name.endsWith(".transcript.json")).sort().map((name) => {
  const rows = JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Array<{ index?: number; text?: string; mes?: string }>;
  return rows.map((row, index) => ({ id: `${name}:${row.index ?? index}`, text: String(row.text ?? row.mes ?? "") })).filter((segment) => segment.text.trim());
});

const corpus = (): CompressSegment[][] => [histories().flat()];

describe("spike promptCompress: pure-JS extractive compression of history below the cacheable prefix", () => {
  it("splits sentences without cutting inside a quote", () => {
    expect(splitSentences("\"Stop. Now!\" she says. He waits.")).toEqual(["\"Stop. Now!\" she says.", "He waits."]);
  });

  it("keeps the newest messages verbatim and never drops a quote, the last mention of a name or number, or a message's only sentence", () => {
    const input = [
      { id: "a", text: "The hall is cold. The hall is very cold. Bren lights a lamp. It is late." },
      { id: "b", text: "\"Three coins,\" Ada says. The fire crackles in the grate." },
      { id: "c", text: "Bren nods. The wind howls outside the hall." },
      { id: "d", text: "Ada counts 3 coins." },
    ];
    const result = compressSegments(input, { keepTail: 1, targetRatio: 0.3 });
    expect(result.segments[3]).toEqual(input[3]);
    expect(result.segments[1]?.text).toContain("\"Three coins,\" Ada says.");
    expect(result.segments.map((segment) => segment.text).join(" ")).toContain("Bren");
    expect(result.segments.every((segment) => segment.text.trim().length > 0)).toBe(true);
    expect(result.dropped.map((entry) => entry.sentence)).toContain("The hall is very cold.");
    expect(compressSegments(input, { keepTail: 1, targetRatio: 0.3 })).toEqual(result);
  });

  it("protected words keep their sentences", () => {
    const input = [{ id: "a", text: "A long dull sentence about the weather and the wind. The amulet glows." }, { id: "b", text: "Tail." }];
    expect(compressSegments(input, { keepTail: 1, targetRatio: 0.1, protect: ["amulet"] }).segments[0]?.text).toContain("amulet");
  });

  it("floor PC1-PC4 (declared before measuring): recorded 2026-10-31, PC2-PC4 pass, PC1 missed (0.1147 < 0.15), not retuned", () => {
    const metrics = measureCompression(corpus());
    const verdict = compressVerdict(metrics);
    process.stdout.write(`promptCompress offline: ${JSON.stringify(metrics)} floors ${JSON.stringify(COMPRESS_FLOORS)} verdict ${JSON.stringify(verdict)}\n`);
    expect(metrics.tokensBefore).toBeGreaterThan(2000);
    expect(metrics).toEqual({ histories: 1, tokensBefore: 2616, tokensAfter: 2316, tokensSaved: 0.1147, entityRetention: 1, quoteRetention: 1, numberRetention: 1 });
    expect(verdict).toEqual({ tokens: false, entities: true, quotes: true, numbers: true, ok: false });
  });
});
