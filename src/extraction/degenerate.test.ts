import { detectDegenerate } from "./degenerate";

const words = (count: number, seed: string) => Array.from({ length: count }, (_, index) => `${seed}${index}`).join(" ");

describe("detectDegenerate: a model stuck in a loop is refused, not parsed (v2.4 plan 03 D6)", () => {
  it("refuses the same line four times", () => {
    const reply = ["DELTA crossed value=true evidence=\"x\"", "The bridge holds.", "The bridge holds.", "The bridge holds.", "The bridge holds."].join("\n");
    expect(detectDegenerate(reply)).toMatchObject({ degenerate: true });
  });

  it("refuses an 8-token phrase repeated until it covers most of the reply", () => {
    const loop = "and then the guard said that the gate was closed";
    const reply = `${words(6, "w")} ${Array.from({ length: 6 }, () => loop).join(" ")}`;
    expect(detectDegenerate(reply)).toMatchObject({ degenerate: true });
  });

  it("refuses a short-period loop on one line", () => {
    expect(detectDegenerate(Array.from({ length: 40 }, () => "yes no maybe").join(" "))).toMatchObject({ degenerate: true });
  });

  it("control: a legitimate list reply with a shared structure and a shared quote is kept", () => {
    const reply = [
      "DELTA crossed value=true evidence=\"We are across the river at last, the ferryman said\"",
      "DELTA ferry_paid value=true evidence=\"We are across the river at last, the ferryman said\"",
      "FACT importance=2 text=\"The ferryman takes coin\" evidence=\"the ferryman said\"",
      "[arc] Who hired the ferryman?",
      "MEMORY tier=facts type=fact importance=2 expiration=permanent entities=Arin text=\"Arin paid the ferryman\"",
      "MEMORY tier=facts type=fact importance=2 expiration=permanent entities=Mara text=\"Mara kept watch\"",
      "MEMORY tier=facts type=fact importance=2 expiration=permanent entities=Finn text=\"Finn fell asleep\"",
    ].join("\n");
    expect(detectDegenerate(reply)).toEqual({ degenerate: false });
  });

  it("control: a prose summary and an empty reply are kept", () => {
    expect(detectDegenerate("The party crossed the river at dusk. Arin paid the ferryman; Mara kept watch while Finn slept.")).toEqual({ degenerate: false });
    expect(detectDegenerate("")).toEqual({ degenerate: false });
    expect(detectDegenerate("NO_DELTA")).toEqual({ degenerate: false });
  });

  it("control: two deltas quoting the same long line of evidence are not a loop", () => {
    const quote = "we are across the river at last and the ferryman wants his silver coin now";
    const reply = [`DELTA crossed value=true evidence="${quote}"`, `DELTA ferry_paid value=true evidence="${quote}"`].join("\n");
    expect(detectDegenerate(reply)).toEqual({ degenerate: false });
  });

  it("control: three identical lines are not yet a loop", () => {
    expect(detectDegenerate(["NONE", "NONE", "NONE"].join("\n"))).toEqual({ degenerate: false });
  });
});
