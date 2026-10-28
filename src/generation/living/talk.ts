import type { Checkpoint, StoryTalkDefaults, TalkControl, TalkProfileName } from "@engine/index";

export const LIVING_TALK_FALLBACK: TalkProfileName = "conversation";

const sceneProfile = (profile: TalkProfileName | undefined): TalkProfileName | undefined => (profile === "opening" ? LIVING_TALK_FALLBACK : profile);

export function livingTalkControl(source: Checkpoint | undefined, defaults: StoryTalkDefaults | undefined): TalkControl {
  const inherited = source?.talk_control;
  if (!inherited) return { profile: sceneProfile(defaults?.profile) ?? LIVING_TALK_FALLBACK };
  const control = JSON.parse(JSON.stringify(inherited)) as TalkControl;
  const profile = sceneProfile(control.profile);
  if (profile) control.profile = profile;
  if (control.chain && control.chain.mode === "scripted") {
    const chain = { ...control.chain };
    delete chain.mode;
    delete chain.sequence;
    control.chain = chain;
  }
  return control;
}

export const inheritsTalk = (checkpoint: Checkpoint, expected: TalkControl): boolean =>
  JSON.stringify(checkpoint.talk_control ?? null) === JSON.stringify(expected);
