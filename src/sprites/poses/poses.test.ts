import { webcrypto } from "node:crypto";
import { readPose, readPoseList, readStoryPoses, readMemberSprites, readStage } from "@engine/validate/poses";
import { validateCardLayers } from "@engine/validate/cardLayers";
import type { CardBinding, ValidationError } from "@engine/schema";
import { shippedPoses, poseLibrary, memberPoses } from "./library";
import { retargetPose, drawSkeleton } from "./skeleton";
import { poseCacheKey, fallbackBodies, lookLayers, layerChanges, renderAllowed } from "./layers";
import { replayPose, poseRead } from "./stageChoice";
import { pickPose, scorePoseFixture } from "./pick";
import { readDWPose, posePck, dwposeGraph, headToHipRatio } from "./import";
import * as fixture from "../../../test/fixtures/poses/replies.json";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const poses = shippedPoses(), pose = poses.find((p) => p.id === "sit_chair")!;
const fingerprint = { name: "model", sha256: "a".repeat(64), size: 1 };

test("40 original body18 entries validate and preserve occlusion", () => {
  const errors: ValidationError[] = [];
  expect(readPoseList(poses, "poses", errors)).toHaveLength(40);
  expect(errors).toEqual([]);
  expect(new Set(poses.map((p) => JSON.stringify(p.keypoints.points))).size).toBe(40);
  expect(readPose({ ...pose, keypoints: { ...pose.keypoints, points: pose.keypoints.points.map((p, at) => at === 4 ? null : p) } }, "p", [])?.keypoints.points[4]).toBeNull();
  for (const change of [{ version: 0 }, { tags: ["unknown"] }, { keypoints: { ...pose.keypoints, points: [[-1, 0]] } }, { when: { keywords: [""] } }, { extra: 1 }]) expect(readPose({ ...pose, ...change }, "p", [])).toBeNull();
  const duplicate: ValidationError[] = [];
  readPoseList([pose, pose], "p", duplicate);
  expect(duplicate[0].message).toContain("duplicate");
});

test("story, installed and member allowlists respect overrides and default", () => {
  const installed = { ...pose, label: "Installed" }, custom = { ...pose, label: "Story" };
  expect(poseLibrary({ use: ["sitting"], custom: [custom] }, [installed]).find((p) => p.id === pose.id)?.label).toBe("Story");
  expect(memberPoses(poses, { poses: [pose.id] }).map((p) => p.id)).toEqual(["stand_relaxed", pose.id]);
  expect(readStoryPoses({ use: ["sitting"], custom: [pose] }, [])?.custom).toEqual([pose]);
  expect(readMemberSprites({ pose: pose.id, poses: [pose.id] }, "s", [])?.pose).toBe(pose.id);
  const errors: ValidationError[] = [];
  readStage({ arin: { pose: pose.id, framing: "full" }, cast: { mira: { face: "happy" } } }, "stage", errors);
  expect(errors).toEqual([]);
});

test("pose cache fingerprints version, retarget, recipe, model content and layer inputs", async () => {
  const input = { story: "s", member: "a", fields: { outfit: "blue" }, pose, retarget: { canvas: [200, 300] as [number, number], box: { x: 0, y: 0, width: 200, height: 300 } },
    recipe: { id: "p2", version: 1 }, models: { diffusion: fingerprint, encoder: fingerprint, vae: fingerprint }, base: "a", steps: 25, resolution: 1024 };
  const key = await poseCacheKey(input);
  for (const change of [{ pose: { ...pose, version: 2 } }, { retarget: { ...input.retarget, headToHip: 0.2 } }, { recipe: { id: "p3", version: 1 } },
    { recipe: { id: "p2", version: 2 } }, { models: { ...input.models, diffusion: { ...fingerprint, sha256: "b".repeat(64) } } }, { fields: { outfit: "red" } }]) expect(await poseCacheKey({ ...input, ...change })).not.toBe(key);
});

test("fallback ranks exact, shared-tag same look, standing, previous pose, default, current", () => {
  const wanted = { set: "wanted", look: "new", pose: "sit_chair", tags: ["sitting"] };
  const cached = [{ set: "old", look: "old", pose: "sit_chair", tags: ["sitting"] }, { set: "standing", look: "new", pose: "stand_relaxed", tags: ["standing"] }, { set: "near", look: "new", pose: "sit_floor", tags: ["sitting"] }];
  expect(fallbackBodies(wanted, cached, "current")).toEqual(["wanted", "near", "standing", "old", "default", "current"]);
});

test("direction outranks sticky keyword and model; rollback is replay within the applied scene", () => {
  const library = poses.map((p) => p.id === pose.id ? { ...p, when: { keywords: ["takes a seat"] } } : p);
  const rows = [poseRead(library, "Arin takes a seat.", "run", "a:0"), poseRead(library, "Arin speaks.", "wave", "a:0")];
  expect(replayPose(library, rows, "a:0")?.id).toBe(pose.id);
  expect(replayPose(library, rows, "a:0", "fight_guard")?.id).toBe("fight_guard");
  expect(replayPose(library, rows, "b:1")?.id).toBe("stand_relaxed");
  const played = [...rows, poseRead(library, "Arin runs", "run", "b:1")];
  expect(replayPose(library, played.slice(0, 2), "a:0")).toEqual(replayPose(library, rows, "a:0"));
});

test("layer changes keep face off bodies, limit decals to existing bodies and rebase from card art", () => {
  const card: CardBinding = { fields: { outfit: { quality: "o", visual: true }, age: { quality: "a", visual: true, rebase: true }, mood: { quality: "m", visual: true, layer: "face" }, scar: { quality: "s", visual: true, layer: "decal", region: { x: 0.2, y: 0.1, width: 0.2, height: 0.1 } } } };
  const before = lookLayers(card, {}), face = lookLayers(card, { mood: "frown" }), decal = lookLayers(card, { scar: "bandage" });
  const bodies = [{ set: "body", look: "l", pose: pose.id, tags: pose.tags }];
  expect(layerChanges(before, face, bodies)).toEqual([{ layer: "face", set: "body" }]);
  expect(layerChanges(before, decal, [])).toEqual([]);
  expect(layerChanges(before, decal, bodies)).toEqual([{ layer: "decal", set: "body", field: "scar" }]);
  const rebase = lookLayers(card, { age: "older" });
  expect(layerChanges(before, rebase, bodies)).toEqual([]);
  expect(layerChanges(before, rebase, bodies, pose.id)).toEqual([{ layer: "base", pose: pose.id, source: "card" }]);
  const errors: ValidationError[] = [];
  validateCardLayers([{ id: "a", card: { fields: { bad: { quality: "a", visual: true, layer: "face", rebase: true, region: { x: 0.9, y: 0, width: 0.5, height: 1 } } } } }], undefined, errors);
  expect(errors.map((e) => e.path.split(".").pop())).toEqual(["rebase", "region"]);
});

test("queue provenance rejects future values and undisclosed poses", () => {
  const history = [{ outfit: "coat" }, { outfit: "armor" }];
  expect(renderAllowed({ pose: pose.id, fields: { outfit: "armor" } }, history, [pose.id])).toBe(true);
  expect(renderAllowed({ pose: pose.id, fields: { outfit: "crown" } }, history, [pose.id])).toBe(false);
  expect(renderAllowed({ pose: "cast_staff", fields: {} }, history, [pose.id])).toBe(false);
});

test("retarget respects the alpha canvas and skeleton drawing skips occluded joints", () => {
  const kp = retargetPose(pose, { canvas: [200, 300], box: { x: 30, y: 20, width: 150, height: 260 }, headToHip: 0.25 });
  expect(kp.points.every((point) => !point || point[0] >= 0 && point[0] < 200 && point[1] >= 0 && point[1] < 300)).toBe(true);
  const context = { fillRect: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn(), arc: jest.fn(), fill: jest.fn() };
  const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
  drawSkeleton(canvas, { ...kp, points: kp.points.map((p, at) => at === 0 ? null : p) });
  expect(context.arc).toHaveBeenCalledTimes(17);
  expect(context.stroke).toHaveBeenCalledTimes(14);
});

test("pose pick falls through judge failure to validated LLM, then none", async () => {
  const llm = jest.fn(async () => pose.id);
  expect(await pickPose({ text: "Arin sits.", member: "Arin", poses }, { judge: async () => { throw new Error("offline"); }, llm })).toEqual({ pose: pose.id, source: "llm" });
  expect(llm.mock.calls[0]).toBeDefined();
  expect(await pickPose({ text: "Arin sits.", member: "Arin", poses }, { judge: null, llm: async () => "future_pose" })).toEqual({ pose: null, source: "none" });
  expect(await pickPose({ text: "hello", member: "Arin", poses }, { judge: null, llm: async () => "none" })).toEqual({ pose: null, source: "llm" });
});

test("40 labeled synthetic replies are scoreable but no model accuracy is claimed", () => {
  expect(fixture).toHaveLength(40);
  expect(new Set(fixture.map((r) => r.id)).size).toBe(40);
  expect(fixture.filter((r) => r.pose === null)).toHaveLength(8);
  expect(fixture.every((r) => r.pose === null || poses.some((p) => p.id === r.pose))).toBe(true);
  expect(scorePoseFixture(fixture, {})).toMatchObject({ total: 40, correct: 0, complete: false, floor: 0.8 });
  expect(scorePoseFixture(fixture, Object.fromEntries(fixture.map((r, at) => [r.id, at < 32 ? r.pose : "run"])))).toMatchObject({ accuracy: 0.8, complete: true });
});

test("DWPose import rejects ambiguous people and PCK counts missing target joints as misses", () => {
  const raw = { canvas_width: 768, canvas_height: 1152, people: [{ pose_keypoints_2d: pose.keypoints.points.flatMap((p) => p ? [...p, 1] : [0, 0, 0]) }] };
  const imported = readDWPose(JSON.stringify([raw]));
  expect(headToHipRatio(imported)).toBeGreaterThan(0);
  expect(posePck(imported, pose.keypoints)).toBe(1);
  expect(posePck({ ...imported, points: imported.points.map((p, at) => at < 9 ? null : p) }, pose.keypoints)).toBe(0.5);
  expect(() => readDWPose([{ ...raw, people: [...raw.people, ...raw.people] }])).toThrow("exactly one");
  expect(dwposeGraph("owned")["2"]).toMatchObject({ class_type: "DWPreprocessor", inputs: { pose_estimator: "dw-ll_ucoco_384.onnx" } });
});
