import { fnv1a } from "@utils/fnv";

const stable = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
};

export const stableStringify = stable;

export { fnv1a };

export function hashStory(value: unknown): string {
  return `story-${fnv1a(stable(value))}`;
}

const revisions = new WeakMap<object, string>();

export const storyRevision = (story: object): string => {
  const known = revisions.get(story);
  if (known !== undefined) return known;
  const revision = fnv1a(stable(story));
  revisions.set(story, revision);
  return revision;
};
