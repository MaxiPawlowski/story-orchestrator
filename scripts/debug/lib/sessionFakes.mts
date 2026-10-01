export const EVENT_TYPES = {
  GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended', GROUP_MEMBER_DRAFTED: 'group_member_drafted', MESSAGE_RECEIVED: 'message_received',
  MESSAGE_SWIPED: 'message_swiped', MESSAGE_EDITED: 'message_edited', MESSAGE_DELETED: 'message_deleted', CHAT_CHANGED: 'chat_changed',
  GROUP_WRAPPER_STARTED: 'group_wrapper_started', GROUP_WRAPPER_FINISHED: 'group_wrapper_finished',
};

export function emitter() {
  const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
  return {
    on(type: string, fn: (...args: any[]) => unknown) { handlers.set(type, [...(handlers.get(type) ?? []), fn]); },
    async emit(type: string, ...args: unknown[]) { for (const fn of handlers.get(type) ?? []) await fn(...args); },
    count: (type: string) => (handlers.get(type) ?? []).length,
  };
}

export interface FakeMessage { name: string; is_user?: boolean; is_system?: boolean; mes: string; swipes?: string[]; swipe_id?: number; send_date?: string; swipe_info?: unknown[]; extra?: Record<string, unknown> }

export function fakeSt({ chat = [] as FakeMessage[], chatId = 'chat-a', groupId = 'g1' as string | null, characters = [{ name: 'Narrator' }, { name: 'Belle' }, { name: 'Dalan' }] } = {}) {
  const events = emitter();
  const state: any = {
    snapshot: {
      storyId: 'adolion-adventurer', activeCheckpointId: 'guild-hall', activeCheckpointName: 'The Guild Hall', boundary: 3,
      blackboard: { path: 'none', party_name: '' }, pipeline: { state: 'idle', text: 'Up to date', detail: null }, lastRollback: null, rollbackUnavailable: null,
      extraction: { scheduler: { inFlight: false, queueDepth: 0, heavyInFlight: false, heavyQueueDepth: 0 } },
    },
    journal: [{ at: '2026-10-01T10:00:00.000Z', boundary: 3, messageId: 2, kind: 'boundary', summary: 'boundary 3' }],
    recap: null as unknown,
  };
  const ctx: any = {
    chat, chatId, groupId, characters, eventSource: events, eventTypes: EVENT_TYPES,
    groups: [{ id: 'g1', name: 'Adolion - Adventurer', members: ['narrator.png', 'belle.png', 'dalan.png'] }],
    chatMetadata: { story_orchestrator: { selectedStoryId: 'adolion-adventurer', stories: { 'adolion-adventurer': { extras: { lastSessionAt: '2026-10-01T09:00:00.000Z' } } } } },
    slash: [] as string[],
    async executeSlashCommandsWithOptions(command: string) { ctx.slash.push(command); return { pipe: '' }; },
    async updateMessageBlock() {},
    async saveChat() {},
    async saveMetadata() { ctx.metadataSaves = (ctx.metadataSaves ?? 0) + 1; },
    async reloadCurrentChat() { await events.emit(EVENT_TYPES.CHAT_CHANGED, ctx.chatId); },
    async deleteMessage(id: number) { ctx.chat.splice(id, 1); await events.emit(EVENT_TYPES.MESSAGE_DELETED, ctx.chat.length); },
    swipe: { to: async (_event: unknown, _direction: string, { forceMesId, forceSwipeId }: { forceMesId: number; forceSwipeId: number }) => { ctx.chat[forceMesId].swipe_id = forceSwipeId; } },
  };
  const runtime = {
    getSnapshot: () => state.snapshot,
    getSessionJournal: () => state.journal,
    getAwayRecap: () => state.recap,
  };
  return { ctx, state, events, runtime };
}

export function install(fake: ReturnType<typeof fakeSt>) {
  (globalThis as any).SillyTavern = { getContext: () => fake.ctx };
  (globalThis as any).storyOrchestratorRuntime = fake.runtime;
}

export function uninstall() {
  delete (globalThis as any).SillyTavern;
  delete (globalThis as any).storyOrchestratorRuntime;
  delete (globalThis as any).__soSessionRecorder;
}

export function fakePage(extra: Record<string, unknown> = {}) {
  const typed: Record<string, string> = {};
  const clicks: string[] = [];
  const page: any = {
    clicks,
    typed,
    evaluate: async (fn: any, arg: any) => fn(arg),
    waitForTimeout: async () => undefined,
    locator: (selector: string) => ({
      first: () => page.locator(selector),
      click: async () => { clicks.push(selector); await (page.onClick?.(selector)); },
      fill: async (text: string) => { typed[selector] = text; },
      press: async (key: string) => { clicks.push(`${selector}:${key}`); await (page.onPress?.(selector, key)); },
    }),
    ...extra,
  };
  return page;
}

export const clearPage = {
  closeOverlays: async () => undefined,
  hitTest: async (_page: unknown, selector: string) => ({ selector, found: true, clickable: true }),
  revealMessage: async () => ({ found: true, scrolledToBottom: true, inView: true }),
  flag: async (_page: unknown, note: string) => ({ kind: 'flag', note, ok: true }),
};
