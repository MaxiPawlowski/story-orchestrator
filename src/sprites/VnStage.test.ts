import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VnStage } from "./VnStage";
import type { SpriteStage } from "./stage";
import type { StageActor, StageView } from "./stageTypes";
import { defaultSpriteSettings } from "./settings";
import { stageMotion } from "./motion/budget";

jest.mock("react", () => ({ ...jest.requireActual("react"), default: jest.requireActual("react"),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));
jest.mock("@utils/lazyRetry", () => ({ lazyRetry: () => (props: { name?: string; binding?: { source: string } }) =>
  props.binding ? React.createElement("canvas", { "data-head": props.name, "data-source": props.binding.source }) : null }));

const actor = (name: string, patch: Partial<StageActor> = {}): StageActor => ({
  name, avatar: `${name}.png`, label: "neutral", path: `/${name}/posed.png`, set: "lp_coat", pose: "sit_chair", spotlight: false,
  liveHead: { member: name, look: "lp_coat", artHash: "a".repeat(64), source: `/${name}/posed.png`, manifest: "/head.json" }, ...patch,
});

function render(actors: StageActor[], patch: Partial<StageView> = {}): string {
  const view: StageView = { actors, visible: true, placement: "vn", waitsForVn: false, speaking: null, talker: null,
    framing: "close", settings: defaultSpriteSettings(), activation: "story", capability: "present", reducedMotion: false,
    motion: stageMotion({ effects: "full", hostReduced: false, osReduced: false, storyMotion: true }), active: true, headSession: "chat", ...patch };
  const stage = { view: () => view, subscribe: () => () => {}, beginHeadRun: () => {}, boundary: () => 0 } as unknown as SpriteStage;
  return renderToStaticMarkup(React.createElement(VnStage, { stage }));
}

test("a posed close shot mounts its matching live head over the selected image; no rig keeps the image", () => {
  const posed = actor("Arin");
  const live = render([posed]);
  expect(live).toContain('src="/Arin/posed.png"');
  expect(live).toContain('data-head="Arin"');
  expect(live).toContain('data-source="/Arin/posed.png"');
  expect(live.indexOf('<img')).toBeLessThan(live.indexOf('<canvas'));
  const fallback = render([{ ...posed, liveHead: undefined }]);
  expect(fallback).toContain('src="/Arin/posed.png"');
  expect(fallback).not.toContain('<canvas');
  expect(render([posed], { settings: { ...defaultSpriteSettings(), liveHead: false } })).not.toContain('<canvas');
});

test("per-member framing chooses one close head, with spotlight then speaker precedence", () => {
  const full = actor("Full", { spotlight: true, framing: "full" });
  const close = actor("Close", { framing: "close" });
  expect(render([full, close], { framing: "full", speaking: "Full" })).toContain('data-head="Close"');
  expect(render([full, close], { framing: "full" })).not.toContain('data-head="Full"');
  const two = render([actor("First"), actor("Second")], { speaking: "Second" });
  expect(two).toContain('data-head="Second"');
  expect(two.match(/<canvas/g)).toHaveLength(1);
  const spotlit = render([actor("First", { spotlight: true }), actor("Second")], { speaking: "Second" });
  expect(spotlit).toContain('data-head="First"');
  expect(spotlit.match(/<canvas/g)).toHaveLength(1);
  expect(render([actor("Full", { framing: "full" })])).not.toContain('<canvas');
});
