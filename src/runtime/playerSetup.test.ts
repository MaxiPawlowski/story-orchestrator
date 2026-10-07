import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { createdPersonaDescription, renderPlayerRoleLine } from "@engine/player";
import { runCheck } from "./checks";
import { PERSONA_CAST_CHECK, PERSONA_EMPTY_CHECK, PERSONA_FIT_CHECK, PERSONA_SWITCH_CHECK } from "./checksPersona";
import { identitySettled, playerRoleBlock, playerSetupView, sanitizePlayerSetup, setupNeedsPane, type PersonaRead } from "./playerSetup";
import { yourCharacterLines } from "./yourCharacter";
import type { RuntimeSnapshot } from "./types";

const PLAYER = { role: "a hired courier", summary: "You carry a sealed letter." };

const storyWith = (player?: Record<string, unknown>, roster: Array<{ id: string; name?: string }> = []): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2, id: "road", title: "The Road", description: "D", qualities: [], transitions: [], roster,
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true }], ...(player ? { player } : {}),
});

const persona = (description: string, name = "Max", descriptionSent = true): PersonaRead => ({
  avatarId: "max.png", name, description, descriptionSent, lockedAvatarId: null, personas: [{ avatarId: "max.png", name }, { avatarId: "mara.png", name: "Mara" }], canCreate: true,
});

const LINE = renderPlayerRoleLine(PLAYER.role, PLAYER.summary) ?? "";

describe("v2.7 34 the player-role block (Sol r3 R3-03: off only for the verified canonical line)", () => {
  it("(a) a persona created from an unrelated suggested description, the line removed before the click, keeps the block on", () => {
    const created = createdPersonaDescription({ ...PLAYER, suggested_description: "A tall stranger with a limp." }).replace(LINE, "").trim();
    expect(playerRoleBlock(storyWith(PLAYER), persona(created))).toBe(LINE);
  });

  it("(b) a persona created with the line intact turns the block off", () => {
    expect(playerRoleBlock(storyWith(PLAYER), persona(createdPersonaDescription({ ...PLAYER, suggested_description: "Tall." })))).toBeNull();
  });

  it("(c) the line edited in Persona Management later turns it back on", () => {
    const edited = createdPersonaDescription(PLAYER).replace("courier", "smuggler");
    expect(playerRoleBlock(storyWith(PLAYER), persona(edited))).toBe(LINE);
  });

  it("(d) the story's role changed by an update keeps it on until the line matches again", () => {
    const description = createdPersonaDescription(PLAYER);
    const updated = storyWith({ ...PLAYER, role: "a disgraced knight" });
    expect(playerRoleBlock(updated, persona(description))).toBe(renderPlayerRoleLine("a disgraced knight", PLAYER.summary));
    expect(playerRoleBlock(updated, persona(createdPersonaDescription({ ...PLAYER, role: "a disgraced knight" })))).toBeNull();
  });

  it("(e) a kept persona whose description happens to hold the line is equivalent by content", () => {
    expect(playerRoleBlock(storyWith(PLAYER), persona(`Old soldier. In this story, Max is a hired courier: You carry a sealed letter.`))).toBeNull();
  });

  it("(f) equivalence needs the description to reach the prompt: placement None keeps the block", () => {
    const description = `Old soldier. ${LINE}`;
    expect(playerRoleBlock(storyWith(PLAYER), persona(description, "Max", false))).toBe(LINE);
    expect(playerRoleBlock(storyWith(PLAYER), persona(description, "Max", true))).toBeNull();
  });

  it("controls: no player block, inject false, and a profile with no role or summary inject nothing", () => {
    expect(playerRoleBlock(storyWith(), persona(""))).toBeNull();
    expect(playerRoleBlock(storyWith({ ...PLAYER, inject: false }), persona(""))).toBeNull();
    expect(playerRoleBlock(storyWith({ assumes: ["can ride"] }), persona(""))).toBeNull();
    expect(playerRoleBlock(storyWith(PLAYER), null)).toBe(LINE);
  });
});

describe("v2.7 34 the setup record and view", () => {
  it("sanitizes a stored record and treats an absent one as settled (a chat from before this shipped)", () => {
    expect(sanitizePlayerSetup({ pending: false, storyId: "road", version: 2, choice: "pick", avatarId: "a.png", name: "A", locked: true, extra: 1 }))
      .toEqual({ pending: false, storyId: "road", choice: "pick", avatarId: "a.png", name: "A", locked: true });
    expect(sanitizePlayerSetup({ choice: "pick" })).toBeUndefined();
    expect(sanitizePlayerSetup({ pending: true, choice: "steal" })).toEqual({ pending: true });
    expect(identitySettled(undefined)).toBe(true);
    expect(identitySettled({ pending: true })).toBe(false);
  });

  it("the pane is needed for a profile or a fixed name, and only while the setting is on", () => {
    expect(setupNeedsPane(storyWith(PLAYER), true)).toBe(true);
    expect(setupNeedsPane(storyWith({ name: { mode: "fixed", value: "Mara" } }), true)).toBe(true);
    expect(setupNeedsPane(storyWith(), true)).toBe(false);
    expect(setupNeedsPane(storyWith(PLAYER), false)).toBe(false);
  });

  it("a fixed name narrows the choices; the view never carries the persona's description", () => {
    const view = playerSetupView({ story: storyWith({ ...PLAYER, name: { mode: "fixed", value: "Mara" } }), storyId: "road", record: { pending: true },
      persona: persona("SECRET BIO"), enabled: true, beforeFirstMessage: true });
    expect(view?.personas).toEqual([{ avatarId: "mara.png", name: "Mara" }]);
    expect(JSON.stringify(view)).not.toContain("SECRET BIO");
  });

  it("names the switch, the cast clash and the empty description", () => {
    const view = playerSetupView({ story: storyWith({ ...PLAYER, inject: false }, [{ id: "mara", name: "Mara" }]), storyId: "road",
      record: { pending: false, avatarId: "max.png", name: "Max" }, persona: { ...persona(""), name: "Mara", avatarId: "mara.png" }, enabled: true, beforeFirstMessage: false });
    expect(view).toMatchObject({ switched: true, lockedName: "Max", castClash: "Mara", descriptionEmpty: true, injectOff: true });
    expect(yourCharacterLines(view)).toEqual(["Playing as Max.", "In this story you are a hired courier.", "You carry a sealed letter."]);
  });
});

const snapshot = (over: Partial<RuntimeSnapshot>): RuntimeSnapshot => ({ storyId: "road", requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] }, ...over }) as RuntimeSnapshot;

describe("v2.7 34 persona checks", () => {
  const view = (over: Record<string, unknown>) => ({ playerSetup: { storyId: "road", pending: false, record: null, switched: false, castClash: null, descriptionEmpty: false, injectOff: false, ...over } }) as unknown as Partial<RuntimeSnapshot>;

  it("persona-fit blocks on a fixed name and offers the start page", () => {
    const result = runCheck(PERSONA_FIT_CHECK, snapshot({ requirements: { ready: false, missingPersonas: [], missingMembers: [], missingLorebooks: [], missingFixedName: "Mara" } }));
    expect(result).toMatchObject({ severity: "blocks", dismissable: false, action: { kind: "open-player-setup" } });
    expect(runCheck(PERSONA_FIT_CHECK, snapshot({}))).toBeNull();
  });

  it("persona-switch degrades with one Switch back action naming the locked avatar", () => {
    const result = runCheck(PERSONA_SWITCH_CHECK, snapshot(view({ switched: true, lockedName: "Max", record: { pending: false, avatarId: "max.png" }, current: { avatarId: "m", name: "Mara" } })));
    expect(result).toMatchObject({ severity: "degrades", consequence: "This story was started as Max; switching mid-story breaks what characters know about you.",
      action: { kind: "switch-persona", avatarId: "max.png", label: "Switch back" } });
    expect(runCheck(PERSONA_SWITCH_CHECK, snapshot(view({})))).toBeNull();
  });

  it("the cast clash degrades and the empty description is info only", () => {
    expect(runCheck(PERSONA_CAST_CHECK, snapshot(view({ castClash: "Mara" })))?.severity).toBe("degrades");
    expect(runCheck(PERSONA_EMPTY_CHECK, snapshot(view({ descriptionEmpty: true, injectOff: true })))?.severity).toBe("info");
    expect(runCheck(PERSONA_EMPTY_CHECK, snapshot(view({ descriptionEmpty: true, injectOff: false })))).toBeNull();
  });
});
