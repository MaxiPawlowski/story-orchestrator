import { THINKING_PLAYER_TEXT, THINKING_TARGET_ID } from "./checks";
import { nextRepairStep, setupAlert, viewerRepairStep } from "./repair";
import { createSaveHealth, markPending, markSettled } from "./saveHealth";
import { harvestWaitsOnThought, repliesCarryNoThought, SILENT_REPLY_WINDOW } from "./thinkingSilence";
import type { RuntimeSnapshot } from "./types";

const reply = (reasoning?: string) => ({ name: "Arin", is_user: false, mes: "…", extra: { api: "textgenerationwebui", ...(reasoning !== undefined ? { reasoning } : {}) } });
const user = { name: "Max", is_user: true, mes: "hi", extra: {} };
const greeting = { name: "Arin", is_user: false, mes: "Welcome.", extra: {} };
const sendas = { name: "Herald", is_user: false, mes: "Hear ye.", extra: { api: "manual", model: "slash command" } };
const note = { name: "System", is_user: false, is_system: true, mes: "note", extra: { api: "textgenerationwebui" } };
const silent = (count: number) => Array.from({ length: count }, () => reply(""));

describe("v2.7 plan 06 A: replies that carry no thought", () => {
  it("the last five generated replies all empty → silent", () => {
    expect(repliesCarryNoThought([greeting, user, ...silent(SILENT_REPLY_WINDOW)])).toBe(true);
    expect(repliesCarryNoThought([user, reply(), reply(" "), ...silent(3)])).toBe(true);
  });

  it("one reply with a thought among the last five clears it", () => {
    expect(repliesCarryNoThought([user, reply("She weighs the offer."), ...silent(4)])).toBe(false);
    expect(repliesCarryNoThought([user, ...silent(2), reply("thinking"), ...silent(2)])).toBe(false);
  });

  it("an older thought outside the window does not clear it", () => {
    expect(repliesCarryNoThought([user, reply("old thought"), ...silent(SILENT_REPLY_WINDOW)])).toBe(true);
  });

  it("greetings, /sendas posts, system notes and the player's lines never count, so a fresh chat is not silent", () => {
    expect(repliesCarryNoThought([greeting, greeting, greeting, greeting, greeting, user])).toBe(false);
    expect(repliesCarryNoThought([user, sendas, sendas, note, ...silent(4)])).toBe(false);
    expect(repliesCarryNoThought([user, ...silent(4), sendas, note, user])).toBe(false);
  });

  it("harvest waits on a thought only when it is on and knowledge tracking can run", () => {
    expect(harvestWaitsOnThought({ harvestReasoning: true, epistemicLedgerCapable: true })).toBe(true);
    expect(harvestWaitsOnThought({ harvestReasoning: true, epistemicLedgerCapable: false })).toBe(false);
    expect(harvestWaitsOnThought({ harvestReasoning: false, epistemicLedgerCapable: true })).toBe(false);
    expect(harvestWaitsOnThought({ epistemicLedgerCapable: true })).toBe(false);
    expect(harvestWaitsOnThought(undefined)).toBe(false);
  });
});

const snapshotWith = (overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot =>
  ({
    storyId: "s",
    extraction: { settings: { enabled: true, profileId: "p" } },
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    saveHealth: createSaveHealth(),
    ui: { authorView: true },
    ...overrides,
  }) as unknown as RuntimeSnapshot;

describe("v2.7 plan 06 A: the warning reaches the author and the player", () => {
  it("author: the Repair row says what is lost, why, and shows the harvest switch", () => {
    const step = nextRepairStep(snapshotWith({ thinkingSilent: true }));
    expect(step).toMatchObject({ area: "thinking", targetId: THINKING_TARGET_ID, provisionable: false });
    expect(step?.consequence).toMatch(/not thinking/);
    expect(step?.detail).toContain(`last ${SILENT_REPLY_WINDOW} replies`);
  });

  it("player: player words, no control they cannot reach, and the HUD raises it", () => {
    const player = snapshotWith({ thinkingSilent: true, ui: { authorView: false } as RuntimeSnapshot["ui"] });
    const step = viewerRepairStep(player);
    expect(step).toMatchObject({ area: "thinking", consequence: THINKING_PLAYER_TEXT, targetId: null });
    expect(step?.consequence).not.toMatch(/harvest|epistemic|Inner voice|Author/i);
    expect(setupAlert(player)?.area).toBe("thinking");
  });

  it("control: no row while replies think, and the HUD stays quiet", () => {
    expect(nextRepairStep(snapshotWith({ thinkingSilent: false }))).toBeNull();
    expect(setupAlert(snapshotWith({ ui: { authorView: false } as RuntimeSnapshot["ui"] }))).toBeNull();
  });

  it("an unsaved turn still comes first, and the HUD leaves it to its own notice", () => {
    const player = snapshotWith({ thinkingSilent: true, saveHealth: markSettled(markPending(createSaveHealth(), 4), 4, "unsaved", "500", "t"), ui: { authorView: false } as RuntimeSnapshot["ui"] });
    expect(viewerRepairStep(player)?.area).toBe("save");
    expect(setupAlert(player)).toBeNull();
  });
});
