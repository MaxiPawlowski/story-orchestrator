import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, moodKey, parseStoryOrThrow, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { loadGameLayer } from "@engine/validate/gameLayer";
import { EPISTEMIC_INJECTION_KEY } from "@constants/defaults";
import type { EpistemicEntry } from "@memory/index";
import { MemoryInjector } from "./memoryInjector";
import { createDeliveryPort, deliveryKit, hasDeliverySheet, loadDelivery, memberRepetitionRows, type DeliverySwitches } from "./deliveryPort";
import type { MemoryRuntimeState } from "./types";
import type { InjectorHosts } from "./hostPorts";
import { playedProjection, projectionText, startProjection } from "./playerProjection";

const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), `test/fixtures/${name}`), "utf8")) as Record<string, unknown> & { roster: Array<Record<string, unknown>> };
const FERRY = parseStoryOrThrow(read("delivery.story.json"));
const CAST = ["Tamsin", "Orrin", "River Narrator"];
const TAMSIN_NOTE = "Talks in river terms";
const ORRIN_NOTE = "full of qualifications";

const reply = (name: string, mes: string) => ({ name, mes, is_user: false, is_system: false });

const hiding = (content: string): EpistemicEntry => ({
  id: "e1", subject: "Orrin", tag: "hiding", hiddenFrom: "Tamsin", content, createdAt: 1, messageId: 1,
  provenance: { source: "extractor", messageId: 1, boundary: 1, pass: "epistemic", validity: "live" },
} as unknown as EpistemicEntry);

interface HarnessOptions {
  story?: NormalizedStory;
  capable?: boolean;
  epistemic?: EpistemicEntry[];
  switches?: DeliverySwitches;
  values?: () => Record<string, PrimitiveValue>;
}

function harness(options: HarnessOptions = {}) {
  const blocks = new Map<string, string>();
  const rows: unknown[] = [];
  let story = options.story ?? FERRY;
  const capable = options.capable ?? false;
  const switches = options.switches ?? { enabled: true, repetition: true };
  const values = options.values ?? (() => ({}));
  const hosts = {
    prompt: { setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); }, clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); } },
    roster: { getActiveGroup: () => ({ id: "g", members: [], disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => rows, systemUserName: "SillyTavern System" },
    chat: { chatRows: () => rows, lastMessageText: () => "", chatWindow: () => ({ messages: [] }) },
    injection: { getCharacterNameById: (index: number) => CAST[index], readInjectedPromptBlocks: () => [] },
  } as unknown as InjectorHosts;
  const budgets = { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 };
  const memory = {
    settings: { enabled: true, epistemicLedgerCapable: capable, innerBeat: false, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: budgets },
    entries: [], epistemic: options.epistemic ?? [], ledger: [], arcs: [], derived: [], pinnedOverflow: 0,
  } as unknown as MemoryRuntimeState;
  const injector = new MemoryInjector({
    getStory: () => story, getState: () => ({ boundary: 3, activeCheckpointId: "start", blackboard: { values: values(), versions: {} } }) as never,
    memory: () => memory, enabled: () => true, capable: () => capable, ledgerBindings: () => [], setPinnedOverflow: () => undefined, beatFor: () => "", hosts: () => hosts,
  });
  const port = createDeliveryPort({ story: () => story, values, rows: () => rows, switches: () => switches, refresh: () => injector.update() });
  injector.addPrivateSource((rosterId) => port.lines(rosterId), { active: () => port.active(), perDraft: (rosterId) => port.delivers(rosterId) });
  injector.update();
  return {
    rows, port, injector,
    resting: () => blocks.get(EPISTEMIC_INJECTION_KEY) ?? "",
    draft: (name: string) => { injector.onMemberDrafted(CAST.indexOf(name)); return blocks.get(EPISTEMIC_INJECTION_KEY) ?? ""; },
    shared: () => [...Object.values(injector.blocks()), injector.ledgerBlock()].join("\n"),
    swap: (next: NormalizedStory) => { story = next; injector.update(); },
  };
}

beforeAll(async () => {
  await loadGameLayer();
  await loadDelivery();
});

describe("v2.9 plan 02 S2: the delivery line reaches the drafted member's private block", () => {
  it("stages a sheet-only story: no drive, motive, life, faction, carry or narrated quality, knowledge tracking off, no inner beat", () => {
    const run = harness();
    expect(run.resting()).toBe("");
    expect(run.draft("Tamsin")).toContain(`How you speak (wording only; it never changes what you know, want or do): Short sentences. ${TAMSIN_NOTE}.`);
    expect(run.draft("Orrin")).toContain(ORRIN_NOTE);
  });

  it("never puts one member's sheet in another member's block, the resting block or a shared tier (planted cases)", () => {
    const run = harness();
    const tamsin = run.draft("Tamsin");
    const orrin = run.draft("Orrin");
    const narrator = run.draft("River Narrator");
    const planted: Array<[string, string]> = [[orrin, TAMSIN_NOTE], [orrin, "mind the rope"], [narrator, TAMSIN_NOTE], [narrator, ORRIN_NOTE], [tamsin, ORRIN_NOTE], [tamsin, "strictly speaking"]];
    expect(planted.filter(([block, text]) => block.includes(text))).toEqual([]);
    run.injector.releaseDraft();
    run.injector.update();
    expect([run.resting(), run.shared()].filter((text) => text.includes(TAMSIN_NOTE) || text.includes(ORRIN_NOTE))).toEqual([]);
  });

  it("is off with the feature off, and for a member whose sheet is switched off", () => {
    const off = harness({ switches: { enabled: false, repetition: true } });
    expect(off.draft("Tamsin")).not.toContain("How you speak");
    expect(hasDeliverySheet(FERRY, { enabled: false, repetition: true })).toBe(false);
    const story = { ...FERRY, roster: FERRY.roster.map((member) => (member.id === "tamsin" ? { ...member, polish: { ...member.polish, enabled: false } } : member)) };
    const run = harness({ story });
    expect(run.draft("Tamsin")).not.toContain("How you speak");
    expect(run.draft("Orrin")).toContain(ORRIN_NOTE);
  });

  it("drops a sheet line that restates a secret kept from the member, including one held after the sheet was written", () => {
    const secret = "Orrin skims the tolls for the smugglers";
    const restating = { ...FERRY, roster: FERRY.roster.map((member) => (member.id === "tamsin" ? { ...member, polish: { notes: `Mutters that ${secret}.` } } : member)) };
    expect(harness({ story: restating, capable: true }).draft("Tamsin")).toContain("smugglers");
    const run = harness({ story: restating, capable: true, epistemic: [hiding("he skims the tolls for the smugglers")] });
    expect(run.draft("Tamsin")).not.toContain("smugglers");
  });

  it("takes an updated sheet at the next draft, with no residue of the old one", () => {
    const run = harness();
    expect(run.draft("Tamsin")).toContain(TAMSIN_NOTE);
    const next = parseStoryOrThrow({ ...read("delivery.story.json"), roster: read("delivery.story.json").roster.map((member) => (member.id === "tamsin" ? { ...member, polish: { notes: "Now she rambles about weather." } } : member)) });
    run.swap(next);
    const after = run.draft("Tamsin");
    expect(after).toContain("Now she rambles about weather.");
    expect(after).not.toContain(TAMSIN_NOTE);
    expect(after).not.toContain("mind the rope");
  });

  it("counts a draft that arrives before the chunk has loaded", () => {
    const port = createDeliveryPort({ story: () => FERRY, values: () => ({}), rows: () => [], switches: () => ({ enabled: true, repetition: true }), refresh: () => undefined });
    expect(deliveryKit()).not.toBeNull();
    expect(port.lines("tamsin").length).toBeGreaterThan(0);
    expect(port.earlyDrafts()).toBe(0);
  });
});

describe("v2.9 plan 02 S3: repetition is recomputed for each member of a group round", () => {
  it("A's reply adds a hot phrase: B's block drafted next and A's next block each reflect their own window", () => {
    const run = harness();
    run.rows.push(reply("Tamsin", "She hauls the black rope over the rail."), reply("Orrin", "The ledger, strictly speaking, is open."));
    run.rows.push(reply("Tamsin", "She hauls the black rope over the rail again."));
    expect(run.draft("Tamsin")).not.toContain("Lately");
    run.rows.push(reply("Tamsin", "She hauls the black rope over the rail once more."));
    const orrin = run.draft("Orrin");
    expect(orrin).not.toContain("Lately");
    expect(orrin).not.toContain("black rope");
    const tamsin = run.draft("Tamsin");
    expect(tamsin).toContain("Lately you keep using: \"she hauls the black rope over the rail\"");
    run.rows.pop();
    expect(run.draft("Tamsin")).not.toContain("Lately");
  });

  it("shows the per-member readout beside the pooled one", () => {
    const rows = [reply("Tamsin", "She smirks."), reply("Orrin", "Hm."), reply("Tamsin", "She smirks again.")];
    expect(memberRepetitionRows(FERRY, rows)).toEqual([{ id: "tamsin", name: "Tamsin", replies: 2, phrases: ["smirks"] }]);
  });
});

describe("v2.9 plan 02 S4: mood variants follow the effective mood, and a rollback restores the earlier one", () => {
  const MOOD = parseStoryOrThrow(read("delivery-mood.story.json"));
  const turn = (engine: StoryEngine, message: number, deltas: Record<string, PrimitiveValue>) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: message - 1, to: message }, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  };
  const fresh = () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(MOOD);
    return engine;
  };

  it("renders the baseline line, the read mood's line, and the baseline again after the mood-changing reply is rolled back", () => {
    const engine = fresh();
    const run = harness({ story: MOOD, values: () => engine.serialize().blackboard.values });
    turn(engine, 2, {});
    expect(run.draft("Tamsin")).toContain("Right now (calm): Slow and dry");
    turn(engine, 4, { [moodKey("tamsin")]: "angry" });
    expect(run.draft("Tamsin")).toContain("Right now (angry): Bitten-off words");
    expect(engine.shouldRollbackFromMessage(4)).toBe(true);
    expect(engine.rollbackTo(engine.boundaryBeforeMessage(4) as number).ok).toBe(true);
    const rolled = run.draft("Tamsin");
    expect(rolled).toContain("Right now (calm)");
    const replay = fresh();
    turn(replay, 2, {});
    const replayed = harness({ story: MOOD, values: () => replay.serialize().blackboard.values }).draft("Tamsin");
    expect(rolled).toBe(replayed);
  });
});

describe("v2.9 plan 02: player surfaces are identical with and without sheets", () => {
  it("the Ask player projection and start projection never read a sheet", () => {
    const bare = { ...FERRY, roster: FERRY.roster.map(({ polish: _polish, ...member }) => member) };
    const input = (story: NormalizedStory) => ({
      story, narrative: { title: "The Ferry Crossing", sections: [] } as never, visitedPath: ["start"], activeCheckpointId: "start", cast: CAST,
      chat: [reply("Tamsin", "She smirks."), reply("Tamsin", "She smirks again.")], playerName: "Wren",
    });
    expect(projectionText(playedProjection(input(FERRY)))).toBe(projectionText(playedProjection(input(bare))));
    expect(JSON.stringify(startProjection(FERRY, "Wren", CAST))).toBe(JSON.stringify(startProjection(bare, "Wren", CAST)));
  });
});
