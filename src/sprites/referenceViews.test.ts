import { createHash } from "node:crypto";
import { ReferencePackSession, RENDERED_VIEWS, referenceViewKey, referencePackText, viewInstruction, type ReferencePackDeps, type ViewRoute } from "./referenceViews";
import { visualFixture } from "./visualFixtures";
import { REFERENCE_VIEWS, publishVisualLook, visualRoot, visualSources, withReferencePack, type VisualManifest } from "./visualManifest";
import { editKey } from "./builder/recipes";

const sha = (value: string): string => createHash("sha256").update(value).digest("hex");
const model = (name: string) => ({ name, sha256: sha(name), size: 1 });
const route: ViewRoute = { models: { diffusion: model("qwen"), encoder: model("vl"), vae: model("vae") }, steps: 25, resolution: 1024,
  cutout: { id: "birefnet", node: "BiRefNetRMBG", model: "BiRefNet-HR", files: [] } };

function fixture() {
  let accepted: VisualManifest | undefined = publishVisualLook(visualFixture(), `${"c".repeat(64)}:1`, "red", "[[\"hair\",\"red\"]]",
    { path: "/characters/Synthetic/look/neutral.png", sha256: "e".repeat(64), key: "look-key", recipe: { id: "qwen21-edit", version: 4 } });
  let owns = true, present = true;
  const closed = jest.fn(async () => undefined);
  const renders: Array<{ view: string; key: string }> = [];
  const deps: ReferencePackDeps = {
    ownership: { mint: () => ({ chatId: "chat", storyId: "story", storyHash: "hash", sessionEpoch: 1, windowRevision: 0, window: null }),
      check: () => owns ? { ok: true } : { ok: false, reason: "chat", detail: "changed" } },
    read: () => accepted, present: () => present,
    verify: jest.fn(async () => undefined), route: jest.fn(async () => route),
    open: jest.fn(async () => ({ close: closed, render: async (view: string, _instruction: string, key: string) => { renders.push({ view, key }); return `png-${view}`; } })),
    hash: async (value) => sha(value), hashData: async (data) => sha(data),
    save: jest.fn(async (_character, set, candidate) => ({ path: `/characters/Synthetic/${set}/${candidate.view}.png`, sha256: candidate.sha256, key: candidate.key,
      recipe: { id: "qwen21-reference-view", version: 1 } })),
    commit: jest.fn((value) => { accepted = value; }),
  };
  return { deps, closed, renders, session: new ReferencePackSession(deps), accepted: () => accepted,
    replace: () => { accepted = { ...accepted!, revision: accepted!.revision + 1, looks: { default: { ...accepted!.looks.default, root: `${accepted!.id}:${accepted!.revision + 1}` } } }; },
    lapse: () => { owns = false; }, remove: () => { present = false; } };
}

test("prepare draws the four missing views from the accepted base and saves nothing until accept", async () => {
  const f = fixture(), source = f.accepted()!, review = await f.session.prepare("Synthetic");
  expect(review.views.map((view) => view.view)).toEqual([...RENDERED_VIEWS]);
  expect(review.root).toBe(visualRoot(source));
  expect(review.views[0].key).toBe(sha(referenceViewKey(visualRoot(source), source.base.sha256, "three_quarter_left", route)));
  expect(new Set(review.views.map((view) => view.key)).size).toBe(4);
  expect(f.deps.save).not.toHaveBeenCalled(); expect(f.deps.commit).not.toHaveBeenCalled();
  expect(f.closed).toHaveBeenCalledTimes(1);
  expect(viewInstruction("back")).toContain("no face visible");
});

test("accept stores six views, puts the pack hash in the root, keeps the default look and drops derived looks", async () => {
  const f = fixture(), before = f.accepted()!, review = await f.session.prepare("Synthetic"), next = await f.session.accept(review);
  expect(Object.keys(next.pack!.views).sort()).toEqual([...REFERENCE_VIEWS].sort());
  expect(next.pack!.views.full_body).toEqual(before.base); expect(next.pack!.views.front).toEqual(before.bust);
  expect(next.pack!.hash).toBe(sha(referencePackText(visualRoot(before), next.pack!.views)));
  expect(next.revision).toBe(before.revision + 1);
  expect(visualRoot(next)).toBe(`${before.id}:${before.revision + 1}:${next.pack!.hash.slice(0, 16)}`);
  expect(Object.keys(next.looks)).toEqual(["default"]); expect(next.looks.default.root).toBe(visualRoot(next));
  const reloaded = visualSources(JSON.parse(JSON.stringify({ Synthetic: next }))).Synthetic;
  expect(reloaded).toEqual(next);
  const key = (root: string) => editKey({ base: "a".repeat(64), models: route.models, kind: "expression", value: "happy", seed: 1, steps: 25, box: {}, visualRoot: root });
  expect(await key(visualRoot(next))).not.toBe(await key(visualRoot(before)));
  expect(f.deps.save).toHaveBeenCalledTimes(4);
});

test.each(["cancel", "chat", "delete", "replacement"])("%s during a render or a save never publishes a pack", async (event) => {
  const act = (f: ReturnType<typeof fixture>) => {
    if (event === "cancel") f.session.cancel(); if (event === "chat") f.lapse(); if (event === "delete") f.remove(); if (event === "replacement") f.replace();
  };
  const rendering = fixture();
  rendering.deps.open = jest.fn(async () => ({ close: rendering.closed, render: async (view: string) => { if (view === "profile") act(rendering); return `png-${view}`; } }));
  await expect(rendering.session.prepare("Synthetic")).rejects.toThrow();
  expect(rendering.closed).toHaveBeenCalledTimes(1);
  const saving = fixture(), review = await saving.session.prepare("Synthetic");
  const save = saving.deps.save;
  saving.deps.save = jest.fn(async (...args: Parameters<typeof save>) => { const asset = await save(...args); if (args[2].view === "profile") act(saving); return asset; });
  await expect(saving.session.accept(review)).rejects.toThrow();
  expect(saving.deps.commit).not.toHaveBeenCalled();
});

test("a lapse at every await of prepare refuses the review", async () => {
  for (let at = 0; at < 3 + RENDERED_VIEWS.length * 3; at++) {
    const f = fixture();
    let calls = 0;
    const tick = <T>(value: T): T => { if (calls++ === at) f.lapse(); return value; };
    const verify = f.deps.verify, routeOf = f.deps.route, open = f.deps.open, hash = f.deps.hash, hashData = f.deps.hashData;
    f.deps.verify = async (...args) => tick(await verify(...args));
    f.deps.route = async (...args) => tick(await routeOf(...args));
    f.deps.open = async (...args) => { const job = await open(...args); tick(null); return { close: job.close, render: async (...rest) => tick(await job.render(...rest)) }; };
    f.deps.hash = async (value) => tick(await hash(value));
    f.deps.hashData = async (value) => tick(await hashData(value));
    await expect(f.session.prepare("Synthetic")).rejects.toThrow();
    expect(f.closed.mock.calls.length).toBeLessThanOrEqual(1);
  }
});

test("a saved view with other bytes, a stale review or no accepted source refuses", async () => {
  const f = fixture(), review = await f.session.prepare("Synthetic");
  await expect(f.session.accept({ ...review, views: review.views.slice(1) })).rejects.toThrow("current reviewed");
  f.deps.save = jest.fn(async (_c, set, candidate) => ({ path: `/characters/Synthetic/${set}/x.png`, sha256: "f".repeat(64), key: candidate.key, recipe: { id: "x", version: 1 } }));
  await expect(f.session.accept(review)).rejects.toThrow("does not match");
  expect(f.deps.commit).not.toHaveBeenCalled();
  const empty = fixture();
  empty.deps.read = () => undefined;
  await expect(empty.session.prepare("Synthetic")).rejects.toThrow("Accept this character's base and bust");
});

test("the manifest refuses a pack that does not match its base and bust, or misses a view", () => {
  const source = visualFixture(), asset = (name: string) => ({ path: `/characters/Synthetic/p/${name}.png`, sha256: sha(name), key: name, recipe: { id: "qwen21-reference-view", version: 1 } });
  const views = { full_body: source.base, front: source.bust, three_quarter_left: asset("l"), three_quarter_right: asset("r"), profile: asset("p"), back: asset("b") };
  const next = withReferencePack(source, visualRoot(source), { hash: sha("pack"), views });
  expect(visualSources({ Synthetic: next }).Synthetic).toEqual(next);
  expect(visualSources({ Synthetic: { ...next, pack: { ...next.pack, views: { ...views, full_body: asset("other") } } } }).Synthetic).toBeUndefined();
  const missing: Record<string, unknown> = { ...views }; delete missing.back;
  expect(visualSources({ Synthetic: { ...next, pack: { hash: sha("pack"), views: missing } } }).Synthetic).toBeUndefined();
  expect(visualSources({ Synthetic: { ...next, looks: { default: { ...next.looks.default, root: visualRoot(source) } } } }).Synthetic).toBeUndefined();
  expect(() => withReferencePack(next, visualRoot(source), next.pack!)).toThrow("accepted visual source changed");
  expect(visualRoot(source)).toBe(`${source.id}:1`);
});
