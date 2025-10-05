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

  const updateState = (patch: Partial<StoryRequirementsState>, recompute = true) => {
    const next = mergeRequirementsState(state, patch);
    if (areRequirementStatesEqual(state, next)) return false;
    state = next; emit(); if (recompute) recomputeReady(); return true;
  };

  const recomputeReady = () => {
    const ready = Boolean(story && state.personaDefined && state.groupChatSelected && state.requiredRolesPresent && state.worldLorePresent && state.globalLorePresent);
    // avoid infinite loop: call updateState without re-triggering recompute
    updateState({ requirementsReady: ready }, false);
  };

  const refreshGroupChat = () => {
    try { const ctx = getContext(); updateState({ groupChatSelected: Boolean(ctx?.groupId) }); }
    catch (err) { console.warn('[Requirements] refreshGroupChat failed', err); updateState({ groupChatSelected: false }); }
  };

  const reloadPersona = async () => {
    try { const { name1 } = getContext(); updateState({ currentUserName: name1 ?? '', personaDefined: Boolean(name1) }); }
    catch (err) { console.warn('[Requirements] reloadPersona failed', err); updateState({ currentUserName: '', personaDefined: false }); }
  };

  const refreshRoles = () => {
    if (!story?.roles) { updateState({ missingRoles: [], requiredRolesPresent: true }); return; }
    try {
      const roles = story.roles as Partial<Record<Role, string>>;
      const required = Object.values(roles).filter((n): n is string => typeof n === 'string' && n.length > 0);
      if (!required.length) { updateState({ missingRoles: [], requiredRolesPresent: true }); return; }
      const missing = required.filter(name => (typeof getCharacterIdByName === 'function' ? getCharacterIdByName(name) : undefined) === undefined);
      updateState({ missingRoles: missing, requiredRolesPresent: missing.length === 0 });
    } catch (err) { console.warn('[Requirements] refreshRoles failed', err); updateState({ missingRoles: [], requiredRolesPresent: false }); }
  };

  const computeGlobalMissing = (settings: any): { globalMissing: string[]; globalLorePresent: boolean } => {
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
    return { globalMissing, globalLorePresent: globalMissing.length === 0 };
  };

  const refreshWorldLore = () => {
    if (!requiredWorldInfoKeys.length) { updateState({ worldLorePresent: true, worldLoreMissing: [] }); return; }
    try {
      const settings = getWorldInfoSettings();
      const { globalMissing, globalLorePresent } = computeGlobalMissing(settings);
      if (!settings?.world_info) { updateState({ worldLorePresent: false, worldLoreMissing: requiredWorldInfoKeys.slice(), globalLorePresent, globalLoreMissing: globalMissing }); return; }
      const { loadWorldInfo } = getContext();
      loadWorldInfo(story?.global_lorebook).then((entries: Lorebook) => {
        if (!entries?.entries) { updateState({ worldLorePresent: false, worldLoreMissing: requiredWorldInfoKeys.slice(), globalLorePresent, globalLoreMissing: globalMissing }); return; }
        const seen = new Set<string>(Object.values(entries.entries).map(e => typeof e?.comment === 'string' ? e.comment.trim().toLowerCase() : '').filter(Boolean));
        const missing = requiredWorldInfoKeys.filter(name => !seen.has(name.toLowerCase()));
        updateState({ worldLorePresent: missing.length === 0, worldLoreMissing: missing, globalLorePresent, globalLoreMissing: globalMissing });
      }).catch((err: unknown) => {
        console.warn('[Requirements] loadWorldInfo failed', err);
        updateState({ worldLorePresent: false, worldLoreMissing: requiredWorldInfoKeys.slice(), globalLorePresent, globalLoreMissing: globalMissing });
      });
    } catch (err) {
      console.warn('[Requirements] refreshWorldLore failed', err);
      updateState({ worldLorePresent: false, worldLoreMissing: requiredWorldInfoKeys.slice(), globalLorePresent: false, globalLoreMissing: [] });
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
