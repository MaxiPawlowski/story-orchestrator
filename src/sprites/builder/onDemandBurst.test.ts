import { OnDemandLooks } from "./onDemand";
import { closeImageBurst, openImageBurst } from "@services/stHost/gpuBroker";
import { testOwnership } from "../../../test/findings/testOwnership";
import type { RuntimeManager } from "@runtime/runtimeManager";

jest.mock("@services/stHost/gpuBroker", () => ({ gpuBrokerStatus: jest.fn(), openImageBurst: jest.fn(), closeImageBurst: jest.fn() }));
jest.mock("@services/stHost/media", () => ({ comfyDiscover: jest.fn(), comfyFingerprint: jest.fn(), spriteFileFingerprint: jest.fn(), spriteManifest: jest.fn(), spriteReferencePack: jest.fn() }));
jest.mock("@services/stHost/sprites", () => ({ spriteList: jest.fn() }));
jest.mock("./host", () => ({ createSpriteBuilder: () => ({ close: jest.fn(), cancel: jest.fn() }) }));
jest.mock("../visualHost", () => ({ verifyVisualSource: jest.fn(), sourceStillCurrent: () => true, publishDerivedVisual: jest.fn() }));

const manager = { getOwnership: () => testOwnership(), getGlobalSettings: () => ({ sprites: { visualSources: {}, builders: {}, onDemand: false } }), getCachedSnapshot: () => ({ storyId: "s" }) } as unknown as RuntimeManager;

test("draining look edits announces one image burst sized to the queue and closes it when the queue is empty", async () => {
  jest.mocked(openImageBurst).mockResolvedValue({ ok: true, burst: "b1" });
  jest.mocked(closeImageBurst).mockResolvedValue({ ok: true, closed: true });
  const looks = new OnDemandLooks(manager);
  const failed = jest.fn();
  looks.request({ member: "m", folder: "f", label: "neutral", fields: { hair: "red" }, accepts: () => true, apply: jest.fn(), failed });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(openImageBurst).toHaveBeenCalledWith({ count: 3, ttlMs: 180_000, kind: "looks" });
  expect(closeImageBurst).toHaveBeenCalledWith("b1");
  expect(failed).toHaveBeenCalled();
});

test("a broker without bursts leaves look edits running and closes nothing", async () => {
  jest.mocked(openImageBurst).mockResolvedValue({ ok: true, burst: null });
  jest.mocked(closeImageBurst).mockClear();
  const looks = new OnDemandLooks(manager);
  looks.request({ member: "m", folder: "f", label: "smile", fields: { hair: "blue" }, accepts: () => true, apply: jest.fn() });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(closeImageBurst).not.toHaveBeenCalled();
});
