import type { R4CaptureEntry, R4LiveDeps } from './r4Live.mts';

export interface R4FakeOptions {
  chatId?: string;
  storyId?: string;
  checkpoint?: string;
  declared?: string | null;
  source?: 'openrouter' | 'custom';
  landed?: (chatId: string) => boolean;
  delayMs?: { arm: number; control: number };
  silent?: boolean;
  spikeLoaded?: boolean;
}

export interface R4Fake {
  page: { evaluate: (fn: (arg: unknown) => unknown, arg?: unknown) => unknown };
  deps: R4LiveDeps;
  state: { chatId: string; flag: boolean; flagWrites: boolean[]; triggers: string[]; chat: Array<{ name: string; mes: string; is_user: boolean }>; captures: R4CaptureEntry[] };
  install: () => void;
  uninstall: () => void;
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

export function r4Fake(options: R4FakeOptions = {}): R4Fake {
  const state = {
    chatId: options.chatId ?? 'chat-1',
    flag: false,
    flagWrites: [] as boolean[],
    triggers: [] as string[],
    chat: [
      { name: 'Narrator', mes: 'The gate looms.', is_user: false },
      { name: 'Player', mes: 'I push the gate open.', is_user: true },
    ],
    captures: [] as R4CaptureEntry[],
  };
  const shots: Array<{ at: number; level: string }> = [];
  const source = options.source ?? 'openrouter';
  const body = (thinks: boolean) => (source === 'custom'
    ? { type: 'normal', chat_completion_source: 'custom', include_reasoning: thinks, custom_include_body: JSON.stringify({ chat_template_kwargs: { enable_thinking: thinks } }) }
    : { type: 'normal', chat_completion_source: 'openrouter', include_reasoning: thinks, reasoning_effort: thinks ? 'high' : undefined });
  const ctx = {
    get chatId() { return state.chatId; },
    get chat() { return state.chat; },
    executeSlashCommandsWithOptions: async (command: string) => {
      state.triggers.push(command);
      const thinks = state.flag && (options.landed ? options.landed(state.chatId) : true);
      state.captures.push({ url: '/api/backends/chat-completions/generate', parsedBody: { messages: [], chat_completion_source: source } });
      state.captures.push({ url: '/api/backends/chat-completions/generate', parsedBody: body(thinks) });
      if (state.flag) shots.push({ at: Date.now(), level: 'high' });
      await wait(state.flag ? options.delayMs?.arm ?? 2 : options.delayMs?.control ?? 1);
      if (!options.silent) state.chat.push({ name: 'Narrator', mes: `The gate gives way, take ${state.triggers.length}.`, is_user: false });
      state.captures.push({ url: '/api/backends/chat-completions/generate', parsedBody: { type: 'quiet', chat_completion_source: source } });
    },
    deleteLastMessage: async () => { state.chat.pop(); },
    saveChat: async () => undefined,
  };
  const runtime = {
    getActiveCheckpointInfo: () => ({ id: options.checkpoint ?? 'climax' }),
    getStory: () => ({ checkpointById: { [options.checkpoint ?? 'climax']: { effects: options.declared === null ? {} : { reasoning: options.declared ?? 'high' } } } }),
    getRunContext: () => ({ chatId: state.chatId }),
    getSnapshot: () => ({ storyId: options.storyId ?? 'story-a' }),
    getGlobalSettings: () => ({ spikes: { reasoningEffect: state.flag } }),
    setSpikeFlags: (flags: { reasoningEffect: boolean }) => { state.flag = flags.reasoningEffect; state.flagWrites.push(flags.reasoningEffect); },
  };
  const deps: R4LiveDeps = {
    armCapture: async () => ({ armed: true }),
    drain: async (_page, since) => ({ nextIndex: state.captures.length, entries: since >= state.captures.length ? [] : state.captures.slice(since) }),
    waitIdle: async () => undefined,
  };
  return {
    page: { evaluate: (fn, arg) => fn(arg) },
    deps,
    state,
    install: () => {
      Reflect.set(globalThis, 'SillyTavern', { getContext: () => ctx });
      Reflect.set(globalThis, 'storyOrchestratorRuntime', runtime);
      if (options.spikeLoaded !== false) Reflect.set(globalThis, 'storyOrchestratorSpikes', { reasoningEffect: { shots: () => shots } });
    },
    uninstall: () => {
      Reflect.deleteProperty(globalThis, 'SillyTavern');
      Reflect.deleteProperty(globalThis, 'storyOrchestratorRuntime');
      Reflect.deleteProperty(globalThis, 'storyOrchestratorSpikes');
    },
  };
}
