import { livePersonaHost, PERSONA_LAPSED, PERSONA_UNLOADED, type PersonaWriter } from "./personaHostLive";
import type { PersonaRead } from "./playerSetup";

const read = (): PersonaRead => ({ avatarId: "max.png", name: "Max", description: "", descriptionSent: true, lockedAvatarId: null, personas: [], canCreate: true });

const chats: Record<string, Record<string, unknown>> = {};
let open = "chat-a";

const writer = (): PersonaWriter & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    selectPersona: async (avatarId) => { calls.push(`select ${avatarId}`); return { ok: true, avatarId }; },
    lockPersonaToChat: async () => { calls.push("lock"); chats[open].persona = "max.png"; return { ok: true, avatarId: "max.png" }; },
    createPersona: async (input) => { calls.push(`create ${input.name}`); return { ok: true, avatarId: "new.png" }; },
  };
};

beforeEach(() => {
  open = "chat-a";
  chats["chat-a"] = {};
  chats["chat-b"] = {};
});

describe("Sol finding 5: the lazy persona writer carries the run guard", () => {
  it("a chat switch while the writer chunk loads runs no host write, and the other chat keeps no lock", async () => {
    const live = writer();
    const owner = "chat-a";
    const host = livePersonaHost(async () => { open = "chat-b"; return live; }, read, () => undefined);
    const owns = () => open === owner;
    expect(await host.lock(owns)).toEqual({ ok: false, reason: PERSONA_LAPSED });
    expect(await host.select("mara.png", owns)).toEqual({ ok: false, reason: PERSONA_LAPSED });
    expect(await host.create({ name: "Rook", description: "", title: "Story: X" }, owns)).toEqual({ ok: false, reason: PERSONA_LAPSED });
    expect(live.calls).toEqual([]);
    expect(chats["chat-b"]).toEqual({});
  });

  it("hands the same guard to the writer, so it can re-check after its own awaits", async () => {
    const seen: Array<() => boolean> = [];
    const live = { ...writer(), lockPersonaToChat: async (owns: () => boolean) => { seen.push(owns); return { ok: true as const, avatarId: "max.png" }; } };
    const owns = () => true;
    await livePersonaHost(async () => live, read, () => undefined).lock(owns);
    expect(seen).toEqual([owns]);
  });

  it("a writer chunk that fails to load answers in player words", async () => {
    const warned: unknown[] = [];
    const host = livePersonaHost(async () => { throw new Error("chunk"); }, read, (error) => warned.push(error));
    expect(await host.lock(() => true)).toEqual({ ok: false, reason: PERSONA_UNLOADED });
    expect(warned).toHaveLength(1);
  });

  it("control: with the chat still open every write reaches the writer", async () => {
    const live = writer();
    const host = livePersonaHost(async () => live, read, () => undefined);
    await host.select("mara.png", () => true);
    await host.lock(() => true);
    expect(live.calls).toEqual(["select mara.png", "lock"]);
    expect(chats["chat-a"]).toEqual({ persona: "max.png" });
  });
});
