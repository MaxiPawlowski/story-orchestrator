import type { StoryV2 } from "@engine/index";
import { setPlayer } from "../../studio/mutations";
import { rosterMemberIsPlayer, storyPlayerRoles } from "../../studio/playerRole";
import { runDiagnostics } from "../../studio/diagnostics";
import { applyAgentOp, describeAgentOp } from "./loop";
import { AGENT_TOOLS, checkToolCall } from "./tools";

const draft = (over: Partial<StoryV2> = {}): StoryV2 => ({
  format: 2, title: "T", description: "D", qualities: [], transitions: [], roster: [],
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true }], ...over,
});

describe("v2.7 34 the wizard drafts the player profile (D), and still never a persona", () => {
  it("setPlayer is an edit tool backed by the mutation", () => {
    expect(AGENT_TOOLS.setPlayer).toMatchObject({ family: "edit", backedBy: "setPlayer" });
    expect(Object.keys(AGENT_TOOLS).some((name) => /persona/i.test(name))).toBe(false);
  });

  it("validates the profile through the story validator and refuses card fields", () => {
    expect(checkToolCall({ tool: "setPlayer", args: { player: { role: "a courier", assumes: ["can ride"] } } }))
      .toEqual({ ok: true, spec: AGENT_TOOLS.setPlayer, op: { kind: "setPlayer", player: { role: "a courier", assumes: ["can ride"] } } });
    expect(checkToolCall({ tool: "setPlayer", args: { player: { summary: "You are {{user}}." } } })).toMatchObject({ ok: false, message: expect.stringContaining("setPlayer.player.summary") });
    expect(checkToolCall({ tool: "setPlayer", args: { player: { card: { fields: {} } } } })).toMatchObject({ ok: false, message: expect.stringContaining("Roster tab") });
  });

  it("applies as an ordinary reviewed edit and keeps the living-card binding", () => {
    const bound = draft({ player: { card: { fields: { look: { quality: "look" } } } } });
    const next = applyAgentOp(bound, { kind: "setPlayer", player: { role: "a courier" } });
    expect(next.player).toEqual({ role: "a courier", card: { fields: { look: { quality: "look" } } } });
    expect(describeAgentOp({ kind: "setPlayer", player: { role: "a courier" } })).toMatchObject({ entity: "story.player", label: "The player plays a courier" });
    expect(setPlayer(draft({ player: { role: "x" } }), undefined).player).toBeUndefined();
  });

  it("player.role is the first source of the player's role, the regex reading stays a fallback", () => {
    const authored = draft({ player: { role: "the pawnbroker" }, roster: [{ id: "broker", name: "Pawnbroker" }] });
    expect(storyPlayerRoles(authored)[0]).toBe("pawnbroker");
    expect(rosterMemberIsPlayer(authored.roster[0], authored)).toBe(true);
    expect(runDiagnostics(authored).map((entry) => entry.code)).toContain("roster-member-is-player");
    const guessed = draft({ description: "You are a smuggler.", roster: [{ id: "smuggler", name: "Smuggler" }] });
    expect(storyPlayerRoles(guessed)).toContain("smuggler");
    const fixed = draft({ player: { name: { mode: "fixed", value: "Mara" } }, roster: [{ id: "mara", name: "Mara" }] });
    expect(rosterMemberIsPlayer(fixed.roster[0], fixed)).toBe(true);
  });
});
