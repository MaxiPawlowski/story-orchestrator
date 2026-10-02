import type { HostLoreBindings } from "@services/STAPI";
import { readRequirements } from "./requirementsRead";
import { nextRepairStep, personaRepairSteps, withoutPersonas } from "./repair";
import { runCastRepair } from "./castRepair";
import { createSaveHealth } from "./saveHealth";
import { testOwnership } from "../../test/findings/testOwnership";
import type { RequirementsState, RuntimeSnapshot } from "./types";

const lore: HostLoreBindings = { global: [], chat: null, persona: null, characters: [], listed: [] };
const scan = { scan: true, mirrorBook: null };
const requirements = (overrides: Partial<RequirementsState>): RequirementsState => ({ ready: false, missingPersonas: [], missingMembers: [], missingLorebooks: [], ...overrides });

describe("T5-1-4 HIGH: Repair names a required persona the install does not have, and offers to drop the requirement", () => {
  it("reads a required persona that exists nowhere on the install as absent, and a merely unselected one as not", () => {
    const state = readRequirements({ personas: ["The Apprentice", "Traveller"] }, { persona: "Max Nightriver", personas: ["Max Nightriver", "Traveller"], members: [], lore }, scan);
    expect(state).toMatchObject({ missingPersonas: ["The Apprentice", "Traveller"], absentPersonas: ["The Apprentice"] });
  });

  it("names the missing persona and offers removing the requirement, never the wizard", () => {
    const [absent, unselected] = personaRepairSteps(requirements({ missingPersonas: ["The Apprentice", "Traveller"], absentPersonas: ["The Apprentice"] }));
    expect(absent?.consequence).toContain('"The Apprentice"');
    expect(absent?.consequence).toContain("does not exist on this install");
    expect(absent?.provisionable).toBe(false);
    expect(absent?.action).toEqual({ kind: "remove-personas", members: ["The Apprentice"], label: 'Remove the "The Apprentice" persona requirement' });
    expect(unselected?.consequence).toContain('"Traveller"');
    expect(unselected?.action ?? null).toBeNull();
  });

  it("is the step Repair shows for the T5-1-4 story", () => {
    const snapshot = {
      storyId: "the-redrawing-map",
      extraction: { settings: { enabled: true, profileId: "p" } },
      requirements: requirements({ missingPersonas: ["The Apprentice"], absentPersonas: ["The Apprentice"] }),
      saveHealth: createSaveHealth(),
    } as unknown as RuntimeSnapshot;
    expect(nextRepairStep(snapshot)?.detail).toContain("The Apprentice");
    expect(nextRepairStep(snapshot)?.action?.kind).toBe("remove-personas");
  });

  it("drops only the named personas from the story record, keeping everything else", () => {
    const raw = { id: "map", title: "Map", requirements: { personas: ["The Apprentice", "Traveller"], members: ["Orrin"] }, roster: [] };
    expect(withoutPersonas(raw, ["the apprentice"])).toEqual({ id: "map", title: "Map", requirements: { personas: ["Traveller"], members: ["Orrin"] }, roster: [] });
    expect(withoutPersonas({ ...raw, requirements: { personas: ["The Apprentice"] } }, ["The Apprentice"])).toEqual({ id: "map", title: "Map", requirements: {}, roster: [] });
    expect(withoutPersonas(null, ["x"])).toBeNull();
  });

  it("runs the removal through the Repair action and journals it", async () => {
    const host = {
      add: jest.fn(async () => ({ ok: true as const })),
      unmute: jest.fn(async () => ({ ok: true as const })),
      dropPersonas: jest.fn(async () => ({ ok: true as const })),
      refresh: jest.fn(async () => undefined),
      journal: jest.fn(),
      ownership: testOwnership(),
    };
    const result = await runCastRepair({ kind: "remove-personas", members: ["The Apprentice"], label: 'Remove the "The Apprentice" persona requirement' }, host);
    expect(result.ok).toBe(true);
    expect(host.dropPersonas).toHaveBeenCalledWith(["The Apprentice"]);
    expect(host.add).not.toHaveBeenCalled();
    expect(host.journal).toHaveBeenCalledWith("Repair: The Apprentice no longer required by the story", 'Remove the "The Apprentice" persona requirement');
  });
});
