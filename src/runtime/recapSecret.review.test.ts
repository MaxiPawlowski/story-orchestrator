import { LINES, OATH, chatFor, playBoundaries } from "../../test/support/recapFixtures";
import { cardSections, currentSection, type RecapView } from "./consequences";
import { buildNarrativeStatus } from "./narrative";
import { derivePipelineStatus } from "./pipeline";
import type { RuntimeExtras } from "./types";

const pipeline = derivePipelineStatus({ settings: { enabled: true, cadence: 3, stabilityLag: 0 }, audits: [], reconciliationEvents: [], scheduler: { queueDepth: 0, inFlight: false, lastError: null } } as never, undefined, null);

const run = () => playBoundaries(OATH, [[[{ q: "oath_state", v: "sworn", player: true }]], [[{ q: "banner_raised", v: true, player: true }]], [[{ q: "storm_broke", v: true }]]], chatFor(LINES.oath[0]));

const extrasWith = (secrets: boolean, recap: RuntimeExtras["recap"]) => ({
  recap,
  memory: {
    entries: secrets ? [{ id: "s1", tier: "facts", text: "The Chapel hides the order's true oath.", messageId: 1 }] : [],
    epistemic: secrets ? [{ id: "e1", subject: "Captain", tag: "hiding", content: "The oath was sworn on a forged relic.", hiddenFrom: "everyone", createdAt: 1 }] : [],
  },
}) as unknown as RuntimeExtras;

const playerOutput = (secrets: boolean): string => {
  const played = run();
  const extras = extrasWith(secrets, { refs: played.refs });
  const view: RecapView = { story: OATH, state: played.engine.serialize(), recap: extras.recap, chat: played.chat };
  const narrative = buildNarrativeStatus({
    storyTitle: OATH.title, checkpointName: "The Field", objective: null, lastTransition: null, openThreads: [], canon: "", tensionLevel: null, pendingCount: 0, pipeline,
    consequences: currentSection(view),
  });
  return JSON.stringify({ narrative: narrative.text, cards: cardSections(view) });
};

describe("v2.8 46 C3: held secrets change nothing the player sees in the recap", () => {
  it("player output is byte-identical with and without held secrets", () => {
    const without = playerOutput(false);
    expect(playerOutput(true)).toBe(without);
    expect(without).toContain("Because you swore it");
    expect(without).not.toContain("forged relic");
  });
});
