import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import { DELIVERY_HEADER, deliveryTokens, renderDelivery } from "./render";
import { deliveryResolver, mineRepetitionBy, repliesBy, repeatedPhrases } from "./mine";
import { deliveryLines } from "./kit";

const STORY = parseStoryOrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/delivery.story.json"), "utf8")));

const reply = (name: string, mes: string) => ({ name, mes, is_user: false, is_system: false });
const user = (mes: string) => ({ name: "You", mes, is_user: true });

const roster = (members: NormalizedStory["roster"]) => ({ roster: members }) as Pick<NormalizedStory, "roster">;

describe("v2.9 plan 02 S2: the private delivery line", () => {
  it("renders notes, rhythm, preferred and avoided words under one header", () => {
    const { lines, cut } = renderDelivery({ sheet: STORY.roster[0].polish });
    expect(cut).toEqual([]);
    expect(lines).toEqual([
      `${DELIVERY_HEADER} Short sentences. Talks in river terms. Never says sorry out loud.`,
      "Rhythm: clipped. Words that are yours: current, mind the rope. Say it your own way instead of: indeed, perhaps.",
    ]);
  });

  it("adds the line for the current mood only", () => {
    const sheet = { notes: "Dry", by_mood: { calm: "slow", angry: "Bitten off." } };
    expect(renderDelivery({ sheet, mood: "angry" }).lines).toEqual([`${DELIVERY_HEADER} Dry. Right now (angry): Bitten off.`]);
    expect(renderDelivery({ sheet, mood: "calm" }).lines[0]).toContain("Right now (calm): slow.");
    expect(renderDelivery({ sheet, mood: null }).lines[0]).not.toContain("Right now");
  });

  it("stays within the cap, cutting prefer, then avoid, then repeats, then rhythm, then whole note sentences", () => {
    const sheet = {
      notes: "One sentence about her register and habits. Another about the river she grew up on. A third about what she never says aloud.",
      prefer: Array.from({ length: 12 }, (_, index) => `river word ${index}`), avoid: Array.from({ length: 20 }, (_, index) => `fancy ${index}`), rhythm: "clipped" as const,
      by_mood: { calm: "Slow and dry, a joke under every warning, never raising her voice at all." },
    };
    const render = renderDelivery({ sheet, mood: "calm", repeated: ["mind the rope there", "as the current goes"] });
    expect(render.tokens).toBeLessThanOrEqual(120);
    expect(deliveryTokens(render.lines.join("\n"))).toBe(render.tokens);
    expect(render.cut.slice(0, 2)).toEqual(["prefer", "avoid"]);
    expect(render.lines.join("\n")).toContain("Right now (calm)");
    render.lines.forEach((line) => expect(line).not.toMatch(/\w$/));
    const tight = renderDelivery({ sheet, mood: "calm" }, 30);
    expect(tight.cut.slice(0, 4)).toEqual(["prefer", "avoid", "rhythm", "notes"]);
    expect(tight.lines.join(" ")).not.toContain("another about");
  });

  it("renders a repetition line with at most three phrases, longest first, and nothing for an empty sheet", () => {
    expect(renderDelivery({ repeated: ["ab cd ef", "a much longer phrase here", "xy zz yy", "short one"] }).lines)
      .toEqual(['Lately you keep using: "a much longer phrase here", "short one", "ab cd ef" — vary it.']);
    expect(renderDelivery({}).lines).toEqual([]);
  });
});

describe("v2.9 plan 02 S3: per-speaker repetition", () => {
  it("attributes a row only when its name fits exactly one member", () => {
    const resolve = deliveryResolver(roster([
      { id: "a", name: "Ada", aliases: ["the guard"] }, { id: "b", name: "Bo", aliases: ["the guard", "Cy"] }, { id: "c", name: "Cy" },
    ]));
    expect(resolve("ada")).toBe("a");
    expect(resolve("the guard")).toBeNull();
    expect(resolve("Cy")).toBeNull();
    expect(resolve("Bo")).toBe("b");
    expect(resolve("Nobody")).toBeNull();
  });

  it("drops the quoted speech of an omniscient member, never attributing it to the quoted member", () => {
    const rows = [reply("River Narrator", "The ferry rocks. \"Mind the rope,\" Tamsin says. The water churns."), reply("Tamsin", "Hold on.")];
    const replies = repliesBy(rows, STORY);
    expect(replies.get("narrator")).toEqual(["The ferry rocks.   Tamsin says. The water churns."]);
    expect(replies.get("tamsin")).toEqual(["Hold on."]);
  });

  it("mines each member's own window: a phrase one member repeats is never the other's", () => {
    const rows = [
      reply("Tamsin", "She smirks and checks the old iron rope again."), user("ok"), reply("Orrin", "Strictly speaking, the toll is due."),
      reply("Tamsin", "She smirks and checks the old iron rope twice."), user("go"), reply("Orrin", "One must, strictly speaking, pay."),
      reply("Tamsin", "Tamsin smirks and checks the old iron rope."),
    ];
    const report = mineRepetitionBy(rows, STORY);
    expect(report.get("tamsin")?.hot).toEqual([expect.stringContaining("checks the old iron rope")]);
    expect(report.get("tamsin")?.tics).toEqual(["smirks"]);
    expect(report.get("orrin")?.hot).toEqual([]);
    expect(report.get("orrin")?.tics).toEqual([]);
    expect(report.has("narrator")).toBe(false);
  });

  it("counts a tic only in two or more of the member's last six replies", () => {
    const old = [reply("Tamsin", "She smirks."), reply("Tamsin", "She smirks again.")];
    const recent = Array.from({ length: 6 }, (_, index) => reply("Tamsin", `Plain reply number ${index}.`));
    expect(mineRepetitionBy([...old, ...recent], STORY).get("tamsin")?.tics).toEqual([]);
    expect(mineRepetitionBy([...recent, ...old], STORY).get("tamsin")?.tics).toEqual(["smirks"]);
    expect(mineRepetitionBy([reply("Tamsin", "She smirks.")], STORY).get("tamsin")?.tics).toEqual([]);
  });

  it("feeds the drafted member's phrases back to that member only", () => {
    const rows = [reply("Tamsin", "She smirks."), reply("Tamsin", "She smirks at the clerk.")];
    const tamsin = deliveryLines({ story: STORY, rosterId: "tamsin", rows, mood: null, repetition: true });
    const orrin = deliveryLines({ story: STORY, rosterId: "orrin", rows, mood: null, repetition: true });
    expect(tamsin.at(-1)).toBe('Lately you keep using: "smirks" — vary it.');
    expect(orrin.join("\n")).not.toContain("smirks");
    expect(deliveryLines({ story: STORY, rosterId: "tamsin", rows, mood: null, repetition: false }).join("\n")).not.toContain("Lately");
    expect(repeatedPhrases(undefined)).toEqual([]);
  });

  it("gives a member without a sheet only the repetition line, and a switched-off member nothing", () => {
    const rows = Array.from({ length: 3 }, () => reply("River Narrator", "The fog rolls over the black water again."));
    expect(deliveryLines({ story: STORY, rosterId: "narrator", rows, mood: null, repetition: true })).toEqual([
      expect.stringMatching(/^Lately you keep using: "the fog rolls over the black water again"/),
    ]);
    const off = { ...STORY, roster: STORY.roster.map((member) => (member.id === "tamsin" ? { ...member, polish: { ...member.polish, enabled: false } } : member)) };
    expect(deliveryLines({ story: off, rosterId: "tamsin", rows: [reply("Tamsin", "She smirks."), reply("Tamsin", "She smirks.")], mood: null, repetition: true })).toEqual([]);
  });
});
