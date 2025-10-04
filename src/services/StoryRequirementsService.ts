import type { NormalizedStory } from "utils/story-validator";
import type { Role } from "utils/story-schema";
import {
  eventSource,
  event_types,
  getCharacterIdByName,
  getContext,
  getWorldInfoSettings,
} from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";

export interface StoryRequirementsState {
  requirementsReady: boolean;
  currentUserName: string;
  personaDefined: boolean;
  groupChatSelected: boolean;
  worldLorePresent: boolean;
  worldLoreMissing: string[];
  requiredRolesPresent: boolean;
  missingRoles: string[];
}

const defaultState: StoryRequirementsState = {
  requirementsReady: false,
  currentUserName: "",
  personaDefined: true,
  groupChatSelected: false,
  worldLorePresent: true,
  worldLoreMissing: [],
  requiredRolesPresent: false,
  missingRoles: [],
};

const clone = (input: string[]) => input.map((item) => item);

class StoryRequirementsService {
  private story: NormalizedStory | null = null;
  private requiredWorldInfoKeys: string[] = [];
  private subscriptions: Array<() => void> = [];
  private listeners = new Set<(state: StoryRequirementsState) => void>();
  private state: StoryRequirementsState = { ...defaultState };
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.subscriptions.push(subscribeToEventSource({
      source: eventSource,
      eventName: event_types.CHAT_CHANGED,
      handler: () => {
        this.refreshGroupChat();
        void this.reloadPersona();
        this.refreshRoles();
      },
    }));

    const worldInfoHandler = () => {
      this.refreshWorldLore();
    };

    [
      event_types.WORLDINFO_UPDATED,
      event_types.WORLDINFO_SETTINGS_UPDATED,
      event_types.WORLDINFO_ENTRIES_LOADED,
    ].forEach((eventName) => {
      this.subscriptions.push(subscribeToEventSource({
        source: eventSource,
        eventName,
        handler: worldInfoHandler,
      }));
    });

    this.refreshGroupChat();
    void this.reloadPersona();
    this.refreshRoles();
    this.refreshWorldLore();
  }

  dispose(): void {
    this.started = false;
    while (this.subscriptions.length) {
      const off = this.subscriptions.pop();
      try {
        off?.();
      } catch (err) {
        console.warn("[StoryRequirementsService] unsubscribe failed", err);
      }
    }
    this.state = { ...defaultState };
    this.requiredWorldInfoKeys = [];
    this.story = null;
    this.emit();
    this.listeners.clear();
  }

  subscribe(listener: (state: StoryRequirementsState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): StoryRequirementsState {
    return this.state;
  }

  async reloadPersona(): Promise<void> {
    try {
      const { name1 } = getContext();
      this.updateState({
        currentUserName: name1 ?? "",
        personaDefined: Boolean(name1),
      });
    } catch (err) {
      console.warn("[StoryRequirementsService] reloadPersona failed", err);
      this.updateState({ currentUserName: "", personaDefined: false });
    }
  }

  setStory(story: NormalizedStory | null | undefined): void {
    this.story = story ?? null;
    this.requiredWorldInfoKeys = this.extractWorldInfoKeys(this.story);
    this.refreshRoles();
    this.refreshWorldLore();
    this.recomputeReady();
  }

  private refreshGroupChat() {
    try {
      const { groupId } = getContext();
      this.updateState({ groupChatSelected: Boolean(groupId) });
    } catch (err) {
      console.warn("[StoryRequirementsService] refreshGroupChat failed", err);
      this.updateState({ groupChatSelected: false });
    }
  }

  private refreshRoles() {
    if (!this.story || !this.story.roles) {
      this.updateState({ missingRoles: [], requiredRolesPresent: true });
      this.recomputeReady();
      return;
    }

    try {
      const roles = this.story.roles as Partial<Record<Role, string>>;
      const requiredNames = Object.values(roles)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .map((name) => name.trim());

      if (requiredNames.length === 0) {
        this.updateState({ missingRoles: [], requiredRolesPresent: true });
        this.recomputeReady();
        return;
      }

      const missing: string[] = [];
      for (const name of requiredNames) {
        const id = typeof getCharacterIdByName === "function" ? getCharacterIdByName(name) : undefined;
        if (id === undefined) missing.push(name);
      }

      this.updateState({ missingRoles: missing, requiredRolesPresent: missing.length === 0 });
      this.recomputeReady();
    } catch (err) {
      console.warn("[StoryRequirementsService] refreshRoles failed", err);
      this.updateState({ missingRoles: [], requiredRolesPresent: false });
      this.recomputeReady();
    }
  }

  private refreshWorldLore() {
    if (!this.requiredWorldInfoKeys.length) {
      this.updateState({ worldLorePresent: true, worldLoreMissing: [] });
      return;
    }

    try {
      const settings = typeof getWorldInfoSettings === "function" ? getWorldInfoSettings() : null;
      if (!settings || !settings.world_info) {
        this.updateState({ worldLorePresent: false, worldLoreMissing: clone(this.requiredWorldInfoKeys) });
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

      const missing = this.requiredWorldInfoKeys.filter(
        (name) => !seen.has(name.trim().toLowerCase()),
      );
      this.updateState({ worldLorePresent: missing.length === 0, worldLoreMissing: missing });
    } catch (err) {
      console.warn("[StoryRequirementsService] refreshWorldLore failed", err);
      this.updateState({ worldLorePresent: false, worldLoreMissing: [] });
    }
  }

  private extractWorldInfoKeys(story: NormalizedStory | null): string[] {
    if (!story) return [];
    const keys = new Set<string>();
    story.checkpoints.forEach((checkpoint) => {
      const wi = checkpoint.onActivate?.world_info;
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
  }

  private recomputeReady() {
    const ready = Boolean(this.story && this.state.personaDefined && this.state.groupChatSelected && this.state.requiredRolesPresent);
    this.updateState({ requirementsReady: ready });
  }

  private updateState(patch: Partial<StoryRequirementsState>) {
    const next: StoryRequirementsState = {
      ...this.state,
      ...patch,
      worldLoreMissing: patch.worldLoreMissing ? clone(patch.worldLoreMissing) : this.state.worldLoreMissing,
      missingRoles: patch.missingRoles ? clone(patch.missingRoles) : this.state.missingRoles,
    };

    const changed = Object.keys(next).some((key) => {
      const typedKey = key as keyof StoryRequirementsState;
      const prevValue = this.state[typedKey];
      const nextValue = next[typedKey];
      if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
        if (prevValue.length !== nextValue.length) return true;
        for (let i = 0; i < prevValue.length; i++) {
          if (prevValue[i] !== nextValue[i]) return true;
        }
        return false;
      }
      return prevValue !== nextValue;
    });

    if (!changed) return;
    this.state = next;
    this.emit();
  }

  private emit() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (err) {
        console.warn("[StoryRequirementsService] listener failed", err);
      }
    });
  }
}

export default StoryRequirementsService;

