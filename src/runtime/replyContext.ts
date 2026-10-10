export interface ReplyContextInput {
  maxContext: number;
  served: number | null;
  url: string;
}

export interface ContextOverServer {
  set: number;
  served: number;
  url: string;
}

export const contextOverServer = (read: ReplyContextInput | null | undefined): ContextOverServer | null =>
  read && read.served !== null && read.maxContext > read.served ? { set: read.maxContext, served: read.served, url: read.url } : null;

let readReply: () => ContextOverServer | null = () => null;

export const readReplyContextWith = (read: () => ContextOverServer | null): (() => void) => {
  readReply = read;
  return () => {
    if (readReply === read) readReply = () => null;
  };
};

export const replyContextNow = (): ContextOverServer | null => readReply();
