import { applyArcSignals, capOpenArcs, rollbackArcs } from "./arcs";
import {
  arcDeferred, arcHistoryLines, arcThreadState, injectedThreads, touchesArc, type ArcRead, type ArcWindowMessage,
} from "./arcThreads";
import { renderArcContractSection } from "./contract";
import { parseArcLine } from "./parse";
import type { ArcEntry, ParsedArcSignal } from "./types";

const TOPICS = [
  { arc: "Who stole the silver compass from the lighthouse keeper", mention: "Tell me about the silver compass the keeper lost." },
  { arc: "Whether Mira will forgive Kael for burning the archive", mention: "So, Mira, about Kael and the archive fire." },
  { arc: "The debt the party owes to the river smugglers", mention: "We should settle that debt with the smugglers on the river." },
  { arc: "The meaning of the strange map tattoo on Bel's arm", mention: "Bel, can I see that map tattoo on your arm again?" },
  { arc: "What lies behind the sealed door in the abbey cellar", mention: "Let's go back down to the abbey cellar and that sealed door." },
  { arc: "Why the baron's letters stopped arriving at the inn", mention: "Has anyone heard why the baron's letters stopped coming to the inn?" },
  { arc: "The promise of a duel at dawn with the masked knight", mention: "About the duel with the masked knight at dawn, I'm ready." },
  { arc: "Where the missing caravan of salt merchants went", mention: "Any news of the salt merchants' caravan?" },
  { arc: "The cursed ring that Ana found in the well", mention: "Ana, show me the ring from the well." },
  { arc: "Who poisoned the old mayor at the harvest feast", mention: "I keep thinking about the mayor and that poison at the harvest feast." },
];

const PUT_OFFS = ["Later, okay? Not now.", "Let's leave that for another time.", "Not now, I'm tired.", "Can we talk about that tomorrow?", "Some other time, friend."];
const OTHER = "I order a bowl of stew and sit by the fire.";

const arcOf = (text: string, id = "a1"): ArcEntry => ({ id, text, status: "open", entities: [], openedAt: 0, openedMessageId: 0 });
const message = (messageId: number, text: string, isUser: boolean): ArcWindowMessage => ({ messageId, text, speaker: isUser ? "Rin" : "Mira", isUser });
const readOf = (messages: ArcWindowMessage[]): ArcRead => ({
  chatId: "chat-1", window: { from: messages[0].messageId, to: messages[messages.length - 1].messageId, messages },
});
const deferSig = (text: string, messageId: number, quote: string): ParsedArcSignal => ({ kind: "deferred", text, messageId, quote });
const apply = (arcs: ArcEntry[], signals: ParsedArcSignal[], messages: ArcWindowMessage[], boundary: number) =>
  applyArcSignals(arcs, signals, { boundary, messageId: messages[messages.length - 1].messageId, read: () => readOf(messages), deferrals: true });

describe("v3.0 33 S1: the [deferred] read line", () => {
  it("parses arc, message and the player's quote", () => {
    expect(parseArcLine("[deferred] The debt to the smugglers | m=12 | \"Later, okay?\"")).toEqual({
      kind: "deferred", text: "The debt to the smugglers", messageId: 12, quote: "Later, okay?",
    });
    expect(parseArcLine("[deferred] The debt to the smugglers | 12 | “Not now.”")).toMatchObject({ messageId: 12, quote: "Not now." });
  });

  it("keeps a line without a span so the guard can refuse it by name", () => {
    expect(parseArcLine("[deferred] The debt to the smugglers")).toEqual({ kind: "deferred", text: "The debt to the smugglers" });
    expect(parseArcLine("[deferred]   ")).toBeNull();
  });

  it("asks for deferrals only when existing arcs are listed", () => {
    expect(renderArcContractSection([])).not.toContain("[deferred]");
    expect(renderArcContractSection(["The debt to the smugglers"])).toContain("[deferred] <an existing open arc the player put off>");
  });
});

describe("v3.0 33 S2: a deferral needs the player's own words", () => {
  const arc = arcOf(TOPICS[2].arc);
  const messages = [message(10, "We owe them, but later, okay? Not now.", true), message(11, "Later, then. The river waits.", false)];

  it("accepts a quote found word for word in a player message and stores the span", () => {
    const result = apply([arc], [deferSig(TOPICS[2].arc, 10, "later, okay? Not now.")], messages, 4);
    expect(result.refused).toEqual([]);
    expect(arcThreadState(result.arcs[0])).toBe("deferred");
    expect(result.arcs[0].history?.[0]).toMatchObject({ kind: "deferred", boundary: 4, messageId: 11, quote: "later, okay? Not now.", span: { messageId: 10, isUser: true, span: [17, 38] } });
  });

  it("refuses a cast member's later, a paraphrase, a missing span and a message outside the window", () => {
    const refused = (signal: ParsedArcSignal) => apply([arc], [signal], messages, 4).refused.map((entry) => entry.reason);
    expect(refused(deferSig(TOPICS[2].arc, 11, "Later, then."))).toEqual(["not the player's own words"]);
    expect(refused(deferSig(TOPICS[2].arc, 10, "maybe some other day"))).toEqual(["quote is not word for word in that message"]);
    expect(refused({ kind: "deferred", text: TOPICS[2].arc })).toEqual(["no player span"]);
    expect(refused(deferSig(TOPICS[2].arc, 3, "later"))).toEqual(["message is not in the read's window"]);
    expect(refused(deferSig("A completely unrelated mystery about dragons", 10, "Not now."))).toEqual(["matches no open arc"]);
  });

  it("refuses everything when the feature is off or there is no window", () => {
    const off = applyArcSignals([arc], [deferSig(TOPICS[2].arc, 10, "Not now.")], { boundary: 4, messageId: 11, read: () => readOf(messages), deferrals: false });
    expect(off.refused.map((entry) => entry.reason)).toEqual(["put-off threads are switched off"]);
    expect(off.arcs[0].history).toBeUndefined();
    expect(applyArcSignals([arc], [deferSig(TOPICS[2].arc, 10, "Not now.")], { boundary: 4, messageId: 11 }).refused[0].reason).toBe("no read window");
  });
});

describe("v3.0 33 S3: a put-off thread comes back when the player raises it", () => {
  it("reopens on a later player line touching the arc, never on the deferral itself or a cast line", () => {
    const deferred = apply([arcOf(TOPICS[0].arc)], [deferSig(TOPICS[0].arc, 2, "Later, okay?")], [message(2, "The compass? Later, okay?", true)], 1).arcs;
    const castOnly = apply(deferred, [], [message(3, "The silver compass was stolen from the keeper, you know.", false)], 2);
    expect(castOnly.reopened).toEqual([]);
    const other = apply(deferred, [], [message(4, OTHER, true)], 3);
    expect(other.reopened).toEqual([]);
    const back = apply(deferred, [], [message(5, TOPICS[0].mention, true)], 4);
    expect(back.reopened).toHaveLength(1);
    expect(arcThreadState(back.arcs[0])).toBe("open");
    expect(back.arcs[0].history?.map((event) => event.kind)).toEqual(["deferred", "reopened"]);
  });

  it("refuses a second deferral of a put-off thread and one older than its last change", () => {
    const first = apply([arcOf(TOPICS[1].arc)], [deferSig(TOPICS[1].arc, 6, "Not now.")], [message(6, "Not now.", true)], 1).arcs;
    expect(apply(first, [deferSig(TOPICS[1].arc, 7, "Later.")], [message(7, "Later.", true)], 2).refused[0].reason).toBe("already put off");
    const reopened = apply(first, [], [message(8, TOPICS[1].mention, true)], 3).arcs;
    expect(apply(reopened, [deferSig(TOPICS[1].arc, 6, "Not now.")], [message(6, "Not now.", true), message(8, TOPICS[1].mention, true)], 4).refused[0].reason)
      .toBe("older than the thread's last change");
  });

  it("matches the thread by its content words, not by the length of the message", () => {
    expect(touchesArc(arcOf(TOPICS[3].arc), `${TOPICS[3].mention} ${"and then a long ramble ".repeat(20)}`)).toBe(true);
    expect(touchesArc(arcOf(TOPICS[3].arc), "Bel smiles.")).toBe(false);
  });

  it("leaves the put-off thread out of the prompt only when that control is on", () => {
    const arcs = apply([arcOf(TOPICS[4].arc, "a"), arcOf(TOPICS[5].arc, "b")], [deferSig(TOPICS[4].arc, 1, "Later.")], [message(1, "Later.", true)], 1).arcs;
    expect(injectedThreads(arcs, { deferredOutOfPrompt: false }).map((arc) => arc.id)).toEqual(["a", "b"]);
    expect(injectedThreads(arcs, {}).map((arc) => arc.id)).toEqual(["a", "b"]);
    expect(injectedThreads(arcs, { deferredOutOfPrompt: true }).map((arc) => arc.id)).toEqual(["b"]);
  });

  it("keeps a put-off thread an open arc for the cap, resolve and the history lines", () => {
    const arcs = apply([arcOf(TOPICS[6].arc)], [deferSig(TOPICS[6].arc, 1, "Some other time.")], [message(1, "Some other time.", true)], 2).arcs;
    expect(capOpenArcs(arcs, 1)).toEqual(arcs);
    const resolved = applyArcSignals(arcs, [{ kind: "resolved", text: TOPICS[6].arc }], { boundary: 3, messageId: 4 }).arcs;
    expect(arcThreadState(resolved[0])).toBe("resolved");
    expect(arcHistoryLines(arcs[0])).toEqual(["Put off at boundary 2 (message 1): \"Some other time.\""]);
  });
});

describe("v3.0 33 rollback: events at or after the message go, status re-derives", () => {
  it("a rolled-back reopen restores the deferral, a rolled-back deferral restores open", () => {
    const deferred = apply([arcOf(TOPICS[7].arc)], [deferSig(TOPICS[7].arc, 2, "Later.")], [message(2, "Later.", true), message(3, "Fine.", false)], 1).arcs;
    const reopened = apply(deferred, [], [message(4, TOPICS[7].mention, true), message(5, "The caravan?", false)], 2).arcs;
    expect(arcDeferred(rollbackArcs(reopened, 4, 1)[0])).toBe(true);
    expect(rollbackArcs(reopened, 3, 0)[0].history).toBeUndefined();
    expect(rollbackArcs(reopened, 6, 2)).toEqual(reopened);
  });
});

describe("v3.0 33 floor D: 50 synthetic put-off sequences", () => {
  const sequence = (index: number) => {
    const topic = TOPICS[index % TOPICS.length];
    const putOff = PUT_OFFS[index % PUT_OFFS.length];
    const base = index * 10;
    const deferWindow = [message(base, `Hmm. ${putOff}`, true), message(base + 1, "Later, then. As you wish.", false)];
    const signals = [deferSig(topic.arc, base, putOff), deferSig(topic.arc, base + 1, "Later, then.")];
    const mentions = index % 2 === 0;
    const laterWindow = [message(base + 2, mentions ? topic.mention : OTHER, true), message(base + 3, `${topic.arc}? Later.`, false)];
    return { topic, deferWindow, signals, laterWindow, mentions };
  };

  const run = (index: number) => {
    const { topic, deferWindow, signals, laterWindow, mentions } = sequence(index);
    const first = apply([arcOf(topic.arc, `a${index}`), arcOf("An unrelated feud between two fishing families", `b${index}`)], signals, deferWindow, 1);
    const second = apply(first.arcs, [], laterWindow, 2);
    return { first, second, mentions };
  };

  const runs = Array.from({ length: 50 }, (_, index) => run(index));

  it("defers on the player's span 50/50 and never on the cast member's later", () => {
    expect(runs.filter(({ first }) => first.deferred.length === 1 && first.deferred[0].history?.[0].span.isUser).length).toBe(50);
    expect(runs.filter(({ first }) => first.refused.some((entry) => entry.reason === "not the player's own words")).length).toBe(50);
    expect(runs.flatMap(({ first }) => first.deferred).filter((arc) => arc.history?.some((event) => !event.span.isUser)).length).toBe(0);
  });

  it("reopens on the player's mention 25/25 and stays put off otherwise", () => {
    const mentioned = runs.filter(({ mentions }) => mentions);
    expect(mentioned.filter(({ second }) => second.reopened.length === 1).length).toBe(25);
    expect(runs.filter(({ mentions }) => !mentions).filter(({ second }) => second.reopened.length === 0 && second.arcs.some(arcDeferred)).length).toBe(25);
    expect(runs.every(({ second }) => !second.arcs.find((arc) => arc.id.startsWith("b"))?.history)).toBe(true);
  });

  it("rollback cuts across defer and reopen cycles equal replay (0 divergence)", () => {
    let divergences = 0;
    for (let index = 0; index < 50; index += 1) {
      const { topic } = sequence(index);
      const windows = [0, 1, 2, 3].map((cycle) => {
        const base = cycle * 4;
        return cycle % 2 === 0
          ? { signals: [deferSig(topic.arc, base, "Not now.")], messages: [message(base, "Not now.", true), message(base + 1, "Hm.", false)] }
          : { signals: [], messages: [message(base, topic.mention, true), message(base + 1, "Yes?", false)] };
      });
      const step = (arcs: ArcEntry[], window: (typeof windows)[number], boundary: number) => apply(arcs, window.signals, window.messages, boundary).arcs;
      const full = windows.reduce((arcs, window, at) => step(arcs, window, at + 1), [arcOf(topic.arc)]);
      for (let cut = 1; cut <= 16; cut += 1) {
        const boundary = windows.filter((window) => window.messages[window.messages.length - 1].messageId < cut).length;
        const replayed = windows.slice(0, boundary).reduce((arcs, window, at) => step(arcs, window, at + 1), [arcOf(topic.arc)]);
        if (JSON.stringify(rollbackArcs(full, cut, boundary)) !== JSON.stringify(replayed)) divergences += 1;
      }
    }
    expect(divergences).toBe(0);
  });
});
