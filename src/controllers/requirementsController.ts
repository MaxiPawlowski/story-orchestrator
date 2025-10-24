// requirementsController.ts
import type { NormalizedStory } from "@utils/story-validator";
import type { Role } from "@utils/story-schema";
import {
  eventSource,
  event_types,
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
import { normalizeName } from "@utils/story-validator";

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

const resolveGroupMemberName = (member: unknown): string => {
  if (typeof member === 'string') return member;
  if (typeof member === 'number') return String(member);
  if (member && typeof member === 'object') {
    const source = (member as Record<string, unknown>);
    const candidate = source.name ?? source.display_name ?? source.id ?? "";
    return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : "";
  }
  return "";
};

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
    try {
      const ctx = getContext();
      updateState({ groupChatSelected: Boolean(ctx?.groupId) });
    }
    catch (err) {
      console.warn('[Requirements] refreshGroupChat failed', err);
      updateState({ groupChatSelected: false });
    }
    refreshGroupMembers();
  };

  const reloadPersona = async () => {
    try { const { name1 } = getContext(); updateState({ currentUserName: name1 ?? '', personaDefined: Boolean(name1) }); }
    catch (err) { console.warn('[Requirements] reloadPersona failed', err); updateState({ currentUserName: '', personaDefined: false }); }
  };

  const refreshGroupMembers = () => {
    if (!requiredRoleNames.length) {
      updateState({ missingGroupMembers: [] });
      return;
    }

    try {
      const ctx = getContext();
      const groupIdRaw = ctx?.groupId;
      const groupId = String(groupIdRaw ?? "").trim();
      if (!groupId) {
        updateState({ missingGroupMembers: requiredRoleNames.slice() });
        return;
      }

      const groups = Array.isArray(ctx?.groups) ? ctx.groups : [];
      const currentGroup = groups.find((g: any) => {
        try {
          const gid = typeof g?.id === 'number' || typeof g?.id === 'string' ? String(g.id).trim() : '';
          return Boolean(gid) && gid === groupId;
        } catch {
          return false;
        }
      });

      if (!currentGroup || !Array.isArray(currentGroup.members)) {
        updateState({ missingGroupMembers: requiredRoleNames.slice() });
        return;
      }

      const groupMembers = currentGroup.members
        .map((member: unknown) => normalizeName(resolveGroupMemberName(member), { stripExtension: true }))
        .filter(Boolean);

      const missing: string[] = [];
      requiredRoleNamesNormalized.forEach((norm, idx) => {
        if (!groupMembers.includes(norm)) {
          missing.push(requiredRoleNames[idx]);
        }
      });

      updateState({ missingGroupMembers: missing });
    } catch (err) {
      console.warn('[Requirements] refreshGroupMembers failed', err);
      updateState({ missingGroupMembers: requiredRoleNames.slice() });
    }
  };

  const computeGlobalMissing = (settings: any): { globalMissing: string[]; globalLoreBookPresent: boolean } => {
    const globalMissing: string[] = [];
    try {
      const globalSelect = settings?.world_info?.globalSelect;
      const lorebook = story?.global_lorebook;
      if (lorebook) {
        const want = lorebook.toLowerCase();
        const found = Array.isArray(globalSelect) && globalSelect.some((g: string) => g.trim().toLowerCase() === want);
        if (!found) globalMissing.push(lorebook);
      }
    } catch {/* ignore */ }
    return { globalMissing, globalLoreBookPresent: globalMissing.length === 0 };
  };

  const refreshWorldLore = () => {
    if (!requiredWorldInfoKeys.length) { updateState({ worldLoreEntriesPresent: true, worldLoreEntriesMissing: [] }); return; }
    try {
      const settings = getWorldInfoSettings();
      const { globalMissing, globalLoreBookPresent } = computeGlobalMissing(settings);
      if (!settings?.world_info) { updateState({ worldLoreEntriesPresent: false, worldLoreEntriesMissing: requiredWorldInfoKeys.slice(), globalLoreBookPresent, globalLoreBookMissing: globalMissing }); return; }
      const { loadWorldInfo } = getContext();
      loadWorldInfo(story?.global_lorebook).then((entries: Lorebook) => {
        if (!entries?.entries) { updateState({ worldLoreEntriesPresent: false, worldLoreEntriesMissing: requiredWorldInfoKeys.slice(), globalLoreBookPresent, globalLoreBookMissing: globalMissing }); return; }
        const seen = new Set<string>(Object.values(entries.entries).map(e => typeof e?.comment === 'string' ? e.comment.trim().toLowerCase() : '').filter(Boolean));
        const missing = requiredWorldInfoKeys.filter(name => !seen.has(name.toLowerCase()));
        updateState({ worldLoreEntriesPresent: missing.length === 0, worldLoreEntriesMissing: missing, globalLoreBookPresent, globalLoreBookMissing: globalMissing });
      }).catch((err: unknown) => {
        console.warn('[Requirements] loadWorldInfo failed', err);
        updateState({ worldLoreEntriesPresent: false, worldLoreEntriesMissing: requiredWorldInfoKeys.slice(), globalLoreBookPresent, globalLoreBookMissing: globalMissing });
      });
    } catch (err) {
      console.warn('[Requirements] refreshWorldLore failed', err);
      updateState({ worldLoreEntriesPresent: false, worldLoreEntriesMissing: requiredWorldInfoKeys.slice(), globalLoreBookPresent: false, globalLoreBookMissing: [] });
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
          if (typeof name === "string" && name) keys.add(name);
        });
      };
      push(wi.activate);
      push(wi.deactivate);
      // include make_constant if present (older schema support)
      if (Array.isArray((wi as any).make_constant)) push((wi as any).make_constant as string[]);
    });
    return Array.from(keys);
  };

  const extractRoleNames = (input: NormalizedStory | null): { names: string[]; normalized: string[] } => {
    if (!input?.roles) return { names: [], normalized: [] };
    const names: string[] = [];
    try {
      Object.values(input.roles).forEach((name) => {
        if (typeof name === 'string' && name.trim()) names.push(name.trim());
      });
    } catch {/* ignore */ }
    const normalized = names.map((name) => normalizeName(name, { stripExtension: true })).filter(Boolean);
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
    void reloadPersona();
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

    if (event_types.GROUP_UPDATED) {
      subscriptions.push(
        subscribeToEventSource({
          source: eventSource,
          eventName: event_types.GROUP_UPDATED,
          handler: () => { refreshGroupMembers(); },
        })
      );
    }

    refreshGroupChat();
    void reloadPersona();
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
