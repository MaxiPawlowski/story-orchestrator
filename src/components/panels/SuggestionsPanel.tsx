import { useCallback, useEffect, useRef, useState } from "react";
import type { WriteResult } from "@utils/writeResult";
import { PRESENCE_TEXT } from "@features/presenceCopy";
import type { SuggestionAsk, SuggestionOutcome } from "@runtime/suggestionsHost";

export interface SuggestionsPanelProps {
  request: () => Promise<SuggestionOutcome>;
  fill: (ask: SuggestionAsk, text: string) => WriteResult;
}

type View = { kind: "loading" } | { kind: "ready"; result: { suggestions: string[]; ask: SuggestionAsk } } | { kind: "failed"; reason: string };

export function SuggestionsPanel({ request, fill }: SuggestionsPanelProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const live = useRef(true);
  const ask = useCallback(() => {
    setView({ kind: "loading" });
    setNotice(null);
    void request().then((outcome) => {
      if (!live.current) return;
      setView(outcome.ok ? { kind: "ready", result: { suggestions: outcome.suggestions, ask: outcome.ask } } : { kind: "failed", reason: outcome.reason });
    });
  }, [request]);
  useEffect(() => {
    live.current = true;
    ask();
    return () => { live.current = false; };
  }, [ask]);
  return (
    <div id="so-suggestions" data-so="suggestions" className="flex flex-col gap-2 text-sm" aria-live="polite">
      {view.kind === "loading" && <div data-so="suggestions-loading" className="opacity-70">{PRESENCE_TEXT.suggestionsLoading}</div>}
      {view.kind === "failed" && <div data-so="suggestions-failed">{view.reason}</div>}
      {view.kind === "ready" && (
        <>
          <div className="text-xs opacity-70">{PRESENCE_TEXT.suggestionsHint}</div>
          <ul className="flex flex-col gap-1 list-none p-0 m-0">
            {view.result.suggestions.map((text) => (
              <li key={text}>
                <button type="button" data-so="suggestion" className="menu_button w-full text-left whitespace-normal"
                  onClick={() => {
                    const result = fill(view.result.ask, text);
                    setNotice(result.ok ? PRESENCE_TEXT.suggestionsFilled : result.reason);
                  }}>
                  {text}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {notice && <div data-so="suggestions-notice" className="text-xs">{notice}</div>}
      {view.kind !== "loading" && (
        <button type="button" data-so="suggestions-again" className="menu_button self-start" onClick={ask}>{PRESENCE_TEXT.suggestionsAgain}</button>
      )}
    </div>
  );
}

export default SuggestionsPanel;
