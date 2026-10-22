let pending: () => boolean = () => false;

export function watchVoiceChain(source: () => boolean): () => void {
  pending = source;
  return () => { if (pending === source) pending = () => false; };
}

export const voiceChainPending = (): boolean => pending();
