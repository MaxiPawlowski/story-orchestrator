import type { RuntimeSnapshot } from "@runtime/types";

export const authoringSettings = (snapshot: RuntimeSnapshot): boolean => snapshot.ui.authorView || !snapshot.storyId;
