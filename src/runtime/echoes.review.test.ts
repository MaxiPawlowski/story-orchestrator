import { readFileSync } from "fs";
import { join } from "path";
import { codexEntryKey, parseStoryOrThrow, type BoundaryLogEntry, type BoundaryResult, type EngineState, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { cueAtKey } from "@engine/cueSchema";
import { ECHO_HEADER, rollbackCues } from "@engine/life/offers";
import { rollbackEchoes } from "@engine/life/echoes";
import { heldSecrets, keptFrom } from "@memory/heldSecrets";
import type { EpistemicEntry } from "@memory/types";
import { createCueRuntime, type CuePortDeps, type OfferRegistry } from "./cueRuntime";
import { createEchoRuntime } from "./echoRuntime";
import { namesForRosterId } from "./roster";
import type { RuntimeExtras } from "./types";
import { entryOf } from "../../test/support/echoSim";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/reactive-cues.story.json"), "utf8")) as Record<string, unknown>;
const is = (q: string, v: PrimitiveValue = true) => ({ q, op: "==", v });
const ECHO = { id: "ledger-back", after: { transition: "start->docks" }, delay: { boundaries: [1, 1] }, to: "mara", cue: "the harbour still talks about the docks crossing", hold: 2 };
type Row = { name: string; is_user: boolean; mes: string };

const hiding = (subject: string, from: string, content: string): EpistemicEntry =>
  ({ id: `h-${subject}`, subject, tag: "hiding", hiddenFrom: from, content, messageId: 1, createdAt: 1 }) as unknown as EpistemicEntry;

const setup = (list: Array<Record<string, unknown>> = [ECHO], patch: Record<string, unknown> = {}) => {
  const story: NormalizedStory = parseStoryOrThrow({ ...RAW, ...patch, echoes: list });
  const h = {
    values: {} as Record<string, PrimitiveValue>, boundary: 0, rows: [{ name: "You", is_user: true, mes: "hello" }] as Row[], extras: {} as RuntimeExtras,
    enabled: ["mara", "tom", "bryn", "narrator"], block: "", journal: [] as string[], secrets: [] as EpistemicEntry[], log: [] as BoundaryLogEntry[], on: true,
  };
  const names = story.roster.flatMap((member) => namesForRosterId(story, member.id));
  const refuses = (text: string, rosterId: string | null) => keptFrom(text, heldSecrets(h.secrets, names), rosterId ? namesForRosterId(story, rosterId) : null);
  const registry: OfferRegistry = { providers: new Map(), lapseListeners: new Map(), relevance: new Map() };
  const echoes = createEchoRuntime({
    story: () => story, storyId: () => "lab", log: () => h.log, values: () => h.values, extras: () => h.extras, chatId: () => "chat", enabledIds: () => h.enabled,
    enabled: () => h.on, refuses, receipts: () => h.extras.cues?.receipts ?? [], historyFloor: () => 0, persist: () => undefined, notify: () => undefined,
    journal: (summary, note) => { h.journal.push(`${summary}: ${note}`); },
  });
  registry.providers.set("echoes", echoes.provider);
  registry.relevance?.set("echoes", () => echoes.relevant());
  registry.lapseListeners.set("echoes", (lapse) => echoes.onLapse(lapse));
  const deps: CuePortDeps = {
    story: () => story, state: () => ({ boundary: h.boundary, blackboard: { values: h.values } }) as unknown as EngineState, lastEntry: () => h.log.at(-1),
    extras: () => h.extras, chatId: () => "chat", rows: () => h.rows, enabledIds: () => h.enabled, enabled: () => true, refuses, appliedBlock: () => h.block,
    historyFloor: () => 0, persist: () => undefined, notify: () => undefined, journal: (summary, note) => { h.journal.push(`${summary}: ${note}`); },
  };
  const cues = createCueRuntime(deps, registry);
  const commit = (set: Record<string, PrimitiveValue> = {}, fire = false) => {
    const before = h.values;
    h.values = { ...h.values, ...set };
    h.boundary += 1;
    h.log.push(entryOf(story, h.boundary, before, h.values, fire));
    h.rows.push({ name: "You", is_user: true, mes: `turn ${h.boundary}` }, { name: "Tom", is_user: false, mes: "..." });
    cues.onBoundary();
    echoes.onBoundary({ boundary: h.boundary, context: { lastMessageId: h.boundary * 2 } } as unknown as BoundaryResult);
  };
  const reply = (recipient: string, name: string, reached = true) => {
    cues.draft(recipient);
    const lines = cues.lines(recipient);
    h.block = reached ? lines.join("\n") : "";
    cues.staged();
    h.rows.push({ name, is_user: false, mes: "A reply." });
    cues.settle(true, h.rows.length - 1);
    return lines;
  };
  return { story, h, echoes, cues, commit, reply };
};

const event = (h: { extras: RuntimeExtras }, id = "ledger-back") => h.extras.echoes?.events.find((row) => row.echoId === id);

describe("v2.9 07 S3: an echo reaches its recipient only through plan 04's offer channel", () => {
  it("lands, is offered on the recipient's rendered reply, and the author sees it offered", () => {
    const { h, echoes, cues, commit, reply } = setup();
    commit({ location: "docks" }, true);
    expect(event(h)?.status).toBe("scheduled");
    cues.draft("mara");
    expect(cues.lines("mara")).toEqual([]);
    commit();
    expect(event(h)).toEqual(expect.objectContaining({ status: "landed", offerId: `echo:${event(h)?.occurrenceId}` }));
    expect(h.journal.some((row) => row.startsWith("1 echo(es) landed to channel"))).toBe(true);
    expect(reply("tom", "Tom").join(" ")).not.toContain("docks crossing");
    const lines = reply("mara", "Mara Voss");
    expect(lines).toEqual([`${ECHO_HEADER}\n- the harbour still talks about the docks crossing`]);
    expect(h.extras.cues?.receipts.filter((row) => row.source.kind === "echo")).toEqual([expect.objectContaining({ key: event(h)?.offerId, defRev: event(h)?.revision, recipient: "mara", source: expect.objectContaining({ kind: "echo" }) })]);
    expect(echoes.authorView(true)?.rows).toEqual([expect.objectContaining({ echoId: "ledger-back", state: "offered" })]);
    expect(echoes.authorView(false)).toBeNull();
    expect(reply("mara", "Mara Voss")).toEqual([]);
  });

  it("does not count an offer whose line never reached the block, and lapses it when its hold ends", () => {
    const { h, echoes, commit, reply } = setup();
    commit({ location: "docks" }, true);
    commit();
    expect(reply("mara", "Mara Voss", false)).toHaveLength(1);
    expect(h.extras.cues?.receipts ?? []).toEqual([]);
    commit();
    commit();
    expect(event(h)?.status).toBe("lapsed");
    expect(h.extras.cues?.lapses).toEqual([expect.objectContaining({ key: event(h)?.offerId, reason: "window-ended" })]);
    expect(echoes.authorView(true)?.rows[0].state).toBe("lapsed");
    expect(h.journal.some((row) => row.startsWith("echo lapsed"))).toBe(true);
  });

  it("pins the competition: a must cue, then a raised topic, then the echo (echo-vs-must-vs-topic)", () => {
    const { h, commit, reply, cues } = setup([{ ...ECHO, hold: 4 }]);
    commit({ location: "docks" }, true);
    commit({ guild_angry: true });
    expect(reply("mara", "Mara Voss")[0]).toContain("you mean to bring this up: the guild is hunting");
    expect(event(h)?.status).toBe("landed");
    h.values = { ...h.values, guild_angry: false };
    h.rows.push({ name: "You", is_user: true, mes: "Mara, what about the ledger?" });
    expect(reply("mara", "Mara Voss")[0]).toContain("The player asked you about this directly");
    cues.draft("mara");
    expect(cues.lines("mara")[0]).toContain("- the harbour still talks");
  });

  it("turned off, schedules nothing and offers nothing, and stories without echoes do not wake the channel", () => {
    const off = setup();
    off.h.on = false;
    off.commit({ location: "docks" }, true);
    off.commit();
    expect(off.h.extras.echoes).toBeUndefined();
    expect(off.echoes.relevant()).toBe(false);
    off.cues.draft("mara");
    expect(off.cues.lines("mara")).toEqual([]);
    const none = setup([]);
    expect(none.echoes.relevant()).toBe(false);
  });

  it("rolls back with plan 04's slice: a deleted reply takes back the landing and the offer, and replay lands it again", () => {
    const { h, commit, reply } = setup();
    commit({ location: "docks" }, true);
    commit();
    reply("mara", "Mara Voss");
    const landedAt = event(h)?.landedAt;
    h.extras.echoes = rollbackEchoes(h.extras.echoes!, landedAt!.messageId, 1);
    h.extras.cues = rollbackCues(h.extras.cues!, landedAt!.messageId, 1);
    h.log = h.log.slice(0, 1);
    h.boundary = 1;
    expect(event(h)?.status).toBe("scheduled");
    expect(h.extras.cues?.receipts).toEqual([]);
    commit();
    expect(event(h)?.landedAt?.boundary).toBe(2);
  });
});

describe("v2.9 07 privacy: a cue never reaches a block that is kept from its secret", () => {
  it("holds a member echo that restates a secret with no unknown proper noun", () => {
    const { h, commit, cues } = setup([{ ...ECHO, cue: "the guild paid the thieves to steal the ledger", expires: { boundaries: 1 } }]);
    h.secrets = [hiding("Tom", "Mara Voss", "the guild paid the thieves to steal the ledger")];
    commit({ location: "docks" }, true);
    commit();
    expect(event(h)?.status).toBe("scheduled");
    cues.draft("mara");
    expect(cues.lines("mara")).toEqual([]);
    commit();
    commit();
    expect(event(h)?.status).toBe("expired");
  });

  it("holds a narrator echo to the player's view although the narrator knows the secret", () => {
    const { h, commit, echoes } = setup([{ ...ECHO, to: "narrator", cue: "the guild paid the thieves to steal the ledger" }]);
    h.secrets = [hiding("Tom", "Mara Voss", "the guild paid the thieves to steal the ledger")];
    commit({ location: "docks" }, true);
    commit();
    expect(event(h)?.status).toBe("scheduled");
    expect(echoes.authorView(true)?.rows[0]).toEqual(expect.objectContaining({ state: "waiting", detail: expect.stringContaining("secret") }));
    h.secrets = [];
    commit();
    expect(event(h)?.status).toBe("landed");
  });

  it("holds an echo when a secret is introduced after it landed and before it renders", () => {
    const { h, commit, cues } = setup([{ ...ECHO, cue: "the guild paid the thieves to steal the ledger" }]);
    commit({ location: "docks" }, true);
    commit();
    expect(event(h)?.status).toBe("landed");
    h.secrets = [hiding("Tom", "Mara Voss", "the guild paid the thieves to steal the ledger")];
    cues.draft("mara");
    expect(cues.lines("mara")).toEqual([]);
    expect(cues.lines("tom")).toEqual([]);
  });

  it("holds a narrator echo naming someone the player has not met", () => {
    const codex = { people: [{ id: "magistrate", name: "Magistrate Orel", known_when: is("trusts_player"), facts: [] }] };
    const { h, commit, echoes } = setup([{ ...ECHO, to: "narrator", cue: "Magistrate Orel watched the docks crossing" }], { codex });
    commit({ location: "docks" }, true);
    commit();
    expect(event(h)?.status).toBe("scheduled");
    expect(echoes.authorView(true)?.rows[0]).toEqual(expect.objectContaining({ state: "waiting", detail: expect.stringContaining("has not met") }));
    commit({ trusts_player: true, [codexEntryKey("people", "magistrate")]: 3 });
    expect(event(h)?.status).toBe("landed");
  });

  it("never offers an echo to anyone but its recipient", () => {
    const { h, commit, cues } = setup();
    commit({ location: "docks", [cueAtKey("tom", "ledger")]: 0 }, true);
    commit();
    ["tom", "bryn", "narrator"].forEach((member) => {
      cues.draft(member);
      expect(cues.lines(member).join("\n")).not.toContain("docks crossing");
    });
    expect(event(h)?.recipient).toBe("mara");
  });
});
