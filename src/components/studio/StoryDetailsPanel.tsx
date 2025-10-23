import React from "react";
import { StoryDraft, TalkControlDraft } from "@utils/checkpoint-studio";
import { getWorldInfoSettings, eventSource, event_types, getContext } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/eventSource";
import StoryMetadataSection from "./StoryDetails/StoryMetadataSection";
import StoryRolesSection from "./StoryDetails/StoryRolesSection";
import TalkControlDefaultsSection from "./StoryDetails/TalkControlDefaultsSection";

type Props = {
  draft: StoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

const StoryDetailsPanel: React.FC<Props> = ({ draft, setDraft }) => {
  const [globalLorebooks, setGlobalLorebooks] = React.useState<string[]>([]);
  const [groupMembers, setGroupMembers] = React.useState<string[]>([]);
  const talkControl = draft.talkControl;
  const talkControlEnabled = Boolean(talkControl?.enabled);

  const updateTalkControl = React.useCallback((updater: (current: TalkControlDraft | undefined) => TalkControlDraft | undefined) => {
    setDraft((prev) => {
      const next = updater(prev.talkControl);
      return { ...prev, talkControl: next };
    });
  }, [setDraft]);

  const handleTalkControlToggle = React.useCallback((enabled: boolean) => {
    updateTalkControl((current) => {
      if (enabled) {
        const base: TalkControlDraft = current ?? { enabled: true, checkpoints: {} };
        return { ...base, enabled: true };
      }
      if (!current) return undefined;
      const next: TalkControlDraft = { ...current, enabled: false };
      if (!Object.keys(next.checkpoints ?? {}).length && !next.defaults) {
        return undefined;
      }
      return next;
    });
  }, [updateTalkControl]);

  const handleDefaultNumberChange = React.useCallback((key: "cooldownTurns" | "maxPerTurn" | "maxCharsPerAuto", raw: string) => {
    updateTalkControl((current) => {
      const base: TalkControlDraft = current
        ? { ...current, checkpoints: { ...(current.checkpoints ?? {}) } }
        : { enabled: true, checkpoints: {} };
      const defaults = { ...(base.defaults ?? {}) } as Record<string, unknown>;
      const trimmed = raw.trim();
      if (!trimmed) {
        delete defaults[key];
      } else {
        const num = Number(trimmed);
        if (Number.isFinite(num)) {
          const min = key === "maxPerTurn" ? 1 : key === "maxCharsPerAuto" ? 1 : 0;
          defaults[key] = Math.max(min, Math.floor(num));
        }
      }
      const nextDefaults = Object.keys(defaults).length ? (defaults as TalkControlDraft["defaults"]) : undefined;
      return { ...base, defaults: nextDefaults };
    });
  }, [updateTalkControl]);

  const handleDefaultFlagChange = React.useCallback((key: "sendAsQuiet" | "forceSpeaker", value: string) => {
    updateTalkControl((current) => {
      const base: TalkControlDraft = current
        ? { ...current, checkpoints: { ...(current.checkpoints ?? {}) } }
        : { enabled: true, checkpoints: {} };
      const defaults = { ...(base.defaults ?? {}) } as Record<string, unknown>;
      if (!value) {
        delete defaults[key];
      } else {
        defaults[key] = value === "true";
      }
      const nextDefaults = Object.keys(defaults).length ? (defaults as TalkControlDraft["defaults"]) : undefined;
      return { ...base, defaults: nextDefaults };
    });
  }, [updateTalkControl]);

  const handleClearDefaults = React.useCallback(() => {
    updateTalkControl((current) => {
      if (!current) return current;
      const next: TalkControlDraft = { ...current, defaults: undefined };
      if (!next.enabled && !Object.keys(next.checkpoints ?? {}).length) {
        return undefined;
      }
      return next;
    });
  }, [updateTalkControl]);

  const refreshGlobalLorebooks = React.useCallback(() => {
    try {
      const settings: any = getWorldInfoSettings?.();
      const list = Array.isArray(settings?.world_info?.globalSelect)
        ? (settings.world_info.globalSelect as unknown[])
          .map((g) => (typeof g === "string" ? g.trim() : ""))
          .filter(Boolean)
        : [];
      setGlobalLorebooks(list);
    } catch (err) {
      console.warn("[CheckpointStudio] Failed to read global lorebooks", err);
      setGlobalLorebooks([]);
    }
  }, []);

  const refreshGroupMembers = React.useCallback(() => {
    try {
      const ctx = getContext?.();
      const groupIdRaw = ctx?.groupId;
      const groupId = String(groupIdRaw ?? "").trim();
      if (!groupId) { setGroupMembers([]); return; }

      const groups = Array.isArray(ctx?.groups) ? ctx.groups : [];
      const current = groups.find((g: any) => {
        try {
          const gid = typeof g?.id === 'number' || typeof g?.id === 'string' ? String(g.id).trim() : '';
          return Boolean(gid) && gid === groupId;
        } catch { return false; }
      });

      if (!current || !Array.isArray(current.members)) { setGroupMembers([]); return; }

      const resolveName = (member: unknown): string => {
        if (typeof member === 'string') return member;
        if (typeof member === 'number') return String(member);
        if (member && typeof member === 'object') {
          const r = member as Record<string, unknown>;
          const candidate = r.name ?? r.display_name ?? r.id ?? '';
          return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : '';
        }
        return '';
      };

      const names = current.members
        .map((m: unknown) => resolveName(m))
        // remove trailing file extension like ".png", ".webp", etc., but keep original casing
        .map((s: string) => String(s ?? '').replace(/\.[a-z0-9]+$/i, '').trim())
        .filter((s: string) => Boolean(s));

      // de-dupe while preserving order
      const seen = new Set<string>();
      const unique = names.filter((n: string) => { const low = n.toLowerCase(); if (seen.has(low)) return false; seen.add(low); return true; });
      setGroupMembers(unique);
    } catch (err) {
      console.warn('[CheckpointStudio] Failed to resolve group members', err);
      setGroupMembers([]);
    }
  }, []);

  React.useEffect(() => {
    refreshGlobalLorebooks();
    try { refreshGroupMembers(); } catch { }

    const offs: Array<() => void> = [];
    const handler = () => refreshGlobalLorebooks();
    const chatChanged = () => { try { refreshGroupMembers(); } catch { } };
    try {
      [
        event_types?.WORLDINFO_SETTINGS_UPDATED,
        event_types?.WORLDINFO_UPDATED,
      ].forEach((eventName) => {
        if (!eventName) return;
        const off = subscribeToEventSource({ source: eventSource, eventName, handler });
        offs.push(off);
      });
      if (event_types?.CHAT_CHANGED) {
        const off = subscribeToEventSource({ source: eventSource, eventName: event_types.CHAT_CHANGED, handler: chatChanged });
        offs.push(off);
      }
    } catch (err) {
      console.warn("[CheckpointStudio] Failed to subscribe to WI events", err);
    }

    return () => {
      while (offs.length) {
        try { offs.pop()?.(); } catch { }
      }
    };
  }, [refreshGlobalLorebooks, refreshGroupMembers]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 font-semibold">Story Details</div>
        <div className="flex flex-col gap-3 p-3">
          <StoryMetadataSection draft={draft} setDraft={setDraft} globalLorebooks={globalLorebooks} />
          <StoryRolesSection draft={draft} setDraft={setDraft} groupMembers={groupMembers} />
        </div>
      </div>

      <TalkControlDefaultsSection
        talkControl={talkControl}
        enabled={talkControlEnabled}
        onToggle={handleTalkControlToggle}
        onNumberChange={handleDefaultNumberChange}
        onFlagChange={handleDefaultFlagChange}
        onClearDefaults={handleClearDefaults}
      />
    </div>
  );
};

export default StoryDetailsPanel;
