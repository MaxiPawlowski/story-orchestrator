import type { NormalizedStory } from "@utils/story-validator";
import type { Role } from "@utils/story-schema";
import {
  eventSource,
  event_types,
  getCharacterIdByName,
  getContext,
  getWorldInfoSettings,
} from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import {
  createRequirementsState,
  mergeRequirementsState,
  areRequirementStatesEqual,
  type StoryRequirementsState,
} from "@/store/requirementsState";
import { storySessionStore } from "@/store/storySessionStore";

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
    const ready = Boolean(story && state.personaDefined && state.groupChatSelected && state.requiredRolesPresent);
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

      if (updateState({ missingRoles: missing, requiredRolesPresent: missing.length === 0 })) recomputeReady();
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
      const settings = typeof getWorldInfoSettings === "function" ? getWorldInfoSettings() : null;
      if (!settings || !settings.world_info) {
        updateState({ worldLorePresent: false, worldLoreMissing: requiredWorldInfoKeys.slice() });
        return;
      }

      const seen = new Set<string>();
      const stack: any[] = [settings.world_info];
      const visited = new Set<any>();

      while (stack.length) {
        const current = stack.pop();
        if (!current || visited.has(current)) continue;
        visited.add(current);

        if (Array.isArray(current)) {
          current.forEach((item) => stack.push(item));
          continue;
        }

        if (typeof current === "object") {
          const entry: any = current;
          if (typeof entry.title === "string" && entry.title.trim()) {
            seen.add(entry.title.trim().toLowerCase());
          }
          if (Array.isArray(entry.keys)) {
            entry.keys.forEach((key: any) => {
              if (typeof key === "string" && key.trim()) {
                seen.add(key.trim().toLowerCase());
              }
            });
          }
          if (entry.id !== undefined && entry.id !== null) {
            seen.add(String(entry.id).trim().toLowerCase());
          }
          Object.values(entry).forEach((value) => {
            if (value && (Array.isArray(value) || typeof value === "object")) {
              stack.push(value);
            }
          });
        }
      }

      const missing = requiredWorldInfoKeys.filter(
        (name) => !seen.has(name.trim().toLowerCase()),
      );
      updateState({ worldLorePresent: missing.length === 0, worldLoreMissing: missing });
    } catch (err) {
      console.warn("[Requirements] refreshWorldLore failed", err);
      updateState({ worldLorePresent: false, worldLoreMissing: [] });
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
      push(wi.make_constant);
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
      subscriptions.push(subscribeToEventSource({
        source: eventSource,
        eventName,
        handler: worldInfoHandler,
      }));
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
