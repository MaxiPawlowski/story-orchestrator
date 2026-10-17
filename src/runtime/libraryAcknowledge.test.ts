import { CHECKS, runCheck, type Check } from "./checks";
import { acknowledgeDelta, emptyIndex, findLost, mergeIndex, withoutReported, type LibraryHeld, type LibraryLost } from "./libraryIndexCore";
import { PLAYER_COPY } from "./narrative";
import { jargonIn } from "@features/jargon";
import type { RuntimeSnapshot } from "./types";

const unit = { checkIndex: jest.fn(), acknowledge: jest.fn(), applyDelta: jest.fn() };
jest.mock("./libraryIndexUnit", () => unit);

const AT = "2026-10-17T00:00:00.000Z";
const held = (stories: Array<[string, string]>, sessions: string[] = []): LibraryHeld => ({ stories: stories.map(([id, hash]) => ({ id, hash })), sessions });
const check = CHECKS.find((entry) => entry.id === "library-lost-to-tab") as Check;
const snapshot = (libraryLost: RuntimeSnapshot["libraryLost"]) => ({ storyId: null, ui: { authorView: false }, libraryLost }) as unknown as RuntimeSnapshot;
const reported: LibraryLost = { stories: ["ruins"], sessions: ["wizard-b"], changed: ["old-road"] };

describe("plan 69 K3 follow-up: the player acknowledges what another tab overwrote", () => {
  it("the check offers one acknowledge action carrying exactly the reported ids, in player words", () => {
    const fired = runCheck(check, snapshot(reported));
    expect(fired?.action).toEqual({ kind: "acknowledge-library-lost", stories: ["ruins"], sessions: ["wizard-b"], changed: ["old-road"], label: PLAYER_COPY.libraryLostAcknowledge });
    expect(jargonIn(PLAYER_COPY.libraryLostAcknowledge)).toEqual([]);
  });

  it("acknowledging tombstones the missing ids, takes the held version of an older story, and the check stops firing", () => {
    const index = mergeIndex(emptyIndex(), { stories: { ruins: "h2", "old-road": "h3", kept: "h1" }, sessions: { "wizard-a": true, "wizard-b": true } }, AT);
    const now = held([["old-road", "h2"], ["kept", "h1"]], ["wizard-a"]);
    expect(findLost(index, now)).toEqual(reported);
    const delta = acknowledgeDelta(reported, now);
    expect(delta).toEqual({ stories: { ruins: null, "old-road": "h2" }, sessions: { "wizard-b": null } });
    const after = mergeIndex(index, delta, AT);
    expect(findLost(after, now)).toEqual({ stories: [], sessions: [], changed: [] });
    expect(after.stories.kept).toEqual({ at: AT, hash: "h1" });
  });

  it("control: an id lost after the acknowledgement, or reported but back in the library, is never tombstoned", () => {
    const now = held([["ruins", "h2"]]);
    expect(acknowledgeDelta(reported, now)).toEqual({ stories: {}, sessions: { "wizard-b": null } });
    const index = mergeIndex(mergeIndex(emptyIndex(), { stories: { ruins: "h2", later: "h5" } }, AT), acknowledgeDelta({ stories: ["ruins"], sessions: [], changed: [] }, held([])), AT);
    expect(findLost(index, held([])).stories).toEqual(["later"]);
    expect(withoutReported({ stories: ["ruins", "later"], sessions: [], changed: [] }, { stories: ["ruins"], sessions: [], changed: [] })).toEqual({ stories: ["later"], sessions: [], changed: [] });
    expect(withoutReported(reported, reported)).toBeNull();
  });

  it("the port clears the notice only when the index write landed, and says why when it did not", async () => {
    const { acknowledgeLibraryLost, checkLibraryIndex, libraryLost, LIBRARY_ACK_FAILED } = await import("./libraryIndexPort");
    unit.checkIndex.mockResolvedValue(reported);
    await checkLibraryIndex(() => undefined);
    expect(libraryLost()).toEqual(reported);
    const notify = jest.fn();
    unit.acknowledge.mockResolvedValueOnce(false);
    await expect(acknowledgeLibraryLost(reported, notify)).resolves.toEqual({ ok: false, reason: LIBRARY_ACK_FAILED });
    expect(libraryLost()).toEqual(reported);
    expect(notify).not.toHaveBeenCalled();
    unit.acknowledge.mockResolvedValueOnce(true);
    await expect(acknowledgeLibraryLost(reported, notify)).resolves.toEqual({ ok: true });
    expect(unit.acknowledge).toHaveBeenLastCalledWith(reported);
    expect(libraryLost()).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
