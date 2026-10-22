import { readFileSync } from "fs";
import { join } from "path";
import { codexEntryKey, parseStoryOrThrow, type EngineState, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { cueAtKey, normSeenKey } from "@engine/cueSchema";
import type { OfferCandidate, OfferLapse } from "@engine/life/offers";
import { heldSecrets, keptFrom } from "@memory/heldSecrets";
import type { EpistemicEntry } from "@memory/types";
import { createCueRuntime, revisionKey, type CuePortDeps, type OfferRegistry } from "./cueRuntime";
import { namesForRosterId } from "./roster";
import type { RuntimeExtras } from "./types";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/reactive-cues.story.json"), "utf8")) as Record<string, unknown>;
type Row = { name: string; is_user: boolean; mes: string; swipe_id?: number };

interface Harness {
  story: NormalizedStory;
  values: Record<string, PrimitiveValue>;
  boundary: number;
  rows: Row[];
  extras: RuntimeExtras;
  enabled: string[];
  block: string;
  journal: string[];
  secrets: EpistemicEntry[];
  registry: OfferRegistry;
}

const setup = (story: NormalizedStory = parseStoryOrThrow(RAW)) => {
  const h: Harness = {
    story, values: {}, boundary: 4, rows: [{ name: "You", is_user: true, mes: "hello" }], extras: {} as RuntimeExtras, enabled: ["mara", "tom", "bryn", "narrator"],
    block: "", journal: [], secrets: [], registry: { providers: new Map(), lapseListeners: new Map() },
  };
  const names = story.roster.flatMap((member) => namesForRosterId(story, member.id));
  const deps: CuePortDeps = {
    story: () => h.story,
    state: () => ({ boundary: h.boundary, blackboard: { values: h.values } }) as unknown as EngineState,
    lastEntry: () => undefined,
    extras: () => h.extras,
    chatId: () => "chat",
    rows: () => h.rows,
    enabledIds: () => h.enabled,
    enabled: () => true,
    refuses: (text, rosterId) => keptFrom(text, heldSecrets(h.secrets, names), rosterId ? namesForRosterId(h.story, rosterId) : null),
    appliedBlock: () => h.block,
    historyFloor: () => 0,
    persist: () => undefined,
    notify: () => undefined,
    journal: (summary, note) => { h.journal.push(`${summary}: ${note}`); },
  };
  const runtime = createCueRuntime(deps, h.registry);
  const reply = (name: string, mes: string) => { h.rows.push({ name, is_user: false, mes }); return h.rows.length - 1; };
  const player = (mes: string) => { h.rows.push({ name: "You", is_user: true, mes }); return h.rows.length - 1; };
  const turn = (recipient: string, name: string, mes: string, reached = true) => {
    runtime.draft(recipient);
    const lines = runtime.lines(recipient);
    h.block = reached ? lines.join("\n") : "";
    runtime.staged();
    const id = reply(name, mes);
    runtime.settle(true, id);
    return { lines, id };
  };
  return { h, runtime, reply, player, turn };
};

const receipts = (h: Harness) => h.extras.cues?.receipts ?? [];

describe("v2.9 plan 04: the offer channel", () => {
  it("offers one line to the drafted member and writes a receipt bound to its rendered reply", () => {
    const { h, runtime, turn } = setup();
    h.values = { [cueAtKey("mara", "ledger")]: 4 };
    expect(runtime.lines("mara")).toEqual([]);
    runtime.draft("mara");
    expect(runtime.perDraft("mara")).toBe(true);
    expect(runtime.perDraft("tom")).toBe(false);
    expect(runtime.lines("tom")).toEqual([]);
    const { lines, id } = turn("mara", "Mara Voss", "The ledger, then. Good.");
    expect(lines).toEqual(["- If it fits, you may react to: the stolen ledger is back in the guild's hands. React as yourself; the player's actions and feelings are theirs."]);
    expect(receipts(h)).toEqual([expect.objectContaining({ key: "cue:mara:ledger", recipient: "mara", messageId: id, revision: revisionKey(h.rows[id]), boundary: 4, gap: true })]);
    expect(h.journal[0]).toContain("cue offered");
    h.boundary = 5;
    runtime.draft("mara");
    expect(runtime.lines("mara")).toEqual([]);
  });

  it.each([
    ["the line never reached the applied block", (s: ReturnType<typeof setup>) => s.turn("mara", "Mara Voss", "Hm.", false)],
    ["the generation rendered no real reply", (s: ReturnType<typeof setup>) => { s.runtime.draft("mara"); s.h.block = s.runtime.lines("mara").join("\n"); s.runtime.staged(); s.runtime.settle(false, s.reply("Mara Voss", "")); }],
    ["another member answered", (s: ReturnType<typeof setup>) => s.turn("mara", "Tom", "Not me.")],
  ])("writes no receipt when %s", (_name, act) => {
    const s = setup();
    s.h.values = { [cueAtKey("mara", "ledger")]: 4 };
    act(s);
    expect(receipts(s.h)).toEqual([]);
  });

  it("re-offers the same cue on a swipe of the reply and rebinds its receipt to the new swipe", () => {
    const { h, runtime, turn } = setup();
    h.values = { [cueAtKey("mara", "ledger")]: 4 };
    const { id } = turn("mara", "Mara Voss", "First take.");
    const first = receipts(h)[0];
    runtime.opened("swipe");
    runtime.draft("mara");
    expect(runtime.lines("mara")).toHaveLength(1);
    h.block = runtime.lines("mara").join("\n");
    runtime.staged();
    h.rows[id] = { name: "Mara Voss", is_user: false, mes: "Second take.", swipe_id: 1 };
    runtime.settle(true, id);
    expect(first.revision).not.toBe(revisionKey(h.rows[id]));
    expect(receipts(h).map((row) => row.revision)).toEqual([revisionKey(h.rows[id])]);
    runtime.onBoundary();
    expect(receipts(h).map((row) => row.revision)).toEqual([revisionKey(h.rows[id])]);
  });

  it("keeps a continued reply's receipt and offers nothing new to it", () => {
    const { h, runtime, turn } = setup();
    h.values = { [cueAtKey("mara", "ledger")]: 4 };
    const { id } = turn("mara", "Mara Voss", "The ledger");
    runtime.opened("continue");
    runtime.draft("mara");
    expect(runtime.lines("mara")).toEqual([]);
    h.rows[id] = { ...h.rows[id], mes: "The ledger is back, and about time." };
    runtime.settle(true, id);
    expect(receipts(h)).toEqual([expect.objectContaining({ messageId: id, revision: revisionKey(h.rows[id]) })]);
  });

  it("consumes a raised topic once and offers the next raise its next tier", () => {
    const { h, runtime, turn, player } = setup();
    h.values = { trusts_player: true };
    player("Mara, what about the ledger?");
    expect(turn("mara", "Mara Voss", "It lists debts.").lines[0]).toContain("debts the guild never paid");
    runtime.draft("mara");
    expect(runtime.lines("mara")).toEqual([]);
    player("And the accounts, Mara?");
    expect(turn("mara", "Mara Voss", "The magistrate.").lines[0]).toContain("names the magistrate");
    expect(h.extras.cues?.consumed).toHaveLength(2);
  });

  it("records a lapse with its reason when a window ends unoffered, and tells the provider that owns it", () => {
    const { h, runtime } = setup();
    const seen: OfferLapse[] = [];
    const echo: OfferCandidate = {
      key: "echo:e1", defRev: "e", source: { kind: "echo", echoId: "e1", occurrenceId: "o1" }, recipient: "tom", lane: "may", priority: 20, order: 0,
      text: "the bridge you burned is still out", copy: "echo", window: { from: 3, to: 4 }, spend: "once", gap: true,
    };
    h.registry.providers.set("echoes", (ctx) => (ctx.recipient === "tom" ? [echo] : []));
    h.registry.lapseListeners.set("echoes", (lapse) => seen.push(lapse));
    h.values = { [cueAtKey("tom", "ledger")]: 3 };
    h.enabled = ["mara", "bryn"];
    runtime.onBoundary();
    h.boundary = 6;
    runtime.onBoundary();
    expect(h.extras.cues?.lapses.map((lapse) => [lapse.key, lapse.reason])).toEqual([["cue:tom:ledger", "recipient-disabled"], ["echo:e1", "recipient-disabled"]]);
    expect(seen).toEqual([expect.objectContaining({ key: "echo:e1" })]);
    runtime.onBoundary();
    expect(h.extras.cues?.lapses).toHaveLength(2);
    expect(h.journal.filter((row) => row.startsWith("offer lapsed"))).toHaveLength(2);
  });

  it("shows the author the next pick, ties and held candidates", () => {
    const { h, runtime } = setup();
    h.values = { location: "docks", [cueAtKey("tom", "ledger")]: 4 };
    const view = runtime.authorView(true);
    expect(view?.previews.find((preview) => preview.member === "tom")).toEqual(expect.objectContaining({ winner: "cue:tom:ledger", tiedWith: ["cue:tom:river"] }));
    expect(runtime.authorView(false)).toBeNull();
  });
});

describe("v2.9 plan 04 C4: a cue never carries a secret kept from its recipient", () => {
  const hiding = (subject: string, from: string, content: string): EpistemicEntry =>
    ({ id: `h-${subject}`, subject, tag: "hiding", hiddenFrom: from, content, messageId: 1, createdAt: 1 }) as unknown as EpistemicEntry;

  it("drops a cue that restates a secret kept from that member, with no unknown proper noun in it", () => {
    const raw = { ...RAW, roster: (RAW.roster as Array<Record<string, unknown>>).map((member) => (member.id === "tom"
      ? { ...member, cues: [{ id: "paid", kind: "remark", when: { q: "guild_angry", op: "==", v: true }, cue: "the guild paid the thieves to steal the ledger" }] } : member)) };
    const { h, runtime } = setup(parseStoryOrThrow(raw));
    h.values = { guild_angry: true };
    h.secrets = [hiding("Mara", "Tom", "the guild paid the thieves to steal the ledger")];
    runtime.draft("tom");
    expect(runtime.lines("tom")).toEqual([]);
  });

  it("holds a narrator's cue to the player's view even when the narrator knows the secret", () => {
    const raw = { ...RAW, roster: (RAW.roster as Array<Record<string, unknown>>).map((member) => (member.id === "narrator"
      ? { ...member, cues: [{ id: "truth", kind: "remark", when: { q: "guild_angry", op: "==", v: true }, cue: "the guild paid the thieves to steal the ledger" }] } : member)) };
    const { h, runtime } = setup(parseStoryOrThrow(raw));
    h.values = { guild_angry: true };
    h.secrets = [hiding("Mara", "Tom", "the guild paid the thieves to steal the ledger")];
    runtime.draft("narrator");
    expect(runtime.lines("narrator")).toEqual([]);
    h.secrets = [];
    runtime.draft("narrator");
    expect(runtime.lines("narrator")).toHaveLength(1);
  });

  it("holds an echo that landed before a secret was introduced", () => {
    const { h, runtime } = setup();
    const echo: OfferCandidate = {
      key: "echo:e2", defRev: "e", source: { kind: "echo", echoId: "e2", occurrenceId: "o2" }, recipient: "tom", lane: "may", priority: 20, order: 0,
      text: "the magistrate took the guild's silver", copy: "echo", window: { from: 0, to: null }, spend: "once", gap: true,
    };
    h.registry.providers.set("echoes", (ctx) => (ctx.recipient === "tom" ? [echo] : []));
    runtime.draft("tom");
    expect(runtime.lines("tom")).toHaveLength(1);
    h.secrets = [hiding("Mara", "Tom", "the magistrate took the guild's silver")];
    runtime.draft("tom");
    expect(runtime.lines("tom")).toEqual([]);
    expect(runtime.lines("mara")).toEqual([]);
  });

  it("refuses a narrator line that names someone the player has not met", () => {
    const raw = {
      ...RAW,
      codex: { people: [{ id: "magistrate", name: "Magistrate Orel", known_when: { q: "trusts_player", op: "==", v: true }, facts: [] }] },
      roster: (RAW.roster as Array<Record<string, unknown>>).map((member) => (member.id === "narrator"
        ? { ...member, cues: [{ id: "orel", kind: "remark", when: { q: "guild_angry", op: "==", v: true }, cue: "Magistrate Orel is watching the docks" }] } : member)),
    };
    const { h, runtime } = setup(parseStoryOrThrow(raw));
    h.values = { guild_angry: true };
    runtime.draft("narrator");
    expect(runtime.lines("narrator")).toEqual([]);
    h.values = { guild_angry: true, trusts_player: true, [codexEntryKey("people", "magistrate")]: 1 };
    runtime.draft("narrator");
    expect(runtime.lines("narrator")).toHaveLength(1);
  });

  it("offers a norm only to its witnesses", () => {
    const { h, runtime } = setup();
    h.values = { [normSeenKey("steel", "bryn")]: 4 };
    runtime.draft("tom");
    expect(runtime.lines("tom")).toEqual([]);
    runtime.draft("bryn");
    expect(runtime.lines("bryn")[0]).toContain("drew steel");
  });
});
