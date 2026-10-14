import { numberToWords, preProcessText, wordsToVisemes } from "./lipsyncEn";
import { TEXT_MOUTH, TextMouth, VISEME_MOUTH } from "./textMouth";

const track = (word: string) => wordsToVisemes(preProcessText(word)).visemes;

const stream = (mouth: TextMouth, text: string, charMs: number) => {
  for (let i = 1; i <= text.length; i += 1) mouth.push(text.slice(0, i), i * charMs);
};

const sequence = (mouth: TextMouth, until: number, step = 2) => {
  const seen: Array<{ viseme: string; at: number }> = [];
  for (let now = 0; now <= until; now += step) {
    const sample = mouth.sample(now);
    const last = seen[seen.length - 1];
    if (sample && (!last || last.viseme !== sample.viseme || now - last.at > step)) seen.push({ viseme: sample.viseme, at: now });
    else if (sample && last) last.at = now;
  }
  return seen.map((entry) => entry.viseme);
};

describe("English text to visemes (TalkingHead lipsync-en port)", () => {
  it("turns fixed words into fixed Oculus viseme sequences", () => {
    expect(track("hello")).toEqual(["I", "E", "nn", "O"]);
    expect(track("world")).toEqual(["FF", "E", "nn", "DD"]);
    expect(track("the")).toEqual(["TH", "aa"]);
    expect(track("quick")).toEqual(["kk", "FF", "I", "kk"]);
    expect(track("brown")).toEqual(["PP", "RR", "O", "nn"]);
    expect(track("speaking")).toEqual(["SS", "PP", "I", "kk", "I", "nn"]);
    expect(track("thought")).toEqual(["TH", "aa", "DD"]);
    expect(wordsToVisemes("hello").durations.map((value) => Number(value.toFixed(2)))).toEqual([0.92, 0.9, 0.88, 0.96]);
  });

  it("reads numbers, ordinals and symbols as words before converting them", () => {
    expect(preProcessText("1984")).toBe("nineteen eighty four");
    expect(preProcessText("42nd")).toBe("forty second");
    expect(preProcessText("50%")).toBe("fifty percent");
    expect(preProcessText("1,250")).toBe("one thousand two hundred fifty");
    expect(numberToWords("0")).toBe("zero");
    expect(numberToWords("3.5")).toBe("three point five");
    expect(track("1984")[0]).toBe("nn");
  });

  it("maps every viseme the rules emit onto a mouth target", () => {
    const emitted = new Set(["a quick brown fox jumps over the lazy dog", "the hour was thoughtful", "rhythm and judge"]
      .flatMap((sentence) => sentence.split(" ").flatMap(track)));
    for (const viseme of emitted) expect(VISEME_MOUTH[viseme]).toBeDefined();
  });
});

describe("streamed text to a timed mouth", () => {
  it("plays each word's visemes in order once the word has streamed, then closes", () => {
    const timed = new TextMouth();
    stream(timed, "Hello there, friend.", 50);
    expect(timed.sample(299)).toBeNull();
    expect(timed.sample(300)?.viseme).toBe("I");
    expect(timed.sample(3000)).toBeNull();
    const mouth = new TextMouth();
    stream(mouth, "Hello there, friend.", 50);
    expect(sequence(mouth, 3000)).toEqual([...track("Hello"), ...track("there"), ...track("friend")]);
  });

  it("is deterministic for the same text and arrival times", () => {
    const run = () => {
      const mouth = new TextMouth();
      stream(mouth, "The quick brown fox.", 40);
      return Array.from({ length: 60 }, (_, index) => {
        const sample = mouth.sample(index * 25);
        return sample ? `${sample.viseme}:${sample.open.toFixed(3)}:${sample.form.toFixed(3)}` : "-";
      }).join(" ");
    };
    expect(run()).toBe(run());
  });

  it("paces words by how fast the characters arrived", () => {
    const span = (charMs: number) => {
      const mouth = new TextMouth();
      stream(mouth, "speaking slowly now ", charMs);
      let first = -1, last = -1;
      for (let now = 0; now < 8000; now += 5) if (mouth.sample(now)) { if (first < 0) first = now; last = now; }
      return { first, last, length: last - first };
    };
    const fast = span(30), slow = span(110);
    expect(slow.first).toBeGreaterThan(fast.first);
    expect(slow.length).toBeGreaterThan(fast.length * 2);
  });

  it("speaks a final word that has no trailing space after the stream goes quiet", () => {
    const mouth = new TextMouth();
    stream(mouth, "Yes", 50);
    expect(mouth.sample(160)).toBeNull();
    expect(mouth.sample(150 + TEXT_MOUTH.idleFlushMs)?.viseme).toBe(track("Yes")[0]);
  });

  it("caps the backlog when a large block arrives at once", () => {
    const mouth = new TextMouth();
    const block = "and so the long reply went on and on without a single pause for breath ".repeat(5);
    mouth.push(block, 0);
    let last = 0;
    for (let now = 0; now < 20000; now += 10) if (mouth.sample(now)) last = now;
    expect(last).toBeLessThan(2500);
  });

  it("treats already spoken text as said, and a rewritten reply as a fresh start", () => {
    const resumed = new TextMouth("Hello there, ");
    resumed.push("Hello there, friend ", 0);
    expect(sequence(resumed, 2000)).toEqual(track("friend"));
    const rewritten = new TextMouth();
    rewritten.push("Hello ", 0);
    rewritten.push("Goodbye ", 50);
    expect(() => rewritten.sample(100)).not.toThrow();
  });
});
