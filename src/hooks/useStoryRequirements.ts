import { useCallback, useEffect, useMemo, useState } from "react";
import type { NormalizedStory } from "@services/SchemaService/story-validator";
import type { Role } from "@services/SchemaService/story-schema";
import { eventSource, event_types, getContext, getWorldInfoSettings, getCharacterIdByName } from "@services/SillyTavernAPI";

export interface StoryRequirementsResult {
  requirementsReady: boolean;
  currentUserName: string;
  personaDefined: boolean;
  groupChatSelected: boolean;
  worldLorePresent: boolean;
  worldLoreMissing: string[];
  requiredRolesPresent: boolean;
  missingRoles: string[];
  onPersonaReload: () => Promise<void> | void;
}

export function useStoryRequirements(story: NormalizedStory | null | undefined): StoryRequirementsResult {
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [personaDefined, setPersonaDefined] = useState<boolean>(true);
  const [groupChatSelected, setGroupChatSelected] = useState<boolean>(false);
  const [worldLorePresent, setWorldLorePresent] = useState<boolean>(true);
  const [worldLoreMissing, setWorldLoreMissing] = useState<string[]>([]);
  const [requiredRolesPresent, setRequiredRolesPresent] = useState<boolean>(false);
  const [missingRoles, setMissingRoles] = useState<string[]>([]);

  const handlePersonaReload = useCallback(async () => {
    try {
      const { name1 } = getContext();
      setCurrentUserName(name1 ?? "");
      setPersonaDefined(Boolean(name1));
    } catch (e) {
      console.warn("[StoryRequirements] onPersonaReload failed", e);
      setCurrentUserName("");
      setPersonaDefined(false);
    }
  }, []);

  const requiredWorldInfoKeys = useMemo(() => {
    if (!story) return [] as string[];
    const keys = new Set<string>();
    story.checkpoints.forEach((cp) => {
      const wi = cp.onActivate?.world_info;
      if (wi === undefined || wi === null) return;
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
  }, [story]);

  const refreshRoles = useCallback(() => {
    if (!story || !story.roles) {
      setMissingRoles([]);
      setRequiredRolesPresent(true);
      return;
    }
    try {
      const roles = story.roles as Partial<Record<Role, string>>;
      const requiredNames = Object.values(roles)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .map((name) => name.trim());
      if (requiredNames.length === 0) {
        setMissingRoles([]);
        setRequiredRolesPresent(true);
        return;
      }
      const missing: string[] = [];
      for (const name of requiredNames) {
        const id = typeof getCharacterIdByName === "function" ? getCharacterIdByName(name) : undefined;
        if (id === undefined) missing.push(name);
      }
      setMissingRoles(missing);
      setRequiredRolesPresent(missing.length === 0);
    } catch (e) {
      console.warn("[StoryRequirements] role validation failed", e);
      setMissingRoles([]);
      setRequiredRolesPresent(false);
    }
  }, [story]);

  const refreshWorldLore = useCallback(() => {
    if (!requiredWorldInfoKeys.length) {
      setWorldLorePresent(true);
      setWorldLoreMissing([]);
      return;
    }
    try {
      const settings = typeof getWorldInfoSettings === "function" ? getWorldInfoSettings() : null;
      if (!settings || !settings.world_info) {
        setWorldLorePresent(false);
        setWorldLoreMissing(requiredWorldInfoKeys);
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
          for (const value of Object.values(entry)) {
            if (value && (Array.isArray(value) || typeof value === "object")) {
              stack.push(value);
            }
          }
        }
      }
      const missing = requiredWorldInfoKeys.filter(
        (name) => !seen.has(name.trim().toLowerCase()),
      );
      setWorldLorePresent(missing.length === 0);
      setWorldLoreMissing(missing);
    } catch (e) {
      console.warn("[StoryRequirements] world lore validation failed", e);
      setWorldLorePresent(false);
      setWorldLoreMissing([]);
    }
  }, [requiredWorldInfoKeys]);

  useEffect(() => {
    const listeners: Array<() => void> = [];

    const subscribe = (eventName: string, handler: (...args: any[]) => void) => {
      try {
        const off = eventSource?.on?.(eventName, handler);
        if (typeof off === "function") {
          listeners.push(off);
        } else if (eventSource?.off) {
          listeners.push(() => eventSource.off(eventName, handler));
        } else if ((eventSource as any)?.removeListener) {
          listeners.push(() => (eventSource as any).removeListener(eventName, handler));
        }
      } catch (e) {
        console.warn("[StoryRequirements] subscribe failed", eventName, e);
      }
    };

    const onChatChanged = async () => {
      try {
        const { groupId } = getContext();
        setGroupChatSelected(Boolean(groupId));
      } catch (e) {
        console.warn("[StoryRequirements] onChatChanged failed", e);
        setGroupChatSelected(false);
      }
      await handlePersonaReload();
      refreshRoles();
    };

    const onWorldInfoEvent = () => {
      refreshWorldLore();
    };

    subscribe(event_types.CHAT_CHANGED, onChatChanged);
    subscribe(event_types.WORLDINFO_UPDATED, onWorldInfoEvent);
    subscribe(event_types.WORLDINFO_SETTINGS_UPDATED, onWorldInfoEvent);
    subscribe(event_types.WORLDINFO_ENTRIES_LOADED, onWorldInfoEvent);

    onChatChanged();
    refreshWorldLore();

    return () => {
      listeners.forEach((off) => {
        try {
          off();
        } catch (err) {
          console.warn("[StoryRequirements] unsubscribe failed", err);
        }
      });
    };
  }, [handlePersonaReload, refreshRoles, refreshWorldLore]);

  const requirementsReady = useMemo(() => (
    Boolean(story && personaDefined && groupChatSelected && requiredRolesPresent)
  ), [story, personaDefined, groupChatSelected, requiredRolesPresent]);

  return {
    requirementsReady,
    currentUserName,
    personaDefined,
    groupChatSelected,
    worldLorePresent,
    worldLoreMissing,
    requiredRolesPresent,
    missingRoles,
    onPersonaReload: handlePersonaReload,
  };
}

export default useStoryRequirements;
