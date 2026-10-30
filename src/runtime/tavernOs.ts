import type { NormalizedStory } from "@engine/index";

let readOn: () => boolean = () => false;

export const readTavernOsWith = (read: () => boolean): (() => void) => {
  readOn = read;
  return () => {
    if (readOn === read) readOn = () => false;
  };
};

export const tavernOsFor = (story: NormalizedStory | null, on: boolean): boolean => Boolean(story) && on;

export const tavernOs = (story: NormalizedStory | null): boolean => tavernOsFor(story, readOn());
