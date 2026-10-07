import { RunOwner } from "./runOwner";
import { REQUIREMENTS_DEBOUNCE_MS, RequirementsWatch, refreshRequirementsNow, type RequirementsHost, type RequirementsReading } from "./requirementsWatch";

let openChat = "chat-a";
const owner = new RunOwner({ openChatId: () => openChat, storyId: () => "s1", storyHash: () => "h1" });

function host(reading: RequirementsReading | null, during?: () => void) {
  const calls: string[] = [];
  const fake: RequirementsHost = {
    refresh: jest.fn(() => { calls.push("refresh"); return reading; }),
    hydrate: jest.fn(async () => { calls.push("hydrate"); during?.(); }),
    persist: jest.fn(async () => { calls.push("persist"); }),
    notify: jest.fn(() => { calls.push("notify"); }),
    ownership: owner.ownership,
  };
  return { fake, calls };
}

beforeEach(() => {
  openChat = "chat-a";
});

describe("v2.4 plan 02 §8: requirements refresh between turns", () => {
  it("not-ready -> ready with the checkpoint not yet applied takes its effects in hydrate mode, saves, then says so", async () => {
    const { fake, calls } = host({ before: false, after: true, behind: true });
    expect(await refreshRequirementsNow(fake)).toBe("hydrated");
    expect(calls).toEqual(["refresh", "hydrate", "persist", "notify"]);
  });

  it("control: not-ready -> ready with the checkpoint already applied only refreshes", async () => {
    const { fake, calls } = host({ before: false, after: true, behind: false });
    expect(await refreshRequirementsNow(fake)).toBe("refreshed");
    expect(calls).toEqual(["refresh", "notify"]);
  });

  it("ready -> not-ready changes nothing destructive: no effect is applied, restored or saved", async () => {
    const { fake, calls } = host({ before: true, after: false, behind: true });
    expect(await refreshRequirementsNow(fake)).toBe("refreshed");
    expect(calls).toEqual(["refresh", "notify"]);
  });

  it("a chat that was already ready is not re-applied by a host event; the boundary owns that catch-up", async () => {
    const { fake, calls } = host({ before: true, after: true, behind: true });
    expect(await refreshRequirementsNow(fake)).toBe("unchanged");
    expect(calls).toEqual(["refresh", "notify"]);
  });

  it("a chat that stays not-ready is not applied", async () => {
    const { fake, calls } = host({ before: false, after: false, behind: true });
    expect(await refreshRequirementsNow(fake)).toBe("unchanged");
    expect(calls).toEqual(["refresh", "notify"]);
  });

  it("does nothing without a story", async () => {
    const { fake, calls } = host(null);
    expect(await refreshRequirementsNow(fake)).toBe("no-story");
    expect(calls).toEqual(["refresh"]);
  });

  it("a chat left while the checkpoint was applied is not saved into", async () => {
    const { fake, calls } = host({ before: false, after: true, behind: true }, () => { openChat = "chat-b"; });
    expect(await refreshRequirementsNow(fake)).toBe("lapsed");
    expect(calls).toEqual(["refresh", "hydrate"]);
  });
});

describe("v2.4 plan 02 §8: the watch", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const watchWith = (reading: RequirementsReading | null) => {
    const handlers = new Map<string, () => void>();
    const unsubscribe = jest.fn();
    const subscribe = jest.fn((entries: Array<{ eventName: string; handler: () => void }>) => {
      entries.forEach((entry) => handlers.set(entry.eventName, entry.handler));
      return unsubscribe;
    });
    const { fake, calls } = host(reading);
    const watch = new RequirementsWatch(fake, subscribe);
    watch.start();
    return { watch, handlers, unsubscribe, fake, calls };
  };

  it("subscribes the persona, group, lorebook-selection and character-edit events, and re-reads at each generation (a chat-slot bind emits nothing)", () => {
    const { handlers } = watchWith(null);
    expect([...handlers.keys()].sort()).toEqual(["CHARACTER_EDITED", "GENERATION_STARTED", "GROUP_UPDATED", "PERSONA_CHANGED", "WORLDINFO_SETTINGS_UPDATED"]);
  });

  it("refreshes once, 250 ms after the last event of a burst", async () => {
    const { watch, handlers, fake } = watchWith({ before: false, after: true, behind: true });
    handlers.get("PERSONA_CHANGED")!();
    jest.advanceTimersByTime(100);
    handlers.get("WORLDINFO_SETTINGS_UPDATED")!();
    jest.advanceTimersByTime(REQUIREMENTS_DEBOUNCE_MS - 1);
    expect(fake.refresh).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(await watch.settled()).toBe("hydrated");
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    expect(fake.hydrate).toHaveBeenCalledTimes(1);
  });

  it("a chat left inside the debounce refreshes nothing for it", async () => {
    const { watch, handlers, fake } = watchWith({ before: false, after: true, behind: true });
    handlers.get("GROUP_UPDATED")!();
    openChat = "chat-b";
    jest.advanceTimersByTime(REQUIREMENTS_DEBOUNCE_MS);
    expect(await watch.settled()).toBe("lapsed");
    expect(fake.refresh).not.toHaveBeenCalled();
  });

  it("stop unsubscribes and drops a pending refresh", () => {
    const { watch, handlers, unsubscribe, fake } = watchWith({ before: false, after: true, behind: true });
    handlers.get("PERSONA_CHANGED")!();
    watch.stop();
    jest.advanceTimersByTime(REQUIREMENTS_DEBOUNCE_MS * 2);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fake.refresh).not.toHaveBeenCalled();
  });
});
