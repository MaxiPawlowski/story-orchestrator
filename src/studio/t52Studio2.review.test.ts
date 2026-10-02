import type { StoryV2 } from "@engine/index";
import { chatSaveHalf, NO_CHAT_OPEN } from "@runtime/librarySave";
import { runDiagnostics, type DiagnosticsContext } from "./diagnostics";
import { playerRoles } from "./playerRole";

const pawnbroker = (patch: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2,
  title: "The Pawnbroker of Forgotten Days",
  description: "",
  qualities: [],
  checkpoints: [
    {
      id: "start", name: "The Writ", objective: "", type: "intermediate", start: true,
      effects: { background: { name: "pawnshop_interior" }, cast_changes: { enable: ["The Queen's Agent"], disable: ["The Queen", "The Memory Broker"] } },
    },
    { id: "end", name: "The Ticket", objective: "", type: "anchor", effects: { background: { name: "royal" } } },
  ],
  transitions: [{ from: "start", to: "end", priority: 0, gate: { all: [] } }],
  roster: [{ id: "agent", name: "The Queen's Agent" }, { id: "queen", name: "The Queen" }, { id: "broker", name: "The Memory Broker" }],
  requirements: { members: ["The Queen's Agent", "The Queen", "The Memory Broker"] },
  ...patch,
});

const rows = (draft: StoryV2, code: string, context: DiagnosticsContext = {}) => runDiagnostics(draft, context).filter((entry) => entry.code === code);

describe("T5-2-2 MEDIUM: Diagnostics names a cast member with no card on the install", () => {
  const context: DiagnosticsContext = { characterNames: () => ["The Queen's Agent", "Seraphina"] };

  it("warns for cast_changes and requirements members the install has no card for (x-p2-diagnostics.json said no issues)", () => {
    const found = rows(pawnbroker(), "cast-member-no-card", context);
    expect(found.map((row) => row.path)).toEqual([
      "checkpoints.0.effects.cast_changes.disable.0",
      "checkpoints.0.effects.cast_changes.disable.1",
      "requirements.members.1",
      "requirements.members.2",
    ]);
    expect(found[0]).toMatchObject({ severity: "warning", message: expect.stringContaining("no card named 'The Queen'") });
    expect(found[0].consequence).toBeTruthy();
  });

  it("control: without install facts, or with every card present, nothing is flagged", () => {
    expect(rows(pawnbroker(), "cast-member-no-card")).toEqual([]);
    expect(rows(pawnbroker(), "cast-member-no-card", { characterNames: () => [] })).toEqual([]);
    expect(rows(pawnbroker(), "cast-member-no-card", { characterNames: () => ["the queen's agent", "The Queen", "The Memory Broker"] })).toEqual([]);
  });
});

describe("T5-2-2 LOW: Diagnostics names a background the install does not have", () => {
  it("warns for a background name missing from the install's list (pawnshop_interior failed on apply)", () => {
    const found = rows(pawnbroker(), "background-missing", { backgroundNames: () => ["royal.jpg", "tavern day.jpg"] });
    expect(found.map((row) => row.path)).toEqual(["checkpoints.0.effects.background"]);
    expect(found[0].message).toContain("'pawnshop_interior'");
  });

  it("control: a file name with or without its extension, and no install facts, are not flagged", () => {
    expect(rows(pawnbroker(), "background-missing", { backgroundNames: () => ["royal.jpg", "Pawnshop_Interior.png"] })).toEqual([]);
    expect(rows(pawnbroker(), "background-missing")).toEqual([]);
  });
});

describe("T5-2-2 MEDIUM: the player's own role is not a cast member", () => {
  it("reads the role the story gives the player, conservatively", () => {
    expect(playerRoles(["\"You are the pawnbroker,\" she says."])).toContain("pawnbroker");
    expect(playerRoles(["The player is a smuggler of saints."])).toContain("smuggler");
    expect(playerRoles(["You are thieves.", "You came to Aegis City.", "Are you the one they sent?"])).toEqual([]);
  });

  it("warns when a roster member is the role the description gives the player, or the player's persona", () => {
    const draft = pawnbroker({
      description: "You are the pawnbroker of forgotten days. The crown hires you.",
      roster: [{ id: "pawnbroker", name: "The Pawnbroker" }, { id: "max", name: "Max Nightriver" }, { id: "queen", name: "The Queen" }],
      requirements: { personas: ["Max Nightriver"] },
    });
    const found = rows(draft, "roster-member-is-player");
    expect(found.map((row) => row.path)).toEqual(["roster.0", "roster.1"]);
    expect(found[0].message).toContain("the story addresses the player as 'pawnbroker'");
  });

  it("control: a story that never casts the player has no warning", () => {
    expect(rows(pawnbroker({ description: "A pawnbroker is hired to recover the queen's childhood." }), "roster-member-is-player")).toEqual([]);
  });
});

describe("T5-2-2 LOW: a save with no chat open says nothing about a chat", () => {
  it("drops the chat half when no chat is open", () => {
    expect(chatSaveHalf(true, NO_CHAT_OPEN)).toBe("");
  });

  it("control: a chat playing another story, or one that took the save, still says so", () => {
    expect(chatSaveHalf(true, null)).toBe(" Not applied to this chat: it is playing a different story.");
    expect(chatSaveHalf(true, { applied: true, detail: "this chat is playing the new version now" })).toBe(" Applied to this chat: this chat is playing the new version now.");
    expect(chatSaveHalf(false, null)).toBe("");
  });
});
