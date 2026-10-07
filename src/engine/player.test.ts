import { parseStoryV2 } from "./validate";
import { readPlayer } from "./validate/player";
import { carriesPlayerRoleLine, createdPersonaDescription, fixedPlayerName, playerInjects, playerRoleLine, renderPlayerRoleLine, storyPlayerNames } from "./player";
import type { ValidationError } from "./schema";

const read = (value: unknown) => {
  const errors: ValidationError[] = [];
  return { player: readPlayer(value, errors), errors: errors.map((error) => error.path) };
};

const story = (player: unknown) => ({
  format: 2, title: "T", description: "D", qualities: [], transitions: [], roster: [],
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true }], player,
});

describe("v2.7 34 the story's player profile", () => {
  it("reads every field and keeps the living-card binding beside them", () => {
    const { player, errors } = read({
      role: " a hired adventurer ", summary: "You are new to the city.", name: { mode: "suggested", value: "Rook" }, assumes: ["can fight", " "],
      suggested_description: "Tall. {{user}} keeps a sword.", inject: false, card: { fields: { look: { quality: "look" } } },
    });
    expect(errors).toEqual([]);
    expect(player).toEqual({
      role: "a hired adventurer", summary: "You are new to the city.", name: { mode: "suggested", value: "Rook" }, assumes: ["can fight"],
      suggested_description: "Tall. {{user}} keeps a sword.", inject: false, card: { fields: { look: { quality: "look" } } },
    });
  });

  it("refuses an unknown key, a macro in player copy, a bad name mode and a fixed name without a value", () => {
    expect(read({ rol: "x" }).errors).toEqual(["player.rol"]);
    expect(read({ summary: "You are {{user}}." }).errors).toEqual(["player.summary"]);
    expect(read({ name: { mode: "forced" } }).errors).toEqual(["player.name.mode"]);
    expect(read({ name: { mode: "fixed" } }).errors).toEqual(["player.name.value"]);
    expect(read({ inject: "yes", assumes: "one" }).errors).toEqual(["player.inject", "player.assumes"]);
    expect(read("a courier").errors).toEqual(["player"]);
  });

  it("parses into the normalized story and an absent block stays absent", () => {
    const parsed = parseStoryV2(story({ role: "a courier" }));
    expect(Array.isArray(parsed) ? parsed : parsed.player).toEqual({ role: "a courier" });
    const without = parseStoryV2(story(undefined));
    expect(Array.isArray(without) ? without : "player" in without).toBe(false);
  });

  it("renders one canonical line, the same function the block and the created description use", () => {
    expect(renderPlayerRoleLine("a courier", "You carry a letter.")).toBe("In this story, {{user}} is a courier: You carry a letter.");
    expect(renderPlayerRoleLine("a courier", undefined)).toBe("In this story, {{user}} is a courier.");
    expect(renderPlayerRoleLine(undefined, undefined)).toBeNull();
    expect(playerInjects({ role: "a courier" })).toBe(true);
    expect(playerInjects({ role: "a courier", inject: false })).toBe(false);
    expect(playerInjects({ assumes: ["can ride"] })).toBe(false);
  });

  it("the created description starts with the canonical line and never repeats it", () => {
    const player = { role: "a courier", summary: "You carry a letter.", suggested_description: "Quiet." };
    expect(createdPersonaDescription(player)).toBe(`${playerRoleLine(player)}\n\nQuiet.`);
    expect(createdPersonaDescription({ ...player, suggested_description: `${playerRoleLine(player)} Quiet.` })).toBe(`${playerRoleLine(player)} Quiet.`);
  });

  it("equivalence is by content: the line verbatim, or with the persona's name for {{user}}", () => {
    const line = renderPlayerRoleLine("a courier", "You carry a letter.");
    expect(carriesPlayerRoleLine(`Bio.\n${line}`, line)).toBe(true);
    expect(carriesPlayerRoleLine("In this story, Max is a courier: You carry a letter.", line, "Max")).toBe(true);
    expect(carriesPlayerRoleLine("In this story, Max is a courier.", line, "Max")).toBe(false);
    expect(carriesPlayerRoleLine("", line)).toBe(false);
  });

  it("a fixed name joins the names the player answers to", () => {
    const fixed = { player: { name: { mode: "fixed" as const, value: "Mara" } }, requirements: { personas: ["Old"] } };
    expect(fixedPlayerName(fixed)).toBe("Mara");
    expect(storyPlayerNames(fixed)).toEqual(["Old", "Mara"]);
    expect(fixedPlayerName({ player: { name: { mode: "suggested", value: "Mara" } } })).toBeNull();
  });
});
