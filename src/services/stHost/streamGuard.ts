export interface GuardedStream {
  messageId: number;
  isStopped: boolean;
  isFinished: boolean;
  abortController: { abort: (reason?: unknown) => void };
  onProgressStreaming: (messageId: number, text: string, isFinal: boolean) => Promise<void>;
}

export interface StreamGuardDeps {
  processor: () => GuardedStream | null;
  chatId: () => string;
  chat: () => unknown[];
  onToken: (listener: () => void) => () => void;
  settle: () => void;
}

export interface StreamGuard {
  halt: () => boolean;
  release: () => void;
}

export const CHAT_MOVED = "the chat changed while this reply streamed";

export function guardStreamToChat(chatId: string, deps: StreamGuardDeps): StreamGuard {
  const guarded = new Set<GuardedStream>();
  let halted = false;
  const stop = (stream: GuardedStream) => {
    stream.isStopped = true;
    stream.isFinished = true;
    stream.abortController.abort(CHAT_MOVED);
    halted = true;
  };
  const arm = (stream: GuardedStream) => {
    if (guarded.has(stream)) return;
    guarded.add(stream);
    const anchor = deps.chatId() === chatId ? deps.chat()[stream.messageId] : undefined;
    const write = stream.onProgressStreaming;
    stream.onProgressStreaming = async (messageId, text, isFinal) => {
      if (anchor === undefined || deps.chatId() !== chatId || deps.chat()[messageId] !== anchor) {
        stop(stream);
        throw new Error(CHAT_MOVED);
      }
      return write.call(stream, messageId, text, isFinal);
    };
  };
  const live = () => {
    const stream = deps.processor();
    return stream && !stream.isFinished && !stream.isStopped ? stream : null;
  };
  const off = deps.onToken(() => {
    const stream = live();
    if (stream) arm(stream);
  });
  return {
    halt: () => {
      const stream = live();
      if (stream) arm(stream);
      for (const each of guarded) if (!each.isFinished) stop(each);
      return guarded.size > 0;
    },
    release: () => {
      off();
      if (halted) deps.settle();
    },
  };
}
