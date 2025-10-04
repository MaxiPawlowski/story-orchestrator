// requirementsController.ts
import type { NormalizedStory } from "@utils/story-validator";
import type { Role } from "@utils/story-schema";
import {
  eventSource,
  event_types,
  getCharacterIdByName,
  getContext,
  getWorldInfoSettings,
  // You may also export Lorebook from SillyTavernAPI; we provide a local minimal type
  // to avoid over-tight coupling and to ensure scanning works even if the API grows.
} from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import {
  createRequirementsState,
  mergeRequirementsState,
  areRequirementStatesEqual,
  type StoryRequirementsState,
} from "@store/requirementsState";
import { storySessionStore } from "@store/storySessionStore";

/** Minimal types used by this module. Keep them small and future-proof. */
export interface Lorebook {
  // Numeric-looking keys come in as strings: "0", "1", ...
  entries: Record<string, LoreEntry>;
}
export interface LoreEntry {
  comment?: string | null;
  [key: string]: unknown;
}

export interface RequirementsController {
  start(): void;
  dispose(): void;
  setStory(story: NormalizedStory | null | undefined): void;
  handleChatContextChanged(): void;
  reloadPersona(): Promise<void> | void;
}

export const createRequirementsController = (): RequirementsController => {
  let story: NormalizedStory | null = null;
  let requiredWorldInfoKeys: string[] = [];
  let started = false;
  let state: StoryRequirementsState = createRequirementsState();
  const subscriptions: Array<() => void> = [];

  const emit = () => {
    storySessionStore.getState().setRequirementsState(state);
  };

  const updateState = (patch: Partial<StoryRequirementsState>) => {
    const next = mergeRequirementsState(state, patch);
    if (areRequirementStatesEqual(state, next)) return false;
    state = next;
    emit();
    return true;
  };

  const recomputeReady = () => {
    const ready = Boolean(
      story &&
      state.personaDefined &&
      state.groupChatSelected &&
      state.requiredRolesPresent &&
      state.worldLorePresent &&
      state.globalLorePresent
    );
    updateState({ requirementsReady: ready });
  };

  const refreshGroupChat = () => {
    try {
      const ctx = getContext();
      const groupSelected = Boolean(ctx?.groupId);
      if (updateState({ groupChatSelected: groupSelected })) {
        recomputeReady();
      }
    } catch (err) {
      console.warn("[Requirements] refreshGroupChat failed", err);
      if (updateState({ groupChatSelected: false })) recomputeReady();
    }
  };

  const reloadPersona = async () => {
    try {
      const { name1 } = getContext();
      const changed = updateState({
        currentUserName: name1 ?? "",
        personaDefined: Boolean(name1),
      });
      if (changed) recomputeReady();
    } catch (err) {
      console.warn("[Requirements] reloadPersona failed", err);
      if (updateState({ currentUserName: "", personaDefined: false })) recomputeReady();
    }
  };

  const refreshRoles = () => {
    if (!story || !story.roles) {
      if (updateState({ missingRoles: [], requiredRolesPresent: true })) recomputeReady();
      return;
    }

    try {
      const roles = story.roles as Partial<Record<Role, string>>;
      const requiredNames = Object.values(roles)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .map((name) => name.trim());

      if (requiredNames.length === 0) {
        if (updateState({ missingRoles: [], requiredRolesPresent: true })) recomputeReady();
        return;
      }

      const missing: string[] = [];
      for (const name of requiredNames) {
        const id = typeof getCharacterIdByName === "function" ? getCharacterIdByName(name) : undefined;
        if (id === undefined) missing.push(name);
      }

      if (updateState({ missingRoles: missing, requiredRolesPresent: missing.length === 0 })) {
        recomputeReady();
      }
    } catch (err) {
      console.warn("[Requirements] refreshRoles failed", err);
      if (updateState({ missingRoles: [], requiredRolesPresent: false })) recomputeReady();
    }
  };

  const refreshWorldLore = () => {
    if (!requiredWorldInfoKeys.length) {
      updateState({ worldLorePresent: true, worldLoreMissing: [] });
      return;
    }

    try {
      const settings = getWorldInfoSettings();
      console.log("[Story Requirements] world info", settings);

      const globalMissing: string[] = [];
      try {
        const globalSelect = settings?.world_info?.globalSelect;
        if (story && typeof story.global_lorebook === "string" && story.global_lorebook.trim()) {
          const want = story.global_lorebook.trim().toLowerCase();
          let found = false;
          if (Array.isArray(globalSelect)) {
            for (const item of globalSelect) {
              if (item.trim().toLowerCase() === want) {
                found = true;
                break;
              }
            }
          }
          if (!found) globalMissing.push(story.global_lorebook.trim());
        }
      } catch {
        // ignore; handled by the default "missing" flow below
      }

      if (!settings || !settings.world_info) {
        updateState({
          worldLorePresent: false,
          worldLoreMissing: requiredWorldInfoKeys.slice(),
          globalLorePresent: globalMissing.length === 0,
          globalLoreMissing: globalMissing,
        });
        return;
      }

      const { loadWorldInfo } = getContext();
      console.log("[Story Requirements] loading world info entries", loadWorldInfo);

      loadWorldInfo(story?.global_lorebook).then((allEntries: Lorebook) => {
        console.log("[Story Requirements] scanning world info entries", allEntries, story?.global_lorebook);

        // Guard against unexpected shapes
        if (!allEntries || typeof allEntries !== "object" || !allEntries.entries) {
          updateState({
            worldLorePresent: false,
            worldLoreMissing: requiredWorldInfoKeys.slice(),
            globalLorePresent: globalMissing.length === 0,
            globalLoreMissing: globalMissing,
          });
          return;
        }

        // ✅ entries is an object; iterate over its values
        const seen = new Set<string>();
        for (const entry of Object.values(allEntries.entries)) {
          const c = typeof entry?.comment === "string" ? entry.comment.trim() : "";
          if (c) seen.add(c.toLowerCase());
        }

        const missing = requiredWorldInfoKeys.filter(
          (name) => !seen.has(name.trim().toLowerCase())
        );

        updateState({
          worldLorePresent: missing.length === 0,
          worldLoreMissing: missing,
          globalLorePresent: globalMissing.length === 0,
          globalLoreMissing: globalMissing,
        });
      }).catch((err: unknown) => {
        console.warn("[Requirements] loadWorldInfo failed", err);
        updateState({
          worldLorePresent: false,
          worldLoreMissing: requiredWorldInfoKeys.slice(),
          globalLorePresent: globalMissing.length === 0,
          globalLoreMissing: globalMissing,
        });
      });

    } catch (err) {
      console.warn("[Requirements] refreshWorldLore failed", err);
      updateState({
        worldLorePresent: false,
        worldLoreMissing: requiredWorldInfoKeys.slice(),
        globalLorePresent: false,
        globalLoreMissing: [],
      });
    }
  };

  const extractWorldInfoKeys = (input: NormalizedStory | null): string[] => {
    if (!input) return [];
    const keys = new Set<string>();
    input.checkpoints.forEach((checkpoint) => {
      const wi = checkpoint.onActivate?.world_info;
      if (!wi) return;
      const push = (list?: string[]) => {
        if (!Array.isArray(list)) return;
        list.forEach((name) => {
          if (typeof name === "string" && name.trim()) keys.add(name.trim());
        });
      };
      push(wi.activate);
      push(wi.deactivate);
      // include make_constant if present (older schema support)
      if (Array.isArray((wi as any).make_constant)) push((wi as any).make_constant as string[]);
    });
    return Array.from(keys);
  };

  const setStory = (next: NormalizedStory | null | undefined) => {
    story = next ?? null;
    requiredWorldInfoKeys = extractWorldInfoKeys(story);
    refreshRoles();
    refreshWorldLore();
    recomputeReady();
  };

  const handleChatContextChanged = () => {
    refreshGroupChat();
    void reloadPersona();
    refreshRoles();
  };

  const start = () => {
    if (started) return;
    started = true;

    const worldInfoHandler = () => {
      refreshWorldLore();
    };

    [
      event_types.WORLDINFO_UPDATED,
      event_types.WORLDINFO_SETTINGS_UPDATED,
      event_types.WORLDINFO_ENTRIES_LOADED,
    ].forEach((eventName) => {
      subscriptions.push(
        subscribeToEventSource({
          source: eventSource,
          eventName,
          handler: worldInfoHandler,
        })
      );
    });

    refreshGroupChat();
    void reloadPersona();
    refreshRoles();
    refreshWorldLore();
  };

  const dispose = () => {
    while (subscriptions.length) {
      const off = subscriptions.pop();
      try {
        off?.();
      } catch (err) {
        console.warn("[Requirements] unsubscribe failed", err);
      }
    }
    started = false;
    story = null;
    requiredWorldInfoKeys = [];
    state = createRequirementsState();
    emit();
  };

  return {
    start,
    dispose,
    setStory,
    handleChatContextChanged,
    reloadPersona,
  };
};
