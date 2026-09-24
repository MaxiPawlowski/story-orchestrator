import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { evidenceInWindow, normalizeEvidenceText } from "./evidence";
import { cleanMessageText } from "./windowHygiene";

const ROOT = join(__dirname, "../..");
const GOLDEN_DIRS = ["test/goldens", "test/goldens/live"];

const substringRule = (evidence: string, messages: string[]): boolean => {
  const fragments = normalizeEvidenceText(evidence).split("\u0000").map((part) => part.trim()).filter(Boolean);
  if (!fragments.length) return false;
  return messages.some((message) => {
    const text = normalizeEvidenceText(message).split("\u0000").join(" ");
    let cursor = 0;
    for (const fragment of fragments) {
      const at = text.indexOf(fragment, cursor);
      if (at < 0) return false;
      cursor = at + fragment.length;
    }
    return true;
  });
};

function corpus() {
  const quotes: Array<{ source: string; evidence: string; messages: string[] }> = [];
  for (const dir of GOLDEN_DIRS) {
    for (const file of readdirSync(join(ROOT, dir)).filter((name) => /^extractor\d*\.response\.txt$/.test(name))) {
      const fixture = join(ROOT, "test/fixtures", file.replace(".response.txt", ".transcript.json"));
      if (!existsSync(fixture)) continue;
      const messages = (JSON.parse(readFileSync(fixture, "utf-8")) as Array<{ text: string }>).map((message) => message.text);
      const response = readFileSync(join(ROOT, dir, file), "utf-8");
      for (const match of response.matchAll(/evidence="([^"]*)"/g)) quotes.push({ source: `${dir}/${file}`, evidence: match[1], messages });
    }
  }
  return quotes;
}

// V14: the span rule is stricter than the substring rule it replaced, so it could start rejecting
// quotes a real model writes. These are every quote the recorded real-model extractor replies give,
// against the transcript each read was given.
describe("V14: the word-span rule over the recorded real-model quotes", () => {
  const quotes = corpus();

  it("reads a real corpus", () => {
    expect(quotes.length).toBeGreaterThan(100);
  });

  it("accepts every recorded quote the substring rule accepted", () => {
    const newlyRejected = quotes.filter((quote) => substringRule(quote.evidence, quote.messages) && !evidenceInWindow(quote.evidence, quote.messages));
    expect(newlyRejected.map((quote) => `${quote.source}: ${quote.evidence}`)).toEqual([]);
  });

  it("v2.4 plan 04 T7: every recorded quote still stands against the cleaned transcript", () => {
    expect(quotes.length).toBe(136);
    const newlyRejected = quotes.filter((quote) => evidenceInWindow(quote.evidence, quote.messages) && !evidenceInWindow(quote.evidence, quote.messages.map(cleanMessageText)));
    expect(newlyRejected.map((quote) => `${quote.source}: ${quote.evidence}`)).toEqual([]);
  });
});
