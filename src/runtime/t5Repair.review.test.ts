import type { HostLoreBindings } from "@services/STAPI";
import { readRequirements } from "./requirementsRead";
import { castRepairSteps, loreRepairSteps, nextRepairStep, provisionableMissing } from "./repair";
import { runCastRepair } from "./castRepair";
import { RequirementsWatch, REQUIREMENTS_DEBOUNCE_MS, type RequirementsHost } from "./requirementsWatch";
import { createSaveHealth } from "./saveHealth";
import { testOwnership } from "../../test/findings/testOwnership";
import type { RequirementsState, RuntimeSnapshot } from "./types";

jest.mock("@services/STAPI", () => ({
  getAllCharacterNames: () => ["Master Ilse", "Lord Vael", "Lady Corvane"],
  getContext: () => ({ name1: "Max", chatId: "c1" }),
  listGroupMembers: () => ["Master Ilse", "Lord Vael"],
  listMutedGroupMembers: () => [],
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [], listed: ["The Redline Kingdom"] }),
}));

import { evaluateRequirements, storyRequirements } from "./requirements";

const lore = (listed: string[]): HostLoreBindings => ({ global: [], chat: null, persona: null, characters: [], listed });
const scan = { scan: true, mirrorBook: null };
const requirements = (overrides: Partial<RequirementsState>): RequirementsState => ({ ready: false, missingPersonas: [], missingMembers: [], missingLorebooks: [], ...overrides });

describe("T5-4: Repair tells a missing asset from an existing one that is not bound here", () => {
  it("reads a member whose card exists as missing from the group but not absent, and a card nobody made as absent", () => {
    const state = readRequirements({ members: ["Lady Corvane", "Ghost"] }, { persona: "Max", members: ["Master Ilse"], cards: ["Lady Corvane", "Master Ilse"], lore: lore([]) }, scan);
    expect(state).toMatchObject({ missingMembers: ["Lady Corvane", "Ghost"], absentMembers: ["Ghost"] });
  });

  it("reads a book the install lists as missing but not absent", () => {
    const state = readRequirements({ lorebooks: ["The Redline Kingdom", "Unwritten"] }, { persona: "Max", members: [], lore: lore(["The Redline Kingdom"]) }, scan);
    expect(state).toMatchObject({ missingLorebooks: ["The Redline Kingdom", "Unwritten"], absentLorebooks: ["Unwritten"] });
  });

  it("offers a one-click add for a removed member and never the wizard", () => {
    const [absent, unbound] = castRepairSteps(requirements({ missingMembers: ["Lady Corvane"], absentMembers: [] }));
    expect(absent).toBeNull();
    expect(unbound).toMatchObject({ provisionable: false, opensGroup: true, action: { kind: "add-members", members: ["Lady Corvane"] } });
    expect(unbound?.detail).toContain("The card exists");
  });

  it("offers an unmute for a muted member, and the wizard only for a card that does not exist", () => {
    const steps = castRepairSteps(requirements({ missingMembers: ["Ghost"], absentMembers: ["Ghost"], mutedMembers: ["Lord Vael"] })).filter(Boolean);
    expect(steps.map((step) => [step?.provisionable, step?.action?.kind ?? null])).toEqual([[true, null], [false, "unmute-members"]]);
  });

  it("does not offer the wizard for a book that exists but is not scanned, and explains that story books load with the story", () => {
    const [absent, unscanned] = loreRepairSteps(requirements({ missingLorebooks: ["The Redline Kingdom"], absentLorebooks: [] }));
    expect(absent).toBeNull();
    expect(unscanned).toMatchObject({ provisionable: false });
    expect(unscanned?.detail).toContain("load with the story");
  });

  it("seeds Fix with wizard only with what does not exist, so it never claims an existing asset is missing", () => {
    expect(provisionableMissing(requirements({ missingMembers: ["Lady Corvane", "Ghost"], absentMembers: ["Ghost"], missingLorebooks: ["The Redline Kingdom"], absentLorebooks: [] })))
      .toEqual({ personas: [], members: ["Ghost"], lorebooks: [] });
  });

  it("names the removed member as the one Repair step, with its fix", () => {
    const snapshot = {
      storyId: "redline",
      extraction: { settings: { enabled: true, profileId: "p" } },
      requirements: requirements({ missingMembers: ["Lady Corvane"], absentMembers: [] }),
      saveHealth: createSaveHealth(),
    } as unknown as RuntimeSnapshot;
    expect(nextRepairStep(snapshot)?.action?.label).toBe("Add Lady Corvane back to the group");
  });

  it("runs the fix, journals it, then re-reads the requirements", async () => {
    const order: string[] = [];
    const host = {
      add: jest.fn(async () => { order.push("add"); return { ok: true as const, added: ["Lady Corvane"] }; }),
      unmute: jest.fn(async () => ({ ok: true as const })),
      refresh: jest.fn(async () => { order.push("refresh"); }),
      journal: jest.fn(() => { order.push("journal"); }),
      ownership: testOwnership(),
    };
    const result = await runCastRepair({ kind: "add-members", members: ["Lady Corvane"], label: "Add Lady Corvane back to the group" }, host);
    expect(result.ok).toBe(true);
    expect(host.add).toHaveBeenCalledWith(["Lady Corvane"]);
    expect(host.unmute).not.toHaveBeenCalled();
    expect(order).toEqual(["add", "journal", "refresh"]);
  });

  it("control: a chat left while the group was saved gets no note and no re-read", async () => {
    let owned = true;
    const ownership = { ...testOwnership(), check: () => (owned ? { ok: true as const } : { ok: false as const, reason: "chat" as const, detail: "left" }) };
    const host = {
      add: jest.fn(async () => { owned = false; return { ok: true as const }; }),
      unmute: jest.fn(async () => ({ ok: true as const })),
      refresh: jest.fn(async () => undefined),
      journal: jest.fn(),
      ownership,
    };
    await runCastRepair({ kind: "add-members", members: ["Lady Corvane"], label: "Add Lady Corvane back to the group" }, host);
    expect(host.journal).not.toHaveBeenCalled();
    expect(host.refresh).not.toHaveBeenCalled();
  });
});

describe("T5-1: requirements read the cast by card name, whatever the story wrote", () => {
  const story = {
    requirements: { members: ["lord_vael", "Lady Corvane"] },
    roster: [{ id: "lord_vael", name: "Lord Vael" }, { id: "lady_corvane", name: "Lady Corvane" }],
  };

  it("resolves a roster id through the roster to the card name", () => {
    expect(storyRequirements(story as never)?.members).toEqual(["Lord Vael", "Lady Corvane"]);
  });

  it("evaluates a roster id as present when the member is in the group, and a card that exists as not absent", () => {
    const state = evaluateRequirements(story as never, scan);
    expect(state).toMatchObject({ missingMembers: ["Lady Corvane"], absentMembers: [] });
  });
});

describe("T5-4: a member added back with /member-add refreshes the requirements", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("schedules a refresh from a source outside the event bus, and stops listening on stop", async () => {
    const refresh = jest.fn(() => ({ before: false, after: true, behind: false }));
    const host: RequirementsHost = { refresh, hydrate: async () => undefined, persist: async () => undefined, notify: () => undefined, ownership: testOwnership() };
    let fire: (() => void) | null = null;
    const stopSource = jest.fn();
    const watch = new RequirementsWatch(host, () => () => undefined, REQUIREMENTS_DEBOUNCE_MS, [(handler) => { fire = handler; return stopSource; }]);
    watch.start();
    (fire as unknown as () => void)();
    jest.advanceTimersByTime(REQUIREMENTS_DEBOUNCE_MS);
    expect(await watch.settled()).toBe("refreshed");
    expect(refresh).toHaveBeenCalledTimes(1);
    watch.stop();
    expect(stopSource).toHaveBeenCalledTimes(1);
  });
});

describe("T5-1: a cast change plan keeps the single-name form", () => {
  it("reads a bare string as one member, resolved through the roster", async () => {
    const { planCastChanges } = await import("./castEffect");
    expect(planCastChanges([{ id: "mara_v", name: "Mara" }], { disable: "mara_v" }, () => true)?.changes).toEqual([["Mara", true]]);
  });
});
