import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { eventSource, event_types, tgPresetObjs } from '@services/SillyTavernAPI';
import { PresetService } from '@services/PresetService';
import { StoryOrchestrator } from '@services/StoryService/orchestrator';
import type { Role } from '@services/SchemaService/story-schema';
import { useStoryContext } from '@components/context/StoryContext';
import { NormalizedStory } from 'services/SchemaService/story-validator';

type UseOpts = {
  applyAuthorsNote?: (note: any) => void;
  applyWorldInfo?: (ops: any) => void;
  runAutomation?: (id: string) => Promise<void> | void;
  userMessageEvents?: string[];
  autoInit?: boolean;
};

export function useStoryOrchestrator({
  applyAuthorsNote = () => { },
  applyWorldInfo = () => { },
  runAutomation,
  userMessageEvents,
  autoInit = true,
}: UseOpts) {
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState<string | undefined>();
  const [story, setStory] = useState<NormalizedStory | null>(null);
  const [checkpointIndex, setIdx] = useState(0);
  const [checkpoint, setCp] = useState<any>(null);
  const { validate, loadAll } = useStoryContext();
  const orchRef = useRef<StoryOrchestrator | null>(null);
  const applyAuthorsNoteRef = useRef(applyAuthorsNote);
  const applyWorldInfoRef = useRef(applyWorldInfo);
  const runAutomationRef = useRef(runAutomation);

  useEffect(() => { applyAuthorsNoteRef.current = applyAuthorsNote; }, [applyAuthorsNote]);
  useEffect(() => { applyWorldInfoRef.current = applyWorldInfo; }, [applyWorldInfo]);
  useEffect(() => { runAutomationRef.current = runAutomation; }, [runAutomation]);

  useEffect(() => {
    let cancelled = false;
    (async () => {

      if (!autoInit) return;
      try {
        const results = await loadAll();
        if (cancelled) return;
        const firstOk = results?.find((r): r is { file: string; ok: true; json: any } => (r as any).ok);
        if (firstOk && (firstOk as any).json) {
          setStory((firstOk as any).json);
        } else {
          console.warn("No valid checkpoint story found in bundle.");
        }
      } catch (e) {
        if (!cancelled) console.error("Failed to load bundled checkpoints:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [autoInit, validate, loadAll]);

  useEffect(() => {
    if (orchRef.current) return;
    if (!story?.basePreset) return;

    const svc = new PresetService({
      base: story.basePreset.name ? { source: 'named', name: story.basePreset.name } : { source: 'current' },
      storyId: story.title,
      storyTitle: story.title,
      roleDefaults: story.roleDefaults,
    });

    const orch = new StoryOrchestrator({
      story,
      presetService: svc,
      applyAuthorsNote: (note) => applyAuthorsNoteRef.current?.(note),
      applyWorldInfo: (ops) => applyWorldInfoRef.current?.(ops),
      runAutomation: (id) => runAutomationRef.current?.(id),
    });
    orchRef.current = orch;

    const offCP = orch.on('checkpointChanged', ({ index, checkpoint }) => {
      setIdx(index);
      setCp(checkpoint);
    });
    const detachFns: Array<() => void> = [];
    const events = userMessageEvents ?? [
      (event_types as any)?.MESSAGE_RECEIVED,
      (event_types as any)?.USER_MESSAGE,
      'MESSAGE_RECEIVED',
      'USER_MESSAGE',
      'USER_MESSAGE_SENT',
    ].filter(Boolean);

    const detachEvaluation = orch.attachToEventSource(eventSource, events);
    if (typeof detachEvaluation === 'function') {
      detachFns.push(detachEvaluation);
    }

    const possibleSettingsEvents = [
      (event_types as any)?.TEXT_COMPLETION_SETTINGS_READY,
      (event_types as any)?.CHAT_COMPLETION_SETTINGS_READY,
      (event_types as any)?.GENERATE_AFTER_COMBINE_PROMPTS,
      'text_completion_settings_ready',
      'chat_completion_settings_ready',
      'generate_after_combine_prompts',
    ];

    const settingsEvents = Array.from(
      new Set(possibleSettingsEvents.filter((ev): ev is string => typeof ev === 'string' && ev.length > 0)),
    );

    const groupDraftEvent = (event_types as any)?.GROUP_MEMBER_DRAFTED ?? 'group_member_drafted';

    const detachTextgen = settingsEvents.length
      ? orch.attachTextGenSettingsInterceptor(eventSource, settingsEvents, {
        generationStartedEvent: event_types.GENERATION_STARTED,
        generationEndedEvent: event_types.GENERATION_ENDED,
        generationStoppedEvent: event_types.GENERATION_STOPPED,
        groupMemberDraftedEvent: groupDraftEvent,
      })
      : undefined;
    if (typeof detachTextgen === 'function') {
      detachFns.push(detachTextgen);
    }

    (async () => {
      if (autoInit) {
        await orch.init();
      }
    })();

    setTitle(story.title);
    setReady(true);

    return () => {
      offCP();
      for (const fn of detachFns) {
        try {
          fn();
        } catch (err) {
          console.warn('[useStoryOrchestrator] Failed to detach event listener', err);
        }
      }
      orchRef.current = null;
    };
  }, [story, userMessageEvents, autoInit]);

  const applyRolePreset = useCallback((role: Role) => {
    orchRef.current?.applyRolePreset(role);
  }, []);

  const activateCheckpoint = useCallback((i: number) => {
    orchRef.current?.activateIndex(i);
  }, []);

  const progressText = useMemo(() => {
    if (!story) return '';
    return story.checkpoints
      .map((cp: any, i: number) => (i < checkpointIndex ? `✔ ${cp.name}` : i === checkpointIndex ? `→ ${cp.name}` : `  ${cp.name}`))
      .join('  |  ');
  }, [story, checkpointIndex]);

  return { ready, title, checkpointIndex, checkpoint, progressText, applyRolePreset, activateCheckpoint };
}
