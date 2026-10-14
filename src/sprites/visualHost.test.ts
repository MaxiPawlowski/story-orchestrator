import { createVisualPreparation, publishDerivedVisual } from "./visualHost";
import { visualFixture } from "./visualFixtures";
import { visualRoot } from "./visualManifest";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import type { VisualPreparationDeps } from "./visualPreparation";
import type { RunGuard, RunOwnership } from "@runtime/runToken";

jest.mock("@runtime/settingsStore", () => ({ getGlobalSettings: jest.fn(), setGlobalSettings: jest.fn() }));
jest.mock("@services/stHost/media", () => ({ spriteFileFingerprint: jest.fn(), saveGeneratedSprite: jest.fn() }));
jest.mock("@services/stHost/sprites", () => ({ spriteVisualCardPresent: () => true }));

const source = visualFixture();
const base = { ...source.base, sha256: "e".repeat(64) };
const guard = (owns: boolean) => ({ stillOwns: () => owns }) as RunGuard;
beforeEach(() => {
  jest.clearAllMocks();
  const defaults = defaultGlobalSettings();
  jest.mocked(getGlobalSettings).mockReturnValue({ ...defaults, sprites: { ...defaults.sprites, visualSources: { Synthetic: source } } });
});

test("a derived look publishes only while its run still owns the story", () => {
  expect(() => publishDerivedVisual(guard(false), "Synthetic", visualRoot(source), "look_blue", { outfit: "blue" }, base)).toThrow("story changed");
  expect(setGlobalSettings).not.toHaveBeenCalled();
  publishDerivedVisual(guard(true), "Synthetic", visualRoot(source), "look_blue", { outfit: "blue" }, base);
  expect(setGlobalSettings).toHaveBeenCalledTimes(1);
});

test("the accepted-source commit re-checks its run before writing settings", () => {
  const preparation = createVisualPreparation({} as RunOwnership) as unknown as { deps: VisualPreparationDeps };
  expect(() => preparation.deps.commit(source, guard(false))).toThrow("draft changed");
  expect(setGlobalSettings).not.toHaveBeenCalled();
  preparation.deps.commit(source, guard(true));
  expect(setGlobalSettings).toHaveBeenCalledTimes(1);
});
