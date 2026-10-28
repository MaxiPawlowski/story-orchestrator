import { asksPlayer, lastReplyAsksPlayer } from "./asksPlayer";

const context = { player: ["Rook"], others: ["Mara", "Finn Tallow", "Narrator"] };

describe("asksPlayer", () => {
  it.each([
    ["the last quoted line asks the player by name", '*Mara turns.* "Rook, did you see the mark on the door?"'],
    ["the last quoted line asks in the second person", 'Mara wipes her blade. "You have been here before, haven\'t you?"'],
    ["a short narration tail after the question", '"What brought you to Lowmarsh?" *She waits, arms folded.*'],
    ["curly quotes", "Finn grins. \u201cWhere did you learn that?\u201d"],
    ["unquoted prose ending on a question to the player", "The old man leans closer. Rook, will you hear me out?"],
    ["the narration names the player after a plain question", '"Is it true?" Mara asks Rook quietly.'],
  ])("yields: %s", (_name, text) => {
    expect(asksPlayer(text, context)).toBe(true);
  });

  it.each([
    ["the question names another member", '"Finn, do you think the bridge holds?"'],
    ["the narration addresses another member", '"Do you think it holds?" Mara asks Finn.'],
    ["the question is mid-reply and speech goes on", '"Where were you?" Mara shakes her head. "Never mind. We move at dawn."'],
    ["a long narration tail follows the question", `"What was that?" ${"The wind tears across the marsh and the reeds bow low under it. ".repeat(4)}`],
    ["no question at all", '"We hold the ridge until dawn, then we go."'],
    ["a rhetorical question with no addressee", '"And who could blame the river for rising?" Mara mutters.'],
    ["unquoted prose ending on a statement", "The old man leans closer and says nothing more."],
    ["unquoted rhetorical question", "The rain keeps falling. Who builds a town on a marsh?"],
    ["empty text", ""],
  ])("does not yield: %s", (_name, text) => {
    expect(asksPlayer(text, context)).toBe(false);
  });

  it("does not yield when no player name is known", () => {
    expect(asksPlayer('"Rook, did you see it?"', { player: [""], others: [] })).toBe(false);
  });

  it("a player name shared with a member does not count as another member", () => {
    expect(asksPlayer('"Mara, are you with us?"', { player: ["Mara Vell"], others: ["Mara"] })).toBe(true);
  });
});

describe("lastReplyAsksPlayer", () => {
  const roster = [{ id: "mara", name: "Mara" }, { id: "finn", name: "Finn" }];
  const asking = [{ mes: "hi", is_user: true }, { mes: '"Rook, ready?"', name: "Mara" }, { mes: "", is_system: true }];

  it("reads the last character line, skipping system rows, and names the speaker's companions as others", () => {
    expect(lastReplyAsksPlayer(roster, null, asking, "Rook")).toBe(true);
    expect(lastReplyAsksPlayer(roster, null, [{ mes: '"Finn, ready?"', name: "Mara" }], "Rook")).toBe(false);
    expect(lastReplyAsksPlayer(roster, null, [{ mes: "Ready?", is_user: true }], "Rook")).toBe(false);
  });

  it("is off where the beat sets yield_on_question false", () => {
    expect(lastReplyAsksPlayer(roster, { chain: { yield_on_question: false } }, asking, "Rook")).toBe(false);
    expect(lastReplyAsksPlayer(roster, { chain: false }, asking, "Rook")).toBe(true);
  });
});
