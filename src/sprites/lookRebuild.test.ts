import { LookRebuild, changedLookRows, publishLookBust, replaceRig, type LookRebuildDeps } from "./lookRebuild";
import { visualFixture } from "./visualFixtures";
import { publishVisualLook, visualHead, visualRoot, visualSources, type VisualManifest } from "./visualManifest";
import { liveHeadKey, type LiveHeadRef } from "./liveHeadRefs";
import { manifestRef, type HeadManifest } from "./liveHead/manifest";
import { syntheticHead } from "./liveHead/synthetic";

const LOOK = "look_blue", MEMBER = "synthetic";
const lookBase = { path: "/characters/Synthetic/look_blue/neutral.png", sha256: "e".repeat(64), key: "look-key", recipe: { id: "qwen21-edit", version: 4 } };
const savedBust = { path: "/characters/Synthetic/visual_k/bust.png", sha256: "9".repeat(64), key: "k".repeat(64), recipe: { id: "visual-look-bust-crop", version: 1 } };
const rigFor = (input: { member: string; look: string; source: string; sha256: string }): HeadManifest =>
  ({ ...syntheticHead, member: input.member, look: input.look, source: input.source, artHash: input.sha256 });

const fixture = () => {
  const first = visualFixture();
  let source: VisualManifest = publishVisualLook(first, visualRoot(first), LOOK, "[[\"outfit\",\"blue\"]]", lookBase);
  let refs: Record<string, LiveHeadRef> = {};
  let owns = true, present = true;
  const deps: LookRebuildDeps = {
    ownership: { mint: () => ({ chatId: "chat", storyId: "story", storyHash: "hash", sessionEpoch: 1, windowRevision: 0, window: null }),
      check: () => owns ? { ok: true } : { ok: false, reason: "chat", detail: "changed" } },
    read: () => source, present: () => present,
    fingerprint: jest.fn(async (path: string) => path === lookBase.path ? lookBase.sha256 : path === first.bust.path ? first.bust.sha256 : path === first.base.path ? first.base.sha256 : savedBust.sha256),
    crop: jest.fn(async () => ({ data: "c3ludGhldGlj", sha256: savedBust.sha256 })), hash: async () => savedBust.key,
    synthesize: jest.fn(async (input) => ({ manifest: rigFor(input) })),
    rehome: (manifest, path, sha256) => ({ ...manifest, source: path, artHash: sha256 }),
    save: jest.fn(async () => savedBust),
    commitBust: jest.fn((next: VisualManifest) => { source = next; }),
    commitRig: jest.fn((manifest: HeadManifest) => { const ref = manifestRef(manifest); refs = replaceRig(refs, ref, liveHeadKey(ref)); }),
  };
  return { first, deps, rebuild: new LookRebuild(deps), source: () => source, refs: () => refs, set: (next: VisualManifest) => { source = next; },
    lapse: () => { owns = false; }, remove: () => { present = false; } };
};
const target = { character: "Synthetic", member: MEMBER, look: LOOK };

test("a changed look lists as pending; rebuild previews bust and rig without writing, accept publishes both and the head is ready", async () => {
  const f = fixture();
  expect(changedLookRows(f.source(), MEMBER, {})).toEqual([{ look: "default", state: "pending-rig", base: f.first.base, bust: f.first.bust },
    { look: LOOK, state: "pending-bust", base: lookBase }]);
  const review = await f.rebuild.prepare(target);
  expect(review.bust.data).toBe("c3ludGhldGlj"); expect(review.rig?.source).toBe("data:image/png;base64,c3ludGhldGlj");
  expect(f.deps.save).not.toHaveBeenCalled(); expect(f.deps.commitBust).not.toHaveBeenCalled(); expect(f.deps.commitRig).not.toHaveBeenCalled();
  const accepted = await f.rebuild.accept(review);
  expect(accepted.source.looks[LOOK].bust).toEqual(savedBust); expect(accepted.rig?.source).toBe(savedBust.path);
  expect(visualHead(f.source(), LOOK, MEMBER, f.refs()).state).toBe("ready");
  expect(changedLookRows(f.source(), MEMBER, f.refs()).map((row) => row.look)).toEqual(["default"]);
});

test("lineage: a re-rendered look or a replaced root invalidates the rebuilt bust and rig", async () => {
  const f = fixture();
  await f.rebuild.accept(await f.rebuild.prepare(target));
  const rerendered = publishVisualLook(f.source(), visualRoot(f.source()), LOOK, "[[\"outfit\",\"blue\"]]", { ...lookBase, sha256: "7".repeat(64) });
  expect(visualHead(rerendered, LOOK, MEMBER, f.refs()).state).toBe("pending-bust");
  const replaced = { ...f.source(), revision: 2, looks: { default: { ...f.source().looks.default, root: `${f.source().id}:2` } } };
  expect(visualHead(replaced, LOOK, MEMBER, f.refs()).state).toBe("missing-source");
  const stale = { ...f.refs()[Object.keys(f.refs())[0]], artHash: "1".repeat(64) };
  expect(visualHead(f.source(), LOOK, MEMBER, { [liveHeadKey(stale)]: stale }).state).toBe("pending-rig");
});

test("republishing the same look artwork after a rebuild keeps its bust and rig", async () => {
  const f = fixture();
  await f.rebuild.accept(await f.rebuild.prepare(target));
  const signature = f.source().looks[LOOK].signature;
  const again = publishVisualLook(f.source(), visualRoot(f.source()), LOOK, signature, { ...lookBase, path: `${lookBase.path}?t=1` });
  expect(again.looks[LOOK].bust).toEqual(savedBust);
  expect(visualHead(again, LOOK, MEMBER, f.refs()).state).toBe("ready");
  expect(publishVisualLook(f.source(), visualRoot(f.source()), LOOK, "[]", lookBase).looks[LOOK].bust).toBeUndefined();
});

test.each(["cancel", "chat", "delete", "replacement", "rerender"])("%s while the bust saves publishes neither bust nor rig", async (event) => {
  const f = fixture(), review = await f.rebuild.prepare(target);
  f.deps.save = jest.fn(async () => {
    if (event === "cancel") f.rebuild.cancel();
    if (event === "chat") f.lapse();
    if (event === "delete") f.remove();
    if (event === "replacement") f.set({ ...f.source(), revision: 2, looks: { default: { ...f.source().looks.default, root: `${f.source().id}:2` } } });
    if (event === "rerender") f.set(publishVisualLook(f.source(), visualRoot(f.source()), LOOK, "[]", { ...lookBase, sha256: "7".repeat(64) }));
    return savedBust;
  });
  await expect(f.rebuild.accept(review)).rejects.toThrow();
  expect(f.deps.commitBust).not.toHaveBeenCalled(); expect(f.deps.commitRig).not.toHaveBeenCalled();
});

test("a lapse during rig synthesis leaves no review to accept", async () => {
  const f = fixture();
  f.deps.synthesize = jest.fn(async (input) => { f.lapse(); return { manifest: rigFor(input) }; });
  await expect(f.rebuild.prepare(target)).rejects.toThrow(); expect(f.deps.commitBust).not.toHaveBeenCalled();
});

test("a refused rig still lets the author accept the bust; the head stays pending-rig with static fallback", async () => {
  const f = fixture();
  f.deps.synthesize = jest.fn(async () => { throw new Error("The vision model refused this bust: hair covers both eyes."); });
  const review = await f.rebuild.prepare(target);
  expect(review.rigError).toContain("hair covers both eyes"); expect(review.rig).toBeUndefined();
  await f.rebuild.accept(review);
  expect(f.deps.commitRig).not.toHaveBeenCalled();
  expect(visualHead(f.source(), LOOK, MEMBER, f.refs()).state).toBe("pending-rig");
});

test("a detector disagreement rides on the review as a warning and never blocks accepting the rig", async () => {
  const f = fixture();
  const check = { status: "disagree" as const, warnings: [{ feature: "mouth" as const, message: "The mouth is 0.4 face widths from the detector's mouth.", faceWidths: 0.4 }], note: "The face detector disagrees." };
  f.deps.synthesize = jest.fn(async (input) => ({ manifest: rigFor(input), check }));
  const review = await f.rebuild.prepare(target);
  expect(review.rigCheck).toEqual(check); expect(review.rig).toBeDefined();
  await f.rebuild.accept(review);
  expect(f.deps.commitRig).toHaveBeenCalledTimes(1);
});

test("a look with a saved bust rebuilds only its rig, from the saved file", async () => {
  const f = fixture();
  f.set(publishLookBust(f.source(), visualRoot(f.source()), LOOK, lookBase.sha256, savedBust));
  const review = await f.rebuild.prepare(target);
  expect(f.deps.crop).not.toHaveBeenCalled(); expect(review.rig?.source).toBe(savedBust.path);
  await f.rebuild.accept(review);
  expect(f.deps.save).not.toHaveBeenCalled(); expect(f.deps.commitBust).not.toHaveBeenCalled();
  expect(visualHead(f.source(), LOOK, MEMBER, f.refs()).state).toBe("ready");
  const def = await f.rebuild.prepare({ ...target, look: "default" });
  expect(def.rig?.source).toBe(f.first.bust.path);
});

test("refusals: tampered look file, saved bytes differing from review, stale review and default-bust replacement", async () => {
  const f = fixture();
  f.deps.fingerprint = jest.fn(async () => "0".repeat(64));
  await expect(f.rebuild.prepare(target)).rejects.toThrow("modified outside");
  const g = fixture(), review = await g.rebuild.prepare(target);
  g.deps.save = jest.fn(async () => ({ ...savedBust, sha256: "8".repeat(64) }));
  await expect(g.rebuild.accept(review)).rejects.toThrow("does not match"); expect(g.deps.commitBust).not.toHaveBeenCalled();
  const h = fixture(), stale = await h.rebuild.prepare(target);
  await expect(h.rebuild.accept({ ...stale, bust: { ...stale.bust, key: "x" } })).rejects.toThrow("current reviewed look");
  const source = visualFixture();
  expect(() => publishLookBust(source, visualRoot(source), "default", source.base.sha256, savedBust)).toThrow("Prepare presentation");
  expect(() => publishLookBust(source, "other:1", "default", source.base.sha256, source.bust)).toThrow("source changed");
  expect(() => publishLookBust(source, visualRoot(source), "missing", source.base.sha256, savedBust)).toThrow("no longer published");
});

test("publishLookBust stores a fresh-save bust by its served path", () => {
  const f = fixture();
  const next = publishLookBust(f.source(), visualRoot(f.source()), LOOK, lookBase.sha256, { ...savedBust, path: `${savedBust.path}?t=abcdef012345` });
  expect(next.looks[LOOK].bust?.path).toBe(savedBust.path);
  expect(visualSources(JSON.parse(JSON.stringify({ [next.character]: next })))[next.character]?.looks[LOOK]?.bust?.path).toBe(savedBust.path);
});

test("a saved bust path with a cache-busting query is published and rigged without it", async () => {
  const f = fixture();
  f.deps.save = jest.fn(async () => ({ ...savedBust, path: `${savedBust.path}?t=999999999999` }));
  const accepted = await f.rebuild.accept(await f.rebuild.prepare(target));
  expect(accepted.source.looks[LOOK].bust?.path).toBe(savedBust.path); expect(accepted.rig?.source).toBe(savedBust.path);
  expect(visualHead(f.source(), LOOK, MEMBER, f.refs()).state).toBe("ready");
});
