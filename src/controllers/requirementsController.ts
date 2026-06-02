import type { NormalizedStory } from "@utils/story-validator";
import { getContext } from "@services/stHost/context";
import { subscribeToHostEvent } from "@services/stHost/events";
import { type Lorebook, getWorldInfoSettings } from "@services/stHost/worldInfo";
import {
  createRequirementsState,
  mergeRequirementsState,
  areRequirementStatesEqual,
  type StoryRequirementsState,
} from "@store/requirementsState";
import { storySessionStore } from "@store/storySessionStore";
import { resolveGroupMemberName } from "@utils/groups";
import {
  buildRequirementsState,
  collectMissingLoreEntries,
  computeGlobalLoreStatus,
  computeMissingGroupMembers as computeMissingGroupMembersForContext,
  extractRoleNames,
  extractWorldInfoKeys,
  getChatContextKey as buildChatContextKey,
} from "@utils/story-requirements";

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
  let worldLoreRequestVersion = 0;
  let started = false;
  let state: StoryRequirementsState = createRequirementsState();
  const subscriptions: Array<() => void> = [];

  const emit = () => {
    storySessionStore.getState().setRequirementsState(state);
  };

  const setState = (next: StoryRequirementsState) => {
    if (areRequirementStatesEqual(state, next)) return false;
    state = mergeRequirementsState(createRequirementsState(), next);
    emit();
    return true;
  };

  const computeMissingGroupMembers = (ctx: ReturnType<typeof getContext>): string[] => {
    return computeMissingGroupMembersForContext(ctx, requiredRoleNames, requiredRoleNamesNormalized, resolveGroupMemberName);
  };

  const computeBaseState = (ctx: ReturnType<typeof getContext>) => {
    const currentUserName = ctx?.name1 ?? "";
    const groupChatSelected = Boolean(ctx?.groupId);
    const settings = getWorldInfoSettings();
    const { globalMissing, globalLoreBookPresent } = computeGlobalLoreStatus(story, settings);

    return {
      currentUserName,
      personaDefined: Boolean(currentUserName),
      groupChatSelected,
      missingGroupMembers: computeMissingGroupMembers(ctx),
      globalLoreBookPresent,
      globalLoreBookMissing: globalMissing,
    };
  };

  const getChatContextKey = () => {
    return buildChatContextKey(getContext());
  };

  const buildWorldLoreState = (missing: string[], base: ReturnType<typeof computeBaseState>) => buildRequirementsState(story, {
    ...base,
    worldLoreEntriesPresent: missing.length === 0,
    worldLoreEntriesMissing: missing,
  });

  const refreshSnapshot = () => {
    const requestVersion = ++worldLoreRequestVersion;
    const requestStory = story;
    const requestChatKey = getChatContextKey();
    const ctx = getContext();
    const base = computeBaseState(ctx);
    const isStaleRequest = () => (
      requestVersion !== worldLoreRequestVersion
      || requestStory !== story
      || requestChatKey !== getChatContextKey()
    );

    const commit = (next: StoryRequirementsState) => {
      if (isStaleRequest()) return;
      setState(next);
    };

    if (!requiredWorldInfoKeys.length) {
      commit(buildRequirementsState(story, {
        ...base,
        worldLoreEntriesPresent: true,
        worldLoreEntriesMissing: [],
      }));
      return;
    }

    const settings = getWorldInfoSettings();

    if (!settings?.world_info) {
      commit(buildWorldLoreState(requiredWorldInfoKeys.slice(), base));
      return;
    }

    const { loadWorldInfo } = ctx;
    const globalLorebook = requestStory?.global_lorebook;
    if (!globalLorebook) {
      commit(buildWorldLoreState(requiredWorldInfoKeys.slice(), base));
      return;
    }

    loadWorldInfo(globalLorebook).then((entries) => {
      const lorebook = entries as Lorebook | null;
      if (!lorebook?.entries) {
        commit(buildWorldLoreState(requiredWorldInfoKeys.slice(), base));
        return;
      }

      commit(buildWorldLoreState(collectMissingLoreEntries(requiredWorldInfoKeys, lorebook), base));
    }).catch((err: unknown) => {
      console.warn('[Story - Requirements] loadWorldInfo failed', err);
      commit(buildWorldLoreState(requiredWorldInfoKeys.slice(), base));
    });
  };

  const setStory = (next: NormalizedStory | null | undefined) => {
    story = next ?? null;
    requiredWorldInfoKeys = extractWorldInfoKeys(story);
    const roles = extractRoleNames(story);
    requiredRoleNames = roles.names;
    requiredRoleNamesNormalized = roles.normalized;
    refreshSnapshot();
  };

  const handleChatContextChanged = () => {
    refreshSnapshot();
  };

  const reloadPersona = async () => {
    refreshSnapshot();
  };

  const start = () => {
    if (started) return;
    const { eventTypes } = getContext();
    started = true;

    const worldInfoHandler = () => {
      refreshSnapshot();
    };

    [
      eventTypes.WORLDINFO_UPDATED,
      eventTypes.WORLDINFO_SETTINGS_UPDATED,
      eventTypes.WORLDINFO_ENTRIES_LOADED,
    ].forEach((eventName) => {
      subscriptions.push(subscribeToHostEvent(eventName, worldInfoHandler));
    });

    if (eventTypes.GROUP_UPDATED) {
      subscriptions.push(
        subscribeToHostEvent(eventTypes.GROUP_UPDATED, () => { refreshSnapshot(); })
      );
    }

    refreshSnapshot();
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
    worldLoreRequestVersion += 1;
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
