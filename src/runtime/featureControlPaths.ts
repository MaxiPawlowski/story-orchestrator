import type { StoryFeatureId } from "@engine/featurePolicy";

export interface FeatureControlPath {
  field: string;
  path: string;
}

const control = (field: string, path: string): FeatureControlPath => ({ field, path });
const enabled = (path: string) => control("enabled", path);
const mode = (path: string) => control("acceptMode", path);

export const FEATURE_CONTROL_PATHS: Record<StoryFeatureId, readonly FeatureControlPath[]> = {
  reading: [enabled("extraction.enabled"), control("cadence", "extraction.cadence"), control("stabilityLag", "extraction.stabilityLag")],
  memory: [enabled("memory.enabled")],
  chapters: [
    enabled("memory.chapters.seal"),
    control("recap", "memory.chapters.recap"),
    control("storySoFar", "memory.chapters.storySoFar"),
    control("fold", "memory.chapters.fold"),
    control("compact", "memory.chapters.compact")
  ],
  continuity: [enabled("stagecraft.wardenEnabled"), mode("stagecraft.wardenAcceptMode")],
  agency: [enabled("featureSwitches.agency"), mode("stagecraft.agencyAcceptMode")],
  pacing: [enabled("pacing.hintEnabled")],
  thinking: [enabled("featureSwitches.thinking"), control("effort", "extraction.replyEffort")],
  speakers: [enabled("talk.enabled")],
  voices: [enabled("talk.chain.enabled"), control("max", "talk.chain.max")],
  skip: [enabled("talk.skipAhead")],
  inner: [enabled("memory.innerBeat"), control("fanOut", "memory.innerFanOut"), control("harvestReasoning", "memory.harvestReasoning")],
  delivery: [enabled("characters.delivery"), control("repetition", "characters.deliveryRepetition")],
  polish: [enabled("characters.polish"), control("mode", "characters.polishMode")],
  cues: [enabled("characters.cues")],
  promises: [enabled("memory.promises")],
  deferrals: [enabled("memory.deferrals"), control("outOfPrompt", "memory.deferredOutOfPrompt")],
  witness: [enabled("memory.witness")],
  rumors: [enabled("memory.rumors")],
  echoes: [enabled("characters.echoes")],
  patterns: [enabled("memory.patterns")],
  meanwhile: [enabled("featureSwitches.meanwhile"), mode("stagecraft.meanwhileAcceptMode")],
  living: [enabled("stagecraft.livingEnabled")],
  branching: [enabled("stagecraft.branchingEnabled")],
  prefetch: [enabled("stagecraft.prefetchEnabled")],
  curator: [
    enabled("stagecraft.curatorEnabled"),
    mode("stagecraft.acceptMode"),
    control("create", "stagecraft.createEnabled"),
    control("requireMeasured", "stagecraft.createRequireMeasured")
  ],
  memoryLore: [enabled("worldInfo.scanMemory")],
  lateLore: [enabled("worldInfo.lateLore"), control("depth", "worldInfo.lateLoreDepth")],
  illustrations: [enabled("image.enabled"), control("mode", "image.automation.mode"), control("everyN", "image.automation.everyN")],
  sprites: [enabled("sprites.enabled"), control("stage", "sprites.stage")],
  poses: [enabled("sprites.poses")],
  cardState: [enabled("sprites.cardOverlay")],
};
