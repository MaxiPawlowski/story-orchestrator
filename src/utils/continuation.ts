export interface ContinuationRunnerOptions<TRequest> {
  initialText: string;
  maxAttempts: number;
  isIncomplete: (text: string) => boolean;
  buildRequest: (fullText: string) => TRequest;
  requestContinuation: (request: TRequest) => Promise<string>;
  onAttemptFailed?: (error: unknown) => void;
  onEmptyResponse?: () => void;
}

export const continueWhileIncomplete = async <TRequest>({
  initialText,
  maxAttempts,
  isIncomplete,
  buildRequest,
  requestContinuation,
  onAttemptFailed,
  onEmptyResponse,
}: ContinuationRunnerOptions<TRequest>): Promise<string> => {
  let appendedText = "";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const continuation = await requestContinuation(buildRequest(initialText + appendedText));
      if (!continuation || !continuation.trim()) {
        onEmptyResponse?.();
        break;
      }

      appendedText += continuation;
      if (!isIncomplete(initialText + appendedText)) {
        break;
      }
    } catch (error) {
      onAttemptFailed?.(error);
      break;
    }
  }

  return appendedText;
};
