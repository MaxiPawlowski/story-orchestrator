import type { RuntimeSnapshot } from "./types";

export interface PlayingStory {
  id: string;
  title: string;
  inLibrary: boolean;
}

export function playingStory(snapshot: Pick<RuntimeSnapshot, "storyId" | "storyTitle" | "library">): PlayingStory | null {
  if (!snapshot.storyId) return null;
  const listed = snapshot.library.find((story) => story.id === snapshot.storyId);
  if (listed) return { id: listed.id, title: listed.title, inLibrary: true };
  return { id: snapshot.storyId, title: snapshot.storyTitle ?? snapshot.storyId, inLibrary: false };
}

export const playingLine = (playing: PlayingStory | null): string => {
  if (!playing) return "No story is playing in this chat yet.";
  return playing.inLibrary
    ? `Playing "${playing.title}".`
    : `Playing "${playing.title}" from this chat's pinned copy. It is no longer in the library.`;
};
