import type { RuntimeSnapshot } from "./types";

export const MEMORY_SEARCH_FROM = 50;

export const DRAWER_TAB_OF_CONTROL: Readonly<Record<string, "blackboard" | "scheduler">> = { "so-character-life": "blackboard", "so-living-scene-tests": "scheduler" };

export const wardenJudged = (stagecraft: { wardenEnabled?: boolean; wardenAcceptMode?: string }): boolean => Boolean(stagecraft.wardenEnabled) && stagecraft.wardenAcceptMode !== "off";

export const shownPromises = (snapshot: RuntimeSnapshot) => (snapshot.promises?.length ? snapshot.promises : null);

export const shownCarry = (snapshot: RuntimeSnapshot) => (snapshot.carry?.state ? snapshot.carry : null);

export const livingSaveShown = (snapshot: RuntimeSnapshot): boolean => Boolean(snapshot.living?.canSave);

export const memoryEntriesFor = (snapshot: RuntimeSnapshot, authorView: boolean) => (authorView ? snapshot.memory.entries : snapshot.memoryShown ?? snapshot.memory.entries);

export const memorySearchable = (snapshot: RuntimeSnapshot, authorView: boolean): boolean => memoryEntriesFor(snapshot, authorView).length > MEMORY_SEARCH_FROM;

export const shownLife = (snapshot: RuntimeSnapshot) => snapshot.lifeAuthor ?? null;

export const sceneTestsShown = (snapshot: RuntimeSnapshot): boolean => Boolean(snapshot.living?.author?.sceneTest);
