import { createHash } from "node:crypto";
import type { RunGuard } from "@runtime/runToken";
import type { PixelImage } from "../../builder/pixels";
import type { Point } from "../types";
import { syntheticBust } from "./syntheticBust";
import { eyeCentre, type FaceLandmarks } from "./landmarks";
import { CROSS_CHECK_LIMITS, crossCheckLandmarks, readDetectorResult, type DetectorFace, type DetectorPoint, type DetectorResult } from "./landmarkCheck";
import { detectorChecker } from "./detectorCheck";
import { encodePngStored, base64 } from "./png";
import { synthesizeCheckedHead, type RigSynthesisDeps } from "./synthesize";

const marks = (): FaceLandmarks => syntheticBust(1).landmarks;
const ring = ([cx, cy]: Point, w: number, h: number): DetectorPoint[] =>
  [[-w, 0], [0, -h], [w, 0], [-w / 2, h / 2], [0, h / 2], [w / 2, 0]].map(([x, y]): DetectorPoint => [cx + x, cy + y, 0.95]);

function detectorFor(m: FaceLandmarks): DetectorResult {
  const { cx, cy, rx, ry } = m.face, eyeY = (eyeCentre(m.eyes[0])[1] + eyeCentre(m.eyes[1])[1]) / 2, at = (x: number, y: number): DetectorPoint => [x, y, 0.95];
  const points: DetectorPoint[] = [at(cx - rx, eyeY), at(cx - rx * 0.7, m.chin[1] - 20), at(m.chin[0], m.chin[1]), at(cx + rx * 0.7, m.chin[1] - 20), at(cx + rx, eyeY),
    at(m.brows[0][0] - 6, m.brows[0][1]), at(m.brows[0][0], m.brows[0][1] - 1), at(m.brows[0][0] + 6, m.brows[0][1]),
    at(m.brows[1][0] - 6, m.brows[1][1]), at(m.brows[1][0], m.brows[1][1] - 1), at(m.brows[1][0] + 6, m.brows[1][1]),
    ...ring(eyeCentre(m.eyes[0]), 9, 4), ...ring(eyeCentre(m.eyes[1]), 9, 4), at(m.nose[0], m.nose[1]),
    at(...m.mouth.left), at(...m.mouth.top), at(...m.mouth.right), at(...m.mouth.bottom)];
  return { width: m.image.width, height: m.image.height, faces: [{ box: [cx - rx, cy - ry, cx + rx, cy + ry, 0.99], points }] };
}
const move = (result: DetectorResult, indexes: number[], dx: number, dy: number): DetectorResult => ({ ...result, faces: result.faces.map((face): DetectorFace =>
  ({ ...face, points: face.points.map(([x, y, s], index): DetectorPoint => indexes.includes(index) ? [x + dx, y + dy, s] : [x, y, s]) })) });
const LEFT_EYE = [11, 12, 13, 14, 15, 16], MOUTH = [24, 25, 26, 27];
const width = (m: FaceLandmarks) => 2 * m.face.rx;

describe("detector cross-check of vision landmarks", () => {
  test("predeclared limits are the recorded ones", () => {
    expect(CROSS_CHECK_LIMITS).toEqual({ minFaceWidth: 8, minBoxScore: 0.5, minPointScore: 0.3, eyeShift: 0.15, mouthShift: 0.15, chinShift: 0.15, jawRatio: [0.6, 1.6] });
  });

  test("agreeing landmarks pass, also with a shift just under every limit", () => {
    const m = marks(), result = detectorFor(m);
    expect(crossCheckLandmarks(m, result).status).toBe("agree");
    const near = 0.14 * width(m);
    expect(crossCheckLandmarks(m, move(move(result, LEFT_EYE, near, 0), MOUTH, 0, near)).status).toBe("agree");
  });

  test("a shifted eye is flagged for that eye only", () => {
    const m = marks(), check = crossCheckLandmarks(m, move(detectorFor(m), LEFT_EYE, 0, 0.3 * width(m)));
    expect(check.status).toBe("disagree");
    if (check.status !== "disagree") return;
    expect(check.warnings.map((warning) => warning.feature)).toEqual(["eyes"]);
    expect(check.warnings[0].message).toContain("image-left eye is 0.3 face widths");
  });

  test("swapped eyes are named as swapped", () => {
    const m = marks(), result = detectorFor(m), swapped: FaceLandmarks = { ...m, eyes: [m.eyes[1], m.eyes[0]] };
    const check = crossCheckLandmarks(swapped, result);
    expect(check.status).toBe("disagree");
    if (check.status !== "disagree") return;
    expect(check.warnings).toHaveLength(1);
    expect(check.warnings[0]).toMatchObject({ feature: "eyes", message: expect.stringContaining("swapped") });
  });

  test("a mouth off by a quarter face is flagged as the mouth only", () => {
    const m = marks(), check = crossCheckLandmarks(m, move(detectorFor(m), MOUTH, 0, 0.25 * width(m)));
    expect(check.status).toBe("disagree");
    if (check.status !== "disagree") return;
    expect(check.warnings).toEqual([{ feature: "mouth", message: "The mouth is 0.25 face widths from the detector's mouth.", faceWidths: 0.25 }]);
  });

  test("a misplaced chin and a too-wide face oval flag the jaw; a face centred elsewhere flags the face", () => {
    const m = marks(), result = detectorFor(m);
    const chin = crossCheckLandmarks(m, move(result, [2], 0, 0.3 * width(m)));
    expect(chin.status === "disagree" && chin.warnings.map((warning) => warning.feature)).toEqual(["jaw"]);
    const wide = crossCheckLandmarks({ ...m, face: { ...m.face, rx: m.face.rx * 1.8 } }, result);
    expect(wide.status === "disagree" && wide.warnings.some((warning) => warning.message.includes("1.8 times"))).toBe(true);
    const away: DetectorResult = { ...result, faces: [{ ...result.faces[0], box: [0, 0, 20, 20, 0.99] }] };
    const face = crossCheckLandmarks(m, away);
    expect(face.status === "disagree" && face.warnings[0].feature).toBe("face");
  });

  test("an unsure, missing or mismatched detector answer skips instead of warning", () => {
    const m = marks(), result = detectorFor(m);
    const unsure = { ...result, faces: [{ ...result.faces[0], points: result.faces[0].points.map(([x, y]): DetectorPoint => [x, y, 0.1]) }] };
    expect(crossCheckLandmarks(m, unsure).status).toBe("skipped");
    const mouthUnsure = { ...result, faces: [{ ...result.faces[0], points: result.faces[0].points.map(([x, y, s], index): DetectorPoint => [x, y + (MOUTH.includes(index) ? 40 : 0), MOUTH.includes(index) ? 0.1 : s]) }] };
    const partial = crossCheckLandmarks(m, mouthUnsure);
    expect(partial).toMatchObject({ status: "agree", note: expect.stringContaining("unsure of: mouth") });
    expect(crossCheckLandmarks(m, { ...result, faces: [] }).status).toBe("skipped");
    expect(crossCheckLandmarks(m, { ...result, faces: [{ ...result.faces[0], box: [...result.faces[0].box.slice(0, 4), 0.2] as DetectorFace["box"] }] }).status).toBe("skipped");
    expect(crossCheckLandmarks(m, { ...result, width: result.width + 1 }).status).toBe("skipped");
  });

  test("the detector answer shape is validated", () => {
    const result = detectorFor(marks());
    expect(readDetectorResult(JSON.parse(JSON.stringify({ ok: true, ...result })))).toEqual(result);
    expect(readDetectorResult({ ...result, faces: [{ ...result.faces[0], points: result.faces[0].points.slice(1) }] })).toBeNull();
    expect(readDetectorResult({ ...result, faces: [{ ...result.faces[0], box: [1, 2, 3] }] })).toBeNull();
    expect(readDetectorResult(null)).toBeNull();
  });

  test("the checker skips silently with a status note when the detector is unavailable or fails, and lets an abort through", async () => {
    const m = marks(), signal = new AbortController().signal;
    expect(await detectorChecker(async () => ({ ok: false, reason: "unavailable" }))("x", m, signal)).toEqual({ status: "skipped", note: "The face detector is not running; landmarks were not cross-checked." });
    expect((await detectorChecker(async () => { throw new Error("socket closed"); })("x", m, signal)).note).toContain("not running");
    expect((await detectorChecker(async () => ({ ok: false, reason: "bad-image" }))("x", m, signal)).note).toContain("bad-image");
    expect((await detectorChecker(async () => ({ ok: true, result: { nope: 1 } }))("x", m, signal)).status).toBe("skipped");
    expect((await detectorChecker(async () => ({ ok: true, result: detectorFor(m) }))("x", m, signal)).status).toBe("agree");
    const aborted = new AbortController();
    aborted.abort();
    await expect(detectorChecker(async () => { throw new Error("aborted"); })("x", m, aborted.signal)).rejects.toBeDefined();
  });
});

describe("synthesis with the cross-check", () => {
  const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
  const guard = (check: () => boolean = () => true): RunGuard => ({ stillOwns: check, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });
  const fixture = () => {
    const bust = syntheticBust(1), png = encodePngStored(bust.image);
    const deps: RigSynthesisDeps = {
      landmarks: jest.fn(async () => JSON.parse(JSON.stringify(bust.landmarks)) as unknown),
      read: jest.fn(async () => png), hash: jest.fn(async (bytes: Uint8Array) => sha(bytes)),
      decode: jest.fn(async () => bust.image), encode: jest.fn(async (image: PixelImage) => base64(encodePngStored(image))),
    };
    return { bust, png, deps, input: { member: "shape", look: "look_blue", source: "/characters/Synthetic/visual_x/bust.png", sha256: sha(png) } };
  };

  test("the checker reads the same bust and the parsed landmarks; its verdict rides with the manifest", async () => {
    const f = fixture(), verdict = { status: "disagree" as const, warnings: [{ feature: "mouth" as const, message: "m", faceWidths: 0.3 }], note: "n" };
    f.deps.check = jest.fn(async () => verdict);
    const result = await synthesizeCheckedHead(f.input, guard(), f.deps);
    expect(result?.check).toEqual(verdict);
    expect(result?.manifest.rig).toBeDefined();
    expect(f.deps.check).toHaveBeenCalledWith(base64(f.png), f.bust.landmarks, expect.anything());
  });

  test("no checker means no verdict; a lapse during the check publishes nothing", async () => {
    const f = fixture();
    expect((await synthesizeCheckedHead(f.input, guard(), f.deps))?.check).toBeUndefined();
    const g = fixture();
    let owns = true;
    g.deps.check = jest.fn(async () => { owns = false; return { status: "agree" as const, note: "ok" }; });
    expect(await synthesizeCheckedHead(g.input, guard(() => owns), g.deps)).toBeNull();
    expect(g.deps.encode).not.toHaveBeenCalled();
  });
});
