type TalkKit = typeof import("./talkControl");

let kit: TalkKit | null = null;

export const talkKit = (): TalkKit | null => kit;

export const loadTalkKit = async (): Promise<TalkKit> => (kit ??= await import("./talkControl"));
