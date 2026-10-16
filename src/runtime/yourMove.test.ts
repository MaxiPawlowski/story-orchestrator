import { deriveTurn, messageRevision, type TurnInputs } from "./yourMove";
import type { TalkDecisionAudit } from "./talkStagecraftTypes";

const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const reply = (mes: string, swipe = 0) => ({ name: "Mara", is_user: false, mes, swipe_id: swipe, swipes: [mes] });
const player = (mes: string) => ({ name: "You", is_user: true, mes });

const decision = (messageId: number, row: unknown, kind: TalkDecisionAudit["kind"], checkpointId = "cp1"): TalkDecisionAudit => ({
  at: "2026-10-16T00:00:00.000Z", messageId, checkpointId, chosenRosterId: null, chosenName: null, source: "judge", latencyMs: 1, kind, revision: messageRevision(row),
});

const deepFreeze = <T,>(value: T): T => {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const expected = (input: TurnInputs): boolean => {
  if (!input.enabled || input.generating || !input.checkpointId) return false;
  const last = input.chat[input.chat.length - 1] as { is_user?: boolean; mes?: string; swipe_id?: number } | undefined;
  if (!last || last.is_user === true) return false;
  const latest = input.decisions.filter((entry) => entry.checkpointId === input.checkpointId).at(-1);
  if (!latest || latest.kind !== "player" || latest.messageId !== input.chat.length - 1) return false;
  const now = messageRevision(last);
  return Boolean(latest.revision && now && latest.revision.hash === now.hash && latest.revision.swipeId === now.swipeId);
};

describe("68 your move: derivation", () => {
  it("Y1: over 600 generated states the chip equals the precedence table", () => {
    const random = rng(68);
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
    let shown = 0;
    for (let index = 0; index < 600; index += 1) {
      const chat = [player("hello"), reply("first answer")];
      if (random() < 0.3) chat.push(player("again"));
      else if (random() < 0.5) chat.push(reply(pick(["second", "third"]), pick([0, 1])));
      const decided = random() < 0.5 ? chat.length - 1 : Math.max(0, chat.length - 2);
      const decidedRow = random() < 0.8 ? chat[decided] : reply("an older text");
      const decisions = random() < 0.15 ? [] : [
        decision(decided, decidedRow, pick(["member", "silence", "player"] as const), pick(["cp1", "cp2"])),
        ...(random() < 0.3 ? [decision(decided, decidedRow, pick([undefined, "player", "silence"] as const))] : []),
      ];
      const input: TurnInputs = deepFreeze({ enabled: random() < 0.9, generating: random() < 0.2, chat, checkpointId: random() < 0.95 ? "cp1" : null, decisions });
      const turn = deriveTurn(input);
      expect(turn.yours).toBe(expected(input));
      if (turn.yours) shown += 1;
    }
    expect(shown).toBeGreaterThan(20);
  });

  it("Y2: an in-place swipe, an in-place edit, a delete and a new player line each turn the chip off", () => {
    const last = reply("Over to you.");
    const chat = [player("hello"), reply("first"), last];
    const decisions = [decision(2, last, "player")];
    const base = { enabled: true, generating: false, checkpointId: "cp1", decisions };
    expect(deriveTurn({ ...base, chat }).yours).toBe(true);
    const mutations = [
      [player("hello"), reply("first"), { ...last, mes: "Another take.", swipe_id: 1, swipes: [last.mes, "Another take."] }],
      [player("hello"), reply("first"), { ...last, mes: "Over to you, friend." }],
      [player("hello"), reply("first")],
      [...chat, player("I open the door.")],
    ];
    expect(mutations.map((rows) => deriveTurn({ ...base, chat: rows }).yours)).toEqual([false, false, false, false]);
    const fresh = mutations[0];
    expect(deriveTurn({ ...base, chat: fresh, decisions: [...decisions, decision(2, fresh[2], "player")] }).yours).toBe(true);
  });

  it("Y4: a silence, a record without a kind and a generation in flight never show the chip", () => {
    const last = reply("Quiet.");
    const chat = [player("hello"), last];
    expect(deriveTurn({ enabled: true, generating: false, checkpointId: "cp1", chat, decisions: [decision(1, last, "silence")] }).yours).toBe(false);
    expect(deriveTurn({ enabled: true, generating: false, checkpointId: "cp1", chat, decisions: [decision(1, last, undefined)] }).yours).toBe(false);
    expect(deriveTurn({ enabled: true, generating: true, checkpointId: "cp1", chat, decisions: [decision(1, last, "player")] }).yours).toBe(false);
    expect(deriveTurn({ enabled: false, generating: false, checkpointId: "cp1", chat, decisions: [decision(1, last, "player")] }).yours).toBe(false);
  });

  it("Y3: the derivation reads frozen inputs and stores nothing; the source rides along for the author tooltip", () => {
    const last = reply("Your call.");
    const input = deepFreeze({ enabled: true, generating: false, checkpointId: "cp1", chat: [player("hi"), last], decisions: [decision(1, last, "player")] });
    expect(deriveTurn(input)).toEqual({ yours: true, source: "judge" });
    expect(deriveTurn({ ...input, enabled: false })).toEqual({ yours: false, source: null });
  });
});
