// src/services/StoryService.ts
import {
  eventSource,
  event_types,
  isUserMessage,
  pluginBus,
  setChatCFGScale,
  setAuthorsNoteForCharacter,
  updateWorldInfoEntries,
} from "@services/SillyTavernAPI";
import { roleCFGRouter } from "@services/RoleCFGRouter";
import type { Role } from "@services/SchemaService/story-schema";
import type { NormalizedStory, NormalizedOnActivate } from "@services/SchemaService/story-validator";

type ServiceCheckpointState = {
  id: string | number;
  name: string;
  objective: string;
  status: "pending" | "current" | "complete" | "failed";
};

type StoryState = {
  title: string;
  checkpoints: ServiceCheckpointState[];
  currentIndex: number;
  finished: boolean;
  failed: boolean;
};

class Emitter<T> {
  private listeners = new Set<(payload: T) => void>();
  on(fn: (p: T) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(p: T) { this.listeners.forEach(fn => fn(p)); }
}

export class StoryManager {
  private story?: NormalizedStory;
  private roles: Partial<Record<Role, string>> = {};
  private state: StoryState = { title: "", checkpoints: [], currentIndex: 0, finished: false, failed: false };
  private onChangeEmitter = new Emitter<StoryState>();
  private compiledTriggers: { win: RegExp; fail?: RegExp }[] = [];
  private messageListenerAttached = false;

  onChange(cb: (s: StoryState) => void) { return this.onChangeEmitter.on(cb); }
  getState(): StoryState { return this.state; }
  getCurrent() { return this.state.checkpoints[this.state.currentIndex]; }

  load(story: NormalizedStory) {
    this.story = story;
    this.roles = story.roles || {};
    roleCFGRouter.attach(); // ensure router installed

    this.state = {
      title: story.title,
      checkpoints: story.checkpoints.map((cp, i) => ({
        id: cp.id,
        name: cp.name,
        objective: cp.objective,
        status: i === 0 ? "current" : "pending",
      })),
      currentIndex: 0,
      finished: false,
      failed: false,
    };

    this.compiledTriggers = story.checkpoints.map(cp => ({
      win: cp.winTrigger,
      fail: cp.failTrigger,
    }));

    // Apply stage 0 setup
    this.applyOnActivate(story.checkpoints[0]?.onActivate, 0);
    this.emit();
    this.attachMessageListener();
  }

  jumpTo(id: string | number) {
    if (!this.story) return;
    const idx = this.story.checkpoints.findIndex(c => c.id === id);
    if (idx < 0) return;
    this.state.checkpoints.forEach((c, i) => c.status = i < idx ? "complete" : (i === idx ? "current" : "pending"));
    this.state.currentIndex = idx;
    this.state.finished = false;
    this.state.failed = false;
    this.applyOnActivate(this.story.checkpoints[idx]?.onActivate, idx);
    this.emit();
  }

  private attachMessageListener() {
    if (this.messageListenerAttached) return;
    this.messageListenerAttached = true;
    eventSource.on(event_types.MESSAGE_RECEIVED, (msg: any) => {
      try {
        if (!isUserMessage(msg)) return;
        const text = (msg?.mes || msg?.text || "").toString();
        this.evaluateUserText(text);
      } catch (e) {
        console.warn("StoryManager MESSAGE_RECEIVED error:", e);
      }
    });
  }

  private evaluateUserText(text: string) {
    if (!this.story || this.state.finished || this.state.failed) return;
    const idx = this.state.currentIndex;
    const cp = this.story.checkpoints[idx];
    if (!cp) return;

    const { win, fail } = this.compiledTriggers[idx];

    if (fail && fail.test(text)) {
      this.state.checkpoints[idx].status = "failed";
      this.state.failed = true;
      this.emit();
      pluginBus.dispatchEvent(new CustomEvent("story:failed", { detail: { checkpoint: cp } }));
      return;
    }

    if (win.test(text)) {
      this.state.checkpoints[idx].status = "complete";
      const nextIdx = idx + 1;
      if (nextIdx < this.state.checkpoints.length) {
        this.state.currentIndex = nextIdx;
        this.state.checkpoints[nextIdx].status = "current";
        this.applyOnActivate(this.story.checkpoints[nextIdx]?.onActivate, nextIdx);
        this.emit();
        pluginBus.dispatchEvent(new CustomEvent("story:advanced", { detail: { from: cp, to: this.story.checkpoints[nextIdx] } }));
      } else {
        this.state.finished = true;
        this.emit();
        pluginBus.dispatchEvent(new CustomEvent("story:finished", { detail: { last: cp } }));
      }
    }
  }

  private applyOnActivate(on?: NormalizedOnActivate, idx?: number) {
    if (!on) return;

    // 1) AUTHORS NOTE — per-role or global
    if (on.authors_note) {
      // Per-role map (already normalized). If 'chat' is present, apply as a fallback to known roles.
      for (const [role, content] of Object.entries(on.authors_note) as [Role, string][]) {
        if (role === "chat") {
          for (const target of (["dm", "companion"] as Role[])) {
            const charName = this.roles[target];
            if (!charName) continue;
            setAuthorsNoteForCharacter({
              entryName: `__AN_${target}_CP_${idx ?? 0}__`,
              characterName: charName,
              content,
              position: "an_top",
            });
          }
          continue;
        }
        const charName = this.roles[role];
        if (!charName) continue;
        setAuthorsNoteForCharacter({
          entryName: `__AN_${role}_CP_${idx ?? 0}__`,
          characterName: charName,
          content,
          position: "an_top",
        });
      }
    }

    // 2) CFG SCALE — per-role preferred; chat-level fallback
    if (on.cfg_scale) {
      let fallbackMax = 0;
      for (const [role, scale] of Object.entries(on.cfg_scale) as [Role, number][]) {
        const charName = this.roles[role];
        fallbackMax = Math.max(fallbackMax, Number(scale) || 0);
        if (!charName) continue;
        // remember per-character desired scale
        roleCFGRouter.setScale(charName, Number(scale));
      }
      // ensure router is attached; also set a safe chat-level value now
      roleCFGRouter.attach();
      if (fallbackMax > 0) setChatCFGScale(fallbackMax);
    }

    // 3) WI toggles (stage-scoped)
    if (on.world_info) {
      updateWorldInfoEntries({
        activate: on.world_info.activate || [],
        deactivate: on.world_info.deactivate || [],
        make_constant: on.world_info.make_constant || [],
      });
    }
  }

  private emit() { this.onChangeEmitter.emit({ ...this.state }); }
}

export const storyManager = new StoryManager();
