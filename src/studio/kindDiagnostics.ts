import { STORY_KINDS, type StoryV2 } from "@engine/index";

type KindCode = "story-kind-invalid";

export const KIND_CONSEQUENCES: Record<KindCode, string> = {
  "story-kind-invalid": "The story cannot load, because it says it is neither a saga nor a single story.",
};

export interface KindRun {
  draft: StoryV2;
  push: (code: KindCode, severity: "blocking", path: string, message: string) => void;
}

export const checkStoryKind = ({ draft, push }: KindRun) => {
  const kind: unknown = draft.kind;
  if (kind !== undefined && !(STORY_KINDS as readonly unknown[]).includes(kind)) push("story-kind-invalid", "blocking", "kind", `kind must be "saga" or "story", not '${String(kind)}'`);
};
