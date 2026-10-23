import { importPoseImage } from "./importHost";
import * as media from "@services/stHost/media";
import * as gpu from "@services/stHost/gpuBroker";
import type { RunOwnership } from "@runtime/runToken";

jest.mock("@services/stHost/media", () => ({ comfyDiscover: jest.fn(), comfyFingerprint: jest.fn(), comfyReference: jest.fn(), comfyReleaseReference: jest.fn(), comfyRenderOwned: jest.fn() }));
jest.mock("@services/stHost/generation", () => ({ isHostGenerating: () => false }));
jest.mock("@services/stHost/gpuBroker", () => ({ gpuBrokerStatus: jest.fn(async () => null), reserveGpu: jest.fn(), releaseGpu: jest.fn(), renewGpu: jest.fn() }));
let owns = true;
const ownership: RunOwnership = { mint: () => ({ chatId: "c", storyId: "s", storyHash: "h", sessionEpoch: 1, windowRevision: 0, window: null }),
  check: () => owns ? { ok: true } : { ok: false, reason: "epoch", detail: "changed" } };
beforeEach(() => {
  owns = true;
  (media.comfyDiscover as jest.Mock).mockResolvedValue({ nodes: { DWPreprocessor: {} } });
  (media.comfyFingerprint as jest.Mock).mockResolvedValue({ name: "installed", sha256: "a".repeat(64), size: 1 });
  (media.comfyReference as jest.Mock).mockResolvedValue("owned.png");
  (media.comfyReleaseReference as jest.Mock).mockResolvedValue({ ok: true, released: true });
  (gpu.reserveGpu as jest.Mock).mockResolvedValue({ lease: "owned-lease", brokered: true });
  (gpu.releaseGpu as jest.Mock).mockResolvedValue({ ok: true, released: true });
  (media.comfyRenderOwned as jest.Mock).mockResolvedValue({ pose: [{ canvas_width: 64, canvas_height: 64,
    people: [{ pose_keypoints_2d: Array.from({ length: 18 }, (_, at) => [at + 10, at + 10, 1]).flat() }] }] });
});

test("missing DWPose files refuse before GPU reservation or upload", async () => {
  (media.comfyFingerprint as jest.Mock).mockRejectedValueOnce(new Error("not installed"));
  await expect(importPoseImage("synthetic", ownership)).rejects.toThrow("not installed");
  expect(gpu.reserveGpu).not.toHaveBeenCalled();
  expect(media.comfyReference).not.toHaveBeenCalled();
  expect(media.comfyRenderOwned).not.toHaveBeenCalled();
});

test("ownership lapse after reservation releases that lease and uploads nothing", async () => {
  (gpu.reserveGpu as jest.Mock).mockImplementationOnce(async () => { owns = false; return { lease: "owned-lease", brokered: true }; });
  await expect(importPoseImage("synthetic", ownership)).rejects.toThrow("no longer belongs");
  expect(gpu.releaseGpu).toHaveBeenCalledWith("owned-lease");
  expect(media.comfyReference).not.toHaveBeenCalled();
});

test("owned import returns body18 and releases only its captured reference and lease", async () => {
  const result = await importPoseImage("data:image/png;base64,c3ludGhldGlj", ownership);
  expect(result.points).toHaveLength(18);
  expect(media.comfyReference).toHaveBeenCalledWith("c3ludGhldGlj", expect.any(AbortSignal));
  expect(media.comfyFingerprint).toHaveBeenCalledTimes(2);
  expect(media.comfyReleaseReference).toHaveBeenCalledWith("owned.png");
  expect(gpu.releaseGpu).toHaveBeenCalledWith("owned-lease");
});

test("ownership lapse during upload cleans up without submitting the estimator", async () => {
  (media.comfyReference as jest.Mock).mockImplementationOnce(async () => { owns = false; return "owned.png"; });
  await expect(importPoseImage("synthetic", ownership)).rejects.toThrow("no longer belongs");
  expect(media.comfyRenderOwned).not.toHaveBeenCalled();
  expect(media.comfyReleaseReference).toHaveBeenCalledWith("owned.png");
  expect(gpu.releaseGpu).toHaveBeenCalledTimes(1);
});

test("request-local cancellation during discovery stops pose setup before reservation", async () => {
  const controller = new AbortController();
  (media.comfyDiscover as jest.Mock).mockImplementationOnce(async (signal: AbortSignal) => {
    controller.abort();
    signal.throwIfAborted();
  });
  await expect(importPoseImage("synthetic", ownership, controller.signal)).rejects.toThrow();
  expect(gpu.reserveGpu).not.toHaveBeenCalled();
  expect(media.comfyReference).not.toHaveBeenCalled();
});

test("request-local cancellation during rendering releases the captured reference and lease", async () => {
  const controller = new AbortController();
  (media.comfyRenderOwned as jest.Mock).mockImplementationOnce(async (_graph, signal: AbortSignal) => {
    controller.abort();
    signal.throwIfAborted();
  });
  await expect(importPoseImage("synthetic", ownership, controller.signal)).rejects.toThrow();
  expect(media.comfyReleaseReference).toHaveBeenCalledWith("owned.png");
  expect(gpu.releaseGpu).toHaveBeenCalledWith("owned-lease");
});
