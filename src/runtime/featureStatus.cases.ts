import type { StoryFeatures } from "@engine/featurePolicy";
import type { RoleRouteState } from "./roleHealth";
import type { GlobalSettings } from "./settingsModel";

export interface FeatureStateCase {
  n: number;
  feature: string;
  context: "story" | "no-story";
  seeded: string;
  install?: (settings: GlobalSettings) => void;
  story?: StoryFeatures;
  chat?: StoryFeatures;
  route?: { role: "read" | "inner"; state: RoleRouteState };
  commitments?: boolean;
  words: string[];
  setup?: string[];
}

const DEFAULT_ON = "Default for new stories: on";

export const FEATURE_STATE_CASES: readonly FeatureStateCase[] = [
  { n: 1, feature: "pacing", context: "story", seeded: "install default (on)", words: ["Enabled"] },
  { n: 2, feature: "pacing", context: "no-story", seeded: "install default (Defaults route)", words: [DEFAULT_ON] },
  { n: 3, feature: "pacing", context: "story", seeded: "install master off", install: (s) => { s.pacing.hintEnabled = false; }, words: ["Off on this install"] },
  { n: 4, feature: "pacing", context: "no-story", seeded: "install master off", install: (s) => { s.pacing.hintEnabled = false; }, words: ["Off on this install"] },
  { n: 5, feature: "pacing", context: "story", seeded: "story off", story: { pacing: "off" }, words: ["Turned off by this story"] },
  { n: 6, feature: "pacing", context: "story", seeded: "story off + chat re-enable", story: { pacing: "off" }, chat: { pacing: { enabled: true } }, words: ["Enabled"] },
  { n: 7, feature: "pacing", context: "story", seeded: "chat off", chat: { pacing: "off" }, words: ["Off in this chat"] },
  { n: 8, feature: "meanwhile-proposals", context: "story", seeded: "default auto", words: ["Applies automatically"] },
  { n: 9, feature: "meanwhile-proposals", context: "story", seeded: "chat accept mode review", chat: { meanwhile: { acceptMode: "review" } }, words: ["Review before applying"] },
  { n: 10, feature: "meanwhile-proposals", context: "story", seeded: "story turns it off", story: { meanwhile: "off" }, words: ["Turned off by this story"] },
  { n: 11, feature: "meanwhile-proposals", context: "no-story", seeded: "install master off", install: (s) => { s.featureSwitches = { ...s.featureSwitches, meanwhile: false }; },
    words: ["Off on this install"] },
  { n: 12, feature: "curator-create", context: "story", seeded: "curator on + create false", install: (s) => { s.stagecraft.createEnabled = false; }, words: ["Off on this install"] },
  { n: 13, feature: "curator-create", context: "story", seeded: "curator master off", install: (s) => { s.stagecraft.curatorEnabled = false; }, words: ["Off on this install"] },
  { n: 14, feature: "curator-create", context: "no-story", seeded: "install default", words: ["Default for new stories: enabled"] },
  { n: 15, feature: "inner-voice", context: "story", seeded: "route ready", route: { role: "inner", state: "ok" }, words: ["Enabled"] },
  { n: 16, feature: "inner-voice", context: "story", seeded: "route missing", route: { role: "inner", state: "missing" },
    words: ["Enabled"], setup: ["Missing setup: choose a model"] },
  { n: 17, feature: "inner-voice", context: "story", seeded: "route not answering", route: { role: "inner", state: "not-answering" },
    words: ["Enabled"], setup: ["Fallback: model route unavailable"] },
  { n: 18, feature: "inner-voice", context: "no-story", seeded: "install default", words: [DEFAULT_ON] },
  { n: 19, feature: "memory", context: "story", seeded: "reading on + injection off", install: (s) => { s.memory.enabled = false; }, words: ["Enabled", "Off on this install"] },
  { n: 20, feature: "memory", context: "story", seeded: "reading route outage", route: { role: "read", state: "not-answering" },
    words: ["Enabled", "Enabled"], setup: ["Story reading: Fallback: model route unavailable"] },
  { n: 21, feature: "sprites", context: "story", seeded: "automatic", words: ["Automatic: on when the story directs the stage"] },
  { n: 22, feature: "sprites", context: "story", seeded: "explicit off at install", install: (s) => { s.sprites.explicit = true; s.sprites.enabled = false; }, words: ["Off on this install"] },
  { n: 23, feature: "npc-commitments", context: "story", seeded: "story declares commitments", commitments: true, words: ["In this story"] },
  { n: 24, feature: "npc-commitments", context: "no-story", seeded: "no story", words: ["Needs a story"] },
];
