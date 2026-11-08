import type { Story } from "@engine/schema";
import type { StoryFeatures } from "@engine/featurePolicy";

type RecordSwitch = (story: Pick<Story, "features" | "reasoning" | "polish"> | null, overrides: StoryFeatures | undefined) => boolean;

let read: RecordSwitch = () => true;

export const setRecordSwitch = (next: RecordSwitch): void => { read = next; };

export const storyRecordOn: RecordSwitch = (story, overrides) => read(story, overrides);
