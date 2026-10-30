import { agencyForCheckpoint } from "@engine/index";
import type { SkipDueEvent } from "@pacing/skipAhead";
import { isHostGenerating } from "@services/STAPI";
import { chatSettle } from "./chatSettle";
import { resolveFeatures } from "./featureResolve";
import type { ManagerPort } from "./managerWiring";
import { memberSpeaks, playerHasSpoken } from "./npcSpeak";
import { recordCuedLine } from "./npcReplyRewind";
import { getGlobalSettings } from "./settingsStore";
import { SKIP_COPY, skipBlock, skipTeller, skipViewOf, type SkipBlock, type SkipTeller, type SkipView } from "./skipGate";
import type { SkipOutcome } from "./skipRuntime";
import type { SpeechPort } from "./speechWiring";

declare module "./types" {
  interface RuntimeSnapshot {
    skip?: SkipView | null;
  }
}

export interface SkipPortDeps {
  direct: (member: string, text: string) => (() => void) | null;
  speech: SpeechPort;
  outcomePending: () => boolean;
}

export type SkipPort = ReturnType<typeof createSkipPort>;

const dueEvents = (extras: ReturnType<ManagerPort["extras"]>): SkipDueEvent[] => [
  ...(extras.echoes?.events ?? []).map((event) => ({ kind: "echo" as const, due: event.due, open: event.status === "scheduled" })),
  ...(extras.rumors?.events ?? []).map((event) => ({ kind: "rumor" as const, due: event.due, open: !event.landedAt })),
];

export function createSkipPort(port: ManagerPort, deps: SkipPortDeps) {
  let running = false;
  const enabled = () => {
    const loaded = port.loaded();
    return Boolean(loaded) && resolveFeatures(getGlobalSettings(), loaded?.story ?? null, port.extras().overrides).skip.enabled;
  };
  const gate = (generating: boolean): { block: SkipBlock | null; teller: SkipTeller | null } => {
    const loaded = port.loaded();
    const story = loaded?.story ?? null;
    const active = port.engine.activeCheckpoint;
    const teller = story ? skipTeller(story, active, memberSpeaks) : null;
    const block = skipBlock({
      running, committed: port.engine.currentBoundary > 0 && playerHasSpoken(), generating: generating || isHostGenerating() || chatSettle.speaking(),
      outcomePending: deps.outcomePending(), allowedHere: agencyForCheckpoint(story, active?.id).skip !== false, teller,
    });
    return { block, teller };
  };
  return {
    view: (generating = false): SkipView | null => (enabled() ? skipViewOf(gate(generating).block) : null),
    async run(): Promise<SkipOutcome> {
      const loaded = port.loaded();
      if (!loaded) return { ok: false, reason: SKIP_COPY.noStory };
      if (!enabled()) return { ok: false, reason: SKIP_COPY.off };
      const { block, teller } = gate(false);
      if (block || !teller) return { ok: false, reason: SKIP_COPY.blocked[block ?? "no-teller"] };
      running = true;
      port.lifecycle.notify();
      try {
        const { runSkipOnHost } = await import("./skipRuntimeHost");
        const active = port.engine.activeCheckpoint;
        return await runSkipOnHost({
          story: loaded.story, values: port.view.getState()?.blackboard.values ?? {}, boundary: port.engine.currentBoundary, events: dueEvents(port.extras()), teller,
          entry: `${active?.id ?? ""}@skip`,
        }, {
          story: loaded.story, ownership: port.lifecycle.ownership, direct: deps.direct, speech: deps.speech,
          recordCue: (line) => { port.extras().cuedLines = recordCuedLine(port.extras().cuedLines, line); },
          journal: (summary, note) => port.journal("story", summary, note), persist: () => { void port.lifecycle.persist(); },
        });
      } finally {
        running = false;
        port.lifecycle.notify();
      }
    },
  };
}
