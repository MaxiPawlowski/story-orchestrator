import { VisualPreparation, type VisualPreparationDeps } from "./visualPreparation";
import { visualFixture } from "./visualFixtures";
import { visualSources, visualRoot, currentVisual, lookSignature, publishVisualLook, visualHead } from "./visualManifest";

const fixture = () => {
  const source = visualFixture();
  let accepted: ReturnType<typeof visualFixture> | undefined;
  let owns = true, present = true;
  const deps: VisualPreparationDeps = {
    ownership: { mint: () => ({ chatId: "chat", storyId: "story", storyHash: "hash", sessionEpoch: 1, windowRevision: 0, window: null }),
      check: () => owns ? { ok: true } : { ok: false, reason: "chat", detail: "changed" } },
    read: () => accepted, present: () => present,
    fingerprint: jest.fn(async (path) => path === source.card.path ? source.card.sha256 : source.base.sha256),
    crop: jest.fn(async () => ({ data: "synthetic-png", sha256: source.bust.sha256 })), hash: async () => source.id,
    save: jest.fn(async () => source.bust), commit: jest.fn((value) => { accepted = value; }),
  };
  const input = { character: source.character, card: source.card, baseSet: source.baseSet, base: source.base, box: source.box };
  return { source, input, deps, preparation: new VisualPreparation(deps), accepted: () => accepted,
    replace: () => { accepted = { ...source, revision: 2 }; }, lapse: () => { owns = false; }, remove: () => { present = false; } };
};

test("previews are isolated from persisted accepted assets; author acceptance survives reload with provenance", async () => {
  const f = fixture(), review = await f.preparation.prepare(f.input);
  expect(f.accepted()).toBeUndefined(); expect(f.deps.save).not.toHaveBeenCalled();
  review.input.box.width += 1;
  await expect(f.preparation.accept(review)).rejects.toThrow("current reviewed candidate");
  const fresh = await f.preparation.prepare(f.input), accepted = await f.preparation.accept(fresh);
  const reloaded = visualSources(JSON.parse(JSON.stringify({ Synthetic: accepted }))).Synthetic;
  expect(reloaded.card).toEqual(f.source.card); expect(reloaded.base.sha256).toBe(f.source.base.sha256);
  expect(currentVisual(reloaded, "[]")?.bust?.sha256).toBe(f.source.bust.sha256);
});

test.each(["cancel", "chat", "delete", "replacement"])("%s while the saved candidate answers never publishes an accepted manifest", async (event) => {
  const f = fixture(), review = await f.preparation.prepare(f.input);
  f.deps.save = jest.fn(async () => { if (event === "cancel") f.preparation.cancel(); if (event === "chat") f.lapse(); if (event === "delete") f.remove(); if (event === "replacement") f.replace(); return f.source.bust; });
  await expect(f.preparation.accept(review)).rejects.toThrow(); expect(f.deps.commit).not.toHaveBeenCalled();
});

test("modified base during review refuses saving, and a save with different bytes refuses publication", async () => {
  const f = fixture(), review = await f.preparation.prepare(f.input);
  f.deps.fingerprint = async () => "f".repeat(64);
  await expect(f.preparation.accept(review)).rejects.toThrow("source changed"); expect(f.deps.save).not.toHaveBeenCalled();
  const g = fixture(), next = await g.preparation.prepare(g.input);
  g.deps.save = async () => ({ ...g.source.bust, sha256: "e".repeat(64) });
  await expect(g.preparation.accept(next)).rejects.toThrow("does not match"); expect(g.deps.commit).not.toHaveBeenCalled();
});

test("cancelled async crop cannot become a later review or accepted source", async () => {
  const f = fixture();
  f.deps.crop = async (_path, _box, signal) => { f.preparation.cancel(); expect(signal.aborted).toBe(true); return { data: "late", sha256: f.source.bust.sha256 }; };
  await expect(f.preparation.prepare(f.input)).rejects.toThrow("review changed"); expect(f.deps.commit).not.toHaveBeenCalled();
});

test("look publication carries the root; changing root prevents old look reuse and requires a new bust/rig", () => {
  const source = visualFixture(), signature = lookSignature({ clothing: "blue coat" });
  const changed = publishVisualLook(source, visualRoot(source), "look_blue", signature, { ...source.base, sha256: "e".repeat(64) });
  expect(currentVisual(changed, signature)?.base.sha256).toBe("e".repeat(64));
  expect(visualHead(changed, "look_blue", "synthetic", {}).state).toBe("pending-bust");
  expect(() => publishVisualLook({ ...changed, revision: 2 }, visualRoot(source), "old", signature, source.base)).toThrow("source changed");
  expect(currentVisual({ ...changed, revision: 2 }, signature)).toBeNull();
  expect(visualSources({ Synthetic: { ...changed, revision: 2 } })).toEqual({});
});
