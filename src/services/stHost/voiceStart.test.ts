import { startVoice, VOICE_BUSY, VOICE_DRAFT, type VoiceStartDeps } from "./voiceStart";

const fakeHost = (overrides: Partial<VoiceStartDeps> & { opens?: boolean } = {}) => {
  const st = { isSendPress: false, groupGenerating: false, draft: "", wrappers: 0, concurrentWrappers: 0, playerSends: [] as string[] };
  const wrapperListeners = new Set<() => void>();
  const openWrapper = async () => {
    if (st.groupGenerating) st.concurrentWrappers += 1;
    st.wrappers += 1;
    st.groupGenerating = true;
    wrapperListeners.forEach((listener) => listener());
    await Promise.resolve();
    st.groupGenerating = false;
    st.isSendPress = false;
  };
  const sendTextareaMessage = async () => {
    if (st.isSendPress) { st.playerSends.push("refused"); return; }
    st.playerSends.push("started");
    await Promise.resolve();
    await openWrapper();
  };
  const preamble: Array<() => void> = [];
  const deps: VoiceStartDeps = {
    generating: () => st.isSendPress || st.groupGenerating,
    draft: () => st.draft,
    memberId: (name) => (name === "Finn" ? 3 : undefined),
    lockSend: (locked) => { st.isSendPress = locked; },
    onWrapperStarted: (listener) => { wrapperListeners.add(listener); return () => wrapperListeners.delete(listener); },
    generate: async () => {
      preamble.forEach((step) => step());
      await Promise.resolve();
      if (overrides.opens === false) return;
      await openWrapper();
    },
    ...overrides,
  };
  return { st, deps, sendTextareaMessage, duringPreamble: (step: () => void) => preamble.push(step) };
};

describe("startVoice (P1, B1 2026-10-08: a chained voice and a player send must not open two group wrappers)", () => {
  it("holds ST's send lock from the idle check through the preamble, so a player send in that window is refused by ST's own guard", async () => {
    const host = fakeHost();
    let send: Promise<void> | null = null;
    host.duringPreamble(() => { send = host.sendTextareaMessage(); });
    const result = await startVoice(host.deps, "Finn");
    await send;
    expect(result.ok).toBe(true);
    expect(host.st.playerSends).toEqual(["refused"]);
    expect(host.st.concurrentWrappers).toBe(0);
    expect(host.st.isSendPress).toBe(false);
  });

  it("control: without the lock the same send opens a second wrapper while the voice's is running", async () => {
    const host = fakeHost();
    const unlocked: VoiceStartDeps = { ...host.deps, lockSend: () => undefined };
    let send: Promise<void> | null = null;
    host.duringPreamble(() => { send = host.sendTextareaMessage(); });
    await startVoice(unlocked, "Finn");
    await send;
    expect(host.st.playerSends).toEqual(["started"]);
    expect(host.st.concurrentWrappers).toBe(1);
  });

  it("refuses while ST is generating and when the player has typed, without touching the lock or the draft", async () => {
    const busy = fakeHost();
    busy.st.groupGenerating = true;
    expect(await startVoice(busy.deps, "Finn")).toEqual({ ok: false, reason: VOICE_BUSY });
    expect(busy.st.isSendPress).toBe(false);
    expect(busy.st.wrappers).toBe(0);

    const typing = fakeHost();
    typing.st.draft = "I draw my sword";
    expect(await startVoice(typing.deps, "Finn")).toEqual({ ok: false, reason: VOICE_DRAFT });
    expect(typing.st.isSendPress).toBe(false);
    expect(typing.st.draft).toBe("I draw my sword");
    expect(typing.st.wrappers).toBe(0);
  });

  it("refuses a name that is not in the group", async () => {
    const host = fakeHost();
    const result = await startVoice(host.deps, "Nobody");
    expect(result.ok).toBe(false);
    expect(host.st.isSendPress).toBe(false);
  });

  it("gives the lock back itself when ST returned before opening a wrapper", async () => {
    const host = fakeHost({ opens: false });
    const result = await startVoice(host.deps, "Finn");
    expect(result.ok).toBe(false);
    expect(host.st.isSendPress).toBe(false);
  });

  it("gives the lock back when the start throws", async () => {
    const host = fakeHost();
    const result = await startVoice({ ...host.deps, generate: async () => { throw new Error("Server unreachable"); } }, "Finn");
    expect(result).toEqual({ ok: false, reason: "Finn's reply could not start" });
    expect(host.st.isSendPress).toBe(false);
  });
});
