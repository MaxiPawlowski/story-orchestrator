import React, { useCallback, useEffect, useState } from "react";
import { StoryDraft } from "@utils/checkpoint-studio";
import { getWorldInfoSettings, getContext } from "@services/SillyTavernAPI";
import { subscribeToEventSource } from "@utils/event-source";
import StoryMetadataSection from "./StoryDetails/StoryMetadataSection";
import StoryRolesSection from "./StoryDetails/StoryRolesSection";

type Props = {
  draft: StoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<StoryDraft>>;
};

const StoryDetailsPanel: React.FC<Props> = ({ draft, setDraft }) => {
  const [globalLorebooks, setGlobalLorebooks] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);


  const refreshGlobalLorebooks = useCallback(() => {
    try {
      const settings: any = getWorldInfoSettings?.();
      const list = Array.isArray(settings?.world_info?.globalSelect)
        ? (settings.world_info.globalSelect as unknown[])
          .map((g) => (typeof g === "string" ? g.trim() : ""))
          .filter(Boolean)
        : [];
      setGlobalLorebooks(list);
    } catch (err) {
      console.warn("[Story - CheckpointStudio] Failed to read global lorebooks", err);
      setGlobalLorebooks([]);
    }
  }, []);

  const refreshGroupMembers = useCallback(() => {
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
        } catch (err) {
          console.warn("[Story - StoryDetailsPanel] Failed to match group ID", err);
          return false;
        }
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
      console.warn('[Story - CheckpointStudio] Failed to resolve group members', err);
      setGroupMembers([]);
    }
  }, []);

  useEffect(() => {
    refreshGlobalLorebooks();
    try {
      refreshGroupMembers();
    } catch (err) {
      console.warn("[Story - StoryDetailsPanel] Failed to refresh group members on mount", err);
    }

    const offs: Array<() => void> = [];
    const handler = () => refreshGlobalLorebooks();
    const chatChanged = () => {
      try {
        refreshGroupMembers();
      } catch (err) {
        console.warn("[Story - StoryDetailsPanel] Failed to refresh group members on chat change", err);
      }
    };
    const { eventSource, eventTypes } = getContext();
    try {
      [
        eventTypes?.WORLDINFO_SETTINGS_UPDATED,
        eventTypes?.WORLDINFO_UPDATED,
      ].forEach((eventName) => {
        if (!eventName) return;
        const off = subscribeToEventSource({ source: eventSource, eventName, handler });
        offs.push(off);
      });
      if (eventTypes?.CHAT_CHANGED) {
        const off = subscribeToEventSource({ source: eventSource, eventName: eventTypes.CHAT_CHANGED, handler: chatChanged });
        offs.push(off);
      }
    } catch (err) {
      console.warn("[Story - CheckpointStudio] Failed to subscribe to WI events", err);
    }

    return () => {
      while (offs.length) {
        try {
          offs.pop()?.();
        } catch (err) {
          console.warn("[Story - StoryDetailsPanel] Failed to unsubscribe from event", err);
        }
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
    </div>
  );
};

export default StoryDetailsPanel;
