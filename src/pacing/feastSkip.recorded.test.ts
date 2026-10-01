import * as recorded from "../../test/fixtures/t1-6-feast-skip.payload.json";
import { NO_SKIP_CLAUSE, agencyFor, type Checkpoint } from "@engine/index";
import { composeGuidanceBlock } from "./guidance";
import { getSteeringHint } from "./steering";

const PLAYER = "Max Nightriver";
const named = (text: string) => text.replaceAll("{{user}}", PLAYER).replaceAll("{{story_player_name}}", PLAYER);
const checkpoint = recorded.checkpoint as unknown as Checkpoint;
const policy = agencyFor(checkpoint);
const SMOOTHED_AT_48 = 0.5258743489600097;
const STIRRING = 0.25;

describe("T1-6: after two quiet turns at the feast the narrator skipped to dawn and moved the party (msg 49, payload row 198)", () => {
  it("control: the recorded reply skipped the night and moved the party on its own", () => {
    expect(recorded.lastUserLine).toBe("I keep quiet and watch the hall.");
    expect(recorded.reply49).toMatch(/The feast proceeds for an hour/);
    expect(recorded.reply49).toMatch(/the party does so with her/);
  });

  it("the recorded pacing block is today's hold hint without the stay-in-the-moment clause", () => {
    const hint = getSteeringHint(SMOOTHED_AT_48, STIRRING, undefined, policy);
    expect(hint?.direction).toBe("hold");
    expect(named(hint?.text ?? "").replace(` ${named(NO_SKIP_CLAUSE)}`, "")).toBe(recorded.pacingBlock);
    expect(recorded.pacingBlock).not.toMatch(/skip ahead in time/);
    expect(named(hint?.text ?? "")).toContain("never skip ahead in time or move Max Nightriver and their party somewhere new unless Max Nightriver chose to go");
  });

  it("the guidance that scripted 'when the feast winds down' now says a time skip or a move waits for the player", () => {
    expect(recorded.guidanceBlock).toContain("When the feast winds down, servants lead the party to a guest wing");
    expect(recorded.guidanceBlock).not.toMatch(/skips ahead in time/);
    const block = named(composeGuidanceBlock(checkpoint, policy, true));
    expect(block).toContain("A step in it that skips ahead in time or moves the party somewhere new waits until Max Nightriver chooses it.");
    expect(block.indexOf("skips ahead in time")).toBeLessThan(block.indexOf("When the feast winds down"));
  });
});
