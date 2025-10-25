import type { NormalizedStory } from "@utils/story-validator";
import {
  getContext,
  Lorebook,
  getWorldInfoSettings,
} from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import {
  createRequirementsState,
  mergeRequirementsState,
  areRequirementStatesEqual,
  type StoryRequirementsState,
} from "@store/requirementsState";
import { storySessionStore } from "@store/storySessionStore";
import { resolveGroupMemberName } from "@utils/groups";
import { normalizeName } from "@utils/string";

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
  let requiredRoleNames: string[] = [];
  let requiredRoleNamesNormalized: string[] = [];
  let started = false;
  let state: StoryRequirementsState = createRequirementsState();
  const subscriptions: Array<() => void> = [];

  const emit = () => {
    storySessionStore.getState().setRequirementsState(state);
  };

  const updateState = (patch: Partial<StoryRequirementsState>, recompute = true) => {
    const next = mergeRequirementsState(state, patch);
    if (areRequirementStatesEqual(state, next)) return false;
    state = next; emit(); if (recompute) recomputeReady(); return true;
  };

  const recomputeReady = () => {
    const allMembersPresent = (state.missingGroupMembers?.length ?? 0) === 0;
    const ready = Boolean(
      story
      && state.personaDefined
      && state.groupChatSelected
      && allMembersPresent
      && state.worldLoreEntriesPresent
      && state.globalLoreBookPresent,
    );
    // avoid infinite loop: call updateState without re-triggering recompute
    updateState({ requirementsReady: ready }, false);
  };

  const refreshGroupChat = () => {
    const ctx = getContext();
    updateState({ groupChatSelected: Boolean(ctx?.groupId) });
    refreshGroupMembers();
  };

  const reloadPersona = async () => {
    const { name1 } = getContext();
    updateState({
      currentUserName: name1 ?? '',
      personaDefined: Boolean(name1)
    });
  };

  const refreshGroupMembers = () => {
    if (!requiredRoleNames.length) {
      updateState({ missingGroupMembers: [] });
      return;
    }

    const ctx = getContext();
    const groupId = ctx?.groupId?.toString().trim();
    if (!groupId) {
      updateState({ missingGroupMembers: requiredRoleNames.slice() });
      return;
    }

    const groups = ctx?.groups ?? [];
    const currentGroup = groups.find((g: any) => g?.id?.toString().trim() === groupId);

    if (!currentGroup?.members?.length) {
      updateState({ missingGroupMembers: requiredRoleNames.slice() });
      return;
    }

    const groupMembers = currentGroup.members
      .map((member: unknown) => normalizeName(resolveGroupMemberName(member), { stripExtension: true }))
      .filter(Boolean);

    const missing = requiredRoleNamesNormalized
      .map((norm, idx) => groupMembers.includes(norm) ? null : requiredRoleNames[idx])
      .filter(Boolean) as string[];

    updateState({ missingGroupMembers: missing });
  };

  const computeGlobalMissing = (settings: any): { globalMissing: string[]; globalLoreBookPresent: boolean } => {
    const globalMissing: string[] = [];
    const globalSelect = settings?.world_info?.globalSelect ?? [];
    const lorebook = story?.global_lorebook;

    if (lorebook) {
      const want = lorebook.toLowerCase();
      const found = globalSelect.some((g: string) => g.trim().toLowerCase() === want);
      if (!found) globalMissing.push(lorebook);
    }

    return { globalMissing, globalLoreBookPresent: globalMissing.length === 0 };
  };

  const refreshWorldLore = () => {
    if (!requiredWorldInfoKeys.length) {
      updateState({ worldLoreEntriesPresent: true, worldLoreEntriesMissing: [] });
      return;
    }

    const settings = getWorldInfoSettings();
    const { globalMissing, globalLoreBookPresent } = computeGlobalMissing(settings);

    if (!settings?.world_info) {
      updateState({
        worldLoreEntriesPresent: false,
        worldLoreEntriesMissing: requiredWorldInfoKeys.slice(),
        globalLoreBookPresent,
        globalLoreBookMissing: globalMissing
      });
      return;
    }

    const { loadWorldInfo } = getContext();
    const globalLorebook = story?.global_lorebook;
    if (!globalLorebook) {
      updateState({
        worldLoreEntriesPresent: false,
        worldLoreEntriesMissing: requiredWorldInfoKeys.slice(),
        globalLoreBookPresent,
        globalLoreBookMissing: globalMissing
      });
      return;
    }

    loadWorldInfo(globalLorebook).then((entries: Object | null) => {
      const lorebook = entries as Lorebook | null;
      if (!lorebook?.entries) {
        updateState({
          worldLoreEntriesPresent: false,
          worldLoreEntriesMissing: requiredWorldInfoKeys.slice(),
          globalLoreBookPresent,
          globalLoreBookMissing: globalMissing
        });
        return;
      }

      const seen = new Set(
        Object.values(lorebook.entries)
          .map(e => e?.comment?.trim().toLowerCase())
          .filter(Boolean)
      );

      const missing = requiredWorldInfoKeys.filter(name => !seen.has(name.toLowerCase()));
      updateState({
        worldLoreEntriesPresent: missing.length === 0,
        worldLoreEntriesMissing: missing,
        globalLoreBookPresent,
        globalLoreBookMissing: globalMissing
      });
    }).catch((err: unknown) => {
      console.warn('[Story - Requirements] loadWorldInfo failed', err);
      updateState({
        worldLoreEntriesPresent: false,
        worldLoreEntriesMissing: requiredWorldInfoKeys.slice(),
        globalLoreBookPresent,
        globalLoreBookMissing: globalMissing
      });
    });
  };

  const extractWorldInfoKeys = (input: NormalizedStory | null): string[] => {
    if (!input) return [];
    const keys = new Set<string>();

    for (const checkpoint of input.checkpoints) {
      const wi = checkpoint.onActivate?.world_info;
      if (!wi) continue;

      [...(wi.activate ?? []), ...(wi.deactivate ?? [])].forEach(name => {
        if (name) keys.add(name);
      });
    }

    return Array.from(keys);
  };

  const extractRoleNames = (input: NormalizedStory | null): { names: string[]; normalized: string[] } => {
    if (!input?.roles) return { names: [], normalized: [] };

    const names = Object.values(input.roles)
      .filter(name => typeof name === 'string' && name.trim())
      .map(name => name!.trim());

    const normalized = names
      .map(name => normalizeName(name, { stripExtension: true }))
      .filter(Boolean);

    return { names, normalized };
  };

  const setStory = (next: NormalizedStory | null | undefined) => {
    story = next ?? null;
    requiredWorldInfoKeys = extractWorldInfoKeys(story);
    const roles = extractRoleNames(story);
    requiredRoleNames = roles.names;
    requiredRoleNamesNormalized = roles.normalized;
    refreshGroupMembers();
    refreshWorldLore();
    recomputeReady();
  };

  const handleChatContextChanged = () => {
    refreshGroupChat();
    reloadPersona();
  };

  const start = () => {
    if (started) return;
    const { eventSource, eventTypes } = getContext();
    started = true;

    const worldInfoHandler = () => {
      refreshWorldLore();
    };

    [
      eventTypes.WORLDINFO_UPDATED,
      eventTypes.WORLDINFO_SETTINGS_UPDATED,
      eventTypes.WORLDINFO_ENTRIES_LOADED,
    ].forEach((eventName) => {
      subscriptions.push(
        subscribeToEventSource({
          source: eventSource,
          eventName,
          handler: worldInfoHandler,
        })
      );
    });

    if (eventTypes.GROUP_UPDATED) {
      subscriptions.push(
        subscribeToEventSource({
          source: eventSource,
          eventName: eventTypes.GROUP_UPDATED,
          handler: () => { refreshGroupMembers(); },
        })
      );
    }

    refreshGroupChat();
    reloadPersona();
    refreshWorldLore();
  };

  const dispose = () => {
    while (subscriptions.length) {
      const off = subscriptions.pop();
      try {
        off?.();
      } catch (err) {
        console.warn("[Story - Requirements] unsubscribe failed", err);
      }
    }
    started = false;
    story = null;
    requiredWorldInfoKeys = [];
    requiredRoleNames = [];
    requiredRoleNamesNormalized = [];
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
