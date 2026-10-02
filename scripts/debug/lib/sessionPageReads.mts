import { evaluateInST } from './evaluate.mts';
import { LIVE_SETTINGS_PATHS } from './presetOverlay.mts';
import type { ChatRef } from './sessionArtifacts.mts';

export const CONTEXT_MESSAGES = 8;

export interface TranscriptMessage { id: number; name: string; isUser: boolean; isSystem: boolean; text: string; swipeId: number | null; swipes: string[] }

export async function readWhere(page: any): Promise<ChatRef & { activeCheckpointId: string | null; boundary: number | null }> {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const snapshot = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.() ?? {};
    const group = (ctx.groups ?? []).find((candidate: any) => candidate.id === ctx.groupId);
    return {
      chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, group: group?.name ?? null, storyId: snapshot.storyId ?? null,
      activeCheckpointId: snapshot.activeCheckpointId ?? null, boundary: typeof snapshot.boundary === 'number' ? snapshot.boundary : null,
    };
  });
}

export async function readChatInventory(page: any): Promise<ChatRef[]> {
  return evaluateInST(page, async () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    if (typeof ctx.getCharacters === 'function') await ctx.getCharacters();
    return (ctx.groups ?? []).flatMap((group: any) => (Array.isArray(group.chats) ? group.chats : []).map((chatId: string) => ({ chatId: String(chatId), group: group.name ?? null, groupId: group.id ?? null })));
  });
}

export async function readTranscript(page: any): Promise<{ chatId: string | null; messages: TranscriptMessage[] }> {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    return {
      chatId: ctx.chatId ?? null,
      messages: chat.map((message: any, id: number) => ({
        id, name: String(message?.name ?? ''), isUser: Boolean(message?.is_user), isSystem: Boolean(message?.is_system), text: String(message?.mes ?? ''),
        swipeId: Number.isInteger(message?.swipe_id) ? message.swipe_id : null,
        swipes: Array.isArray(message?.swipes) ? message.swipes.map((swipe: unknown) => String(swipe ?? '')) : [],
      })),
    };
  });
}

export async function readObservation(page: any) {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const snapshot = rt?.getSnapshot?.() ?? {};
    const group = (ctx.groups ?? []).find((candidate: any) => candidate.id === ctx.groupId);
    const captures = rt?.getPayloadCaptures?.() ?? [];
    const latest = captures[0] ?? null;
    return {
      chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, group: group?.name ?? null, storyId: snapshot.storyId ?? null,
      activeCheckpointId: snapshot.activeCheckpointId ?? null, boundary: typeof snapshot.boundary === 'number' ? snapshot.boundary : null,
      folded: typeof latest?.folded === 'number' ? latest.folded : null,
      payloadEpoch: (globalThis as any).__soDebugPayloads?.epoch ?? null,
    };
  });
}

export const contextOf = (messages: TranscriptMessage[], size = CONTEXT_MESSAGES) => messages.slice(-size).map((message) => ({ id: message.id, name: message.name, isUser: message.isUser, text: message.text }));

export async function readRuntimeBlob(page: any) {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const blob = ctx.chatMetadata?.story_orchestrator ?? null;
    return blob ? JSON.parse(JSON.stringify(blob)) : null;
  });
}

export async function readWizardDrafts(page: any) {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const root = ctx.extensionSettings?.['story-orchestrator'] ?? {};
    const sessions = Array.isArray(root.wizardSessions) ? root.wizardSessions : [];
    const store = (globalThis as any).storyOrchestratorStudioDraft;
    const draft = store?.getState?.()?.draft ?? null;
    const library = Array.isArray(root.v2Stories) ? root.v2Stories : [];
    return {
      sessions: JSON.parse(JSON.stringify(sessions)),
      openDraft: draft ? JSON.parse(JSON.stringify(draft)) : null,
      library: library.map((record: any) => ({ id: record?.id ?? record?.story?.id ?? null, title: record?.title ?? record?.story?.title ?? null, version: record?.version ?? record?.story?.version ?? null })),
    };
  });
}

export async function readHostSwipes(page: any): Promise<{ swipes: boolean | null }> {
  return evaluateInST(page, () => {
    const box = (globalThis as any).document?.getElementById?.('swipes-checkbox');
    return { swipes: box ? Boolean(box.checked) : null };
  });
}

export async function readLivePresets(page: any) {
  return evaluateInST(page, (paths: string[]) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const power = ctx.powerUserSettings;
    const instruct = power?.instruct;
    const context = power?.context;
    const textgen = ctx.textCompletionSettings;
    const walk = (root: any, keys: string[]) => keys.reduce((node: any, key: string) => (node && typeof node === 'object' ? node[key] : undefined), root);
    const slider = (globalThis as any).document?.getElementById?.('amount_gen');
    const settings = power ? Object.fromEntries(paths.map((path) => {
      if (path === 'amount_gen') return [path, slider && slider.value !== '' ? Number(slider.value) : null];
      const [root, ...rest] = path.split('.');
      return [path, root === 'power_user' ? walk(power, rest) ?? null : null];
    })) : null;
    const manager = ctx.extensionSettings?.connectionManager;
    const selected = Array.isArray(manager?.profiles) ? manager.profiles.find((profile: any) => profile?.id === manager.selectedProfile) : null;
    return {
      instruct: instruct ? {
        preset: instruct.preset ?? null, last_output_sequence: instruct.last_output_sequence ?? null,
        sequences_as_stop_strings: instruct.sequences_as_stop_strings ?? null, names_behavior: instruct.names_behavior ?? null,
        story_string_prefix: instruct.story_string_prefix ?? null,
      } : null,
      textgen: textgen ? { preset: textgen.preset ?? null, samplers: Array.isArray(textgen.samplers) ? [...textgen.samplers] : null } : null,
      context: context ? { preset: context.preset ?? null, names_as_stop_strings: context.names_as_stop_strings ?? null } : null,
      settings,
      profile: selected ? {
        name: selected.name ?? null, instruct: selected.instruct ?? null, 'start-reply-with': selected['start-reply-with'] ?? null,
        'reasoning-template': selected['reasoning-template'] ?? null, preset: selected.preset ?? null,
      } : null,
    };
  }, [...LIVE_SETTINGS_PATHS]);
}

export async function readEffectiveSettings(page: any) {
  return evaluateInST(page, () => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const settings = rt?.getGlobalSettings?.() ?? null;
    return settings ? JSON.parse(JSON.stringify(settings)) : null;
  });
}
