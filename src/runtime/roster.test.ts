// v2.4 plan 01 T10: the active speaker is the last CHARACTER turn, not the last row. Row shapes are the
// host's own (host-facts 01-H9 `/comment`, 01-H10 `/sys`, 01-H11 group `/sd` + tool rows).

const mockChat: { rows: unknown[] } = { rows: [] };

import { chooseByRules, buildCandidates } from "@talk/rules";
import { activeSpeakerId, nameForRosterId, namesForRosterId } from "./roster";
import type { RosterHost } from "./hostPorts";

const host: RosterHost = {
  getActiveGroup: () => ({ disabled_members: [] }) as Partial<NonNullable<ReturnType<RosterHost["getActiveGroup"]>>> as NonNullable<ReturnType<RosterHost["getActiveGroup"]>>,
  resolveGroupMemberId: (name: string) => (["Arin", "DM Narrator", "Luke", "Ponticius"].includes(name) ? `${name}.png` : null),
  chatRows: () => mockChat.rows,
  systemUserName: "SillyTavern System",
} as RosterHost;

const story = {
  roster: [
    { id: "arin", name: "Arin" },
    { id: "dm", name: "DM Narrator" },
    { id: "luke", name: "Luke" },
    { id: "ponticius", name: "Ponticius" },
  ],
} as never;

const reply = (name: string) => ({ name, is_user: false, is_system: false, mes: "…", extra: { api: "textgenerationwebui", model: "artemis" } });
const player = { name: "You", is_user: true, is_system: false, mes: "I wait." };
const note = { name: "Note", is_user: false, is_system: true, mes: "Checkpoint: The Gate", extra: { type: "comment", isSmallSys: true } };
const hidden = { ...reply("Ponticius"), is_system: true };
const sdPost = { name: "SillyTavern System", is_user: false, is_system: false, mes: "[image]", extra: { media: [{ url: "x.png" }], inline_image: false } };
const toolRow = { name: "SillyTavern System", is_user: false, is_system: true, mes: "tool", extra: { isSmallSys: true, tool_invocations: [] } };
const sysNarrator = { name: "System", is_user: false, is_system: false, mes: "Rain falls.", extra: { type: "narrator" } };
const rosterNarrator = { name: "DM Narrator", is_user: false, is_system: false, mes: "Rain falls.", extra: { type: "narrator" } };

const speakerAfter = (...rows: unknown[]) => {
  mockChat.rows = [player, reply("Arin"), player, reply("Luke"), ...rows];
  return activeSpeakerId(story, host);
};

describe("activeSpeakerId skips rows that are not a character's turn (T10)", () => {
  it.each([
    ["a transition Note (/comment)", note],
    ["a hidden row", hidden],
    ["a visible group /sd post", sdPost],
    ["a tool-call row", toolRow],
    ["a /sys narrator row whose name is not a roster member", sysNarrator],
  ])("skips %s and keeps the last member", (_label, row) => {
    expect(speakerAfter(row)).toBe("luke");
  });

  it("keeps a narrator row whose name is a roster member as that member", () => {
    expect(speakerAfter(rosterNarrator)).toBe("dm");
  });

  it("still answers the member when the last row is an ordinary reply", () => {
    expect(speakerAfter(reply("Ponticius"))).toBe("ponticius");
  });

  it("still answers null when the last character row is not a roster member", () => {
    expect(speakerAfter(reply("Stranger"))).toBeNull();
  });
});

describe("nameForRosterId is the display name alone (SP9 presence source)", () => {
  it("maps an enabled id to its name, while namesForRosterId keeps the alias list", () => {
    expect(nameForRosterId(story, "dm")).toBe("DM Narrator");
    expect(namesForRosterId(story, "dm")).toEqual(["DM Narrator", "dm"]);
  });

  it("falls back to the id for an unknown member", () => {
    expect(nameForRosterId(story, "ghost")).toBe("ghost");
  });
});

describe("talk no_repeat after a Note (talk/rules, T10)", () => {
  it("excludes the member who spoke before the Note", () => {
    const control = { speakers: [{ member: "luke" }, { member: "arin" }] };
    const candidates = buildCandidates(control, (story as { roster: never[] }).roster, ["arin", "luke"]);
    const pick = chooseByRules(control, candidates, { lastSpeakerRosterId: speakerAfter(note), random: () => 0 });
    expect(pick?.rosterId).toBe("arin");
  });
});
