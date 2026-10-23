import { useCallback, useEffect, useRef, useState } from "react";
import type { WriteResult } from "@utils/writeResult";
import { PRESENCE_TEXT } from "@features/presenceCopy";
import { SUGGESTION_SIDE_TEXT } from "@features/suggestionCopy";
import type { SuggestionAsk, SuggestionOutcome, SuggestionSide } from "@runtime/suggestionsHost";
import type { SuggestionLine } from "@runtime/suggestions";

export interface SuggestionsPanelProps {
  request: (again: number) => Promise<SuggestionOutcome>;
  fill: (ask: SuggestionAsk, text: string) => WriteResult;
}

type View = { kind: "loading" } | { kind: "ready"; result: { suggestions: SuggestionLine[]; ask: SuggestionAsk } } | { kind: "failed"; reason: string };

const SideRows = ({ side }: { side: SuggestionSide }) => {
  const help = side.help.flatMap((line) => {
    const hints = line.hints.filter((hint) => side.shows(hint.text)).map((hint) => (hint.have ? SUGGESTION_SIDE_TEXT.youHaveIt(hint.text) : hint.text));
    return hints.length && side.shows(line.label) ? [{ id: line.checkId, text: SUGGESTION_SIDE_TEXT.couldHelp(line.label, hints.join(", ")) }] : [];
  });
  const greyed = side.unavailable.filter((offer) => side.shows(offer.text) && side.shows(offer.reason));
  return (
    <>
      {help.map((line) => <div key={line.id} data-so="suggestions-help" className="text-xs">{line.text}</div>)}
      {greyed.length > 0 && (
        <ul className="flex flex-col gap-1 list-none p-0 m-0">
          {greyed.map((offer) => (
            <li key={offer.id}>
              <button type="button" data-so="suggestion-unavailable" className="menu_button w-full text-left whitespace-normal opacity-50" disabled aria-disabled="true"
                title={`${SUGGESTION_SIDE_TEXT.notYet}: ${offer.reason}`}>
                <span>{offer.text}</span>
                <span className="block text-xs">{offer.reason}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

const AuthorRow = ({ side }: { side: SuggestionSide }) => (side.author ? (
  <div data-so="suggestions-author" className="text-xs opacity-70">
    {SUGGESTION_SIDE_TEXT.author(side.author.anchors.map((entry) => entry.kind).join(", "), side.author.grounded, side.author.lines)}
  </div>
) : null);

export function SuggestionsPanel({ request, fill }: SuggestionsPanelProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [side, setSide] = useState<SuggestionSide | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const live = useRef(true);
  const again = useRef(0);
  const ask = useCallback(() => {
    setView({ kind: "loading" });
    setNotice(null);
    void request(again.current).then((outcome) => {
      if (!live.current) return;
      setSide(outcome.side ?? null);
      setView(outcome.ok ? { kind: "ready", result: { suggestions: outcome.suggestions, ask: outcome.ask } } : { kind: "failed", reason: outcome.reason });
    });
  }, [request]);
  useEffect(() => {
    live.current = true;
    again.current = 0;
    ask();
    return () => { live.current = false; };
  }, [ask]);
  const anchorText = (id: string | undefined) => side?.author?.anchors.find((entry) => entry.id === id)?.text;
  const lines = view.kind === "ready" ? view.result.suggestions.filter((line) => !line.authored || (side?.shows(line.text) ?? false)) : [];
  return (
    <div id="so-suggestions" data-so="suggestions" className="flex flex-col gap-2 text-sm" aria-live="polite">
      {view.kind === "loading" && <div data-so="suggestions-loading" className="opacity-70">{PRESENCE_TEXT.suggestionsLoading}</div>}
      {view.kind === "failed" && <div data-so="suggestions-failed">{view.reason}</div>}
      {view.kind === "ready" && (
        <>
          <div className="text-xs opacity-70">{PRESENCE_TEXT.suggestionsHint}</div>
          <ul className="flex flex-col gap-1 list-none p-0 m-0">
            {lines.map((line) => (
              <li key={line.text}>
                <button type="button" data-so="suggestion" className="menu_button w-full text-left whitespace-normal"
                  onClick={() => {
                    const result = fill(view.result.ask, line.text);
                    setNotice(result.ok ? PRESENCE_TEXT.suggestionsFilled : result.reason);
                  }}>
                  {line.text}
                </button>
                {anchorText(line.anchorId) && <div data-so="suggestion-anchor" className="text-xs opacity-70">{SUGGESTION_SIDE_TEXT.anchorFor(anchorText(line.anchorId) ?? "")}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
      {view.kind !== "loading" && side && <SideRows side={side} />}
      {view.kind !== "loading" && side && <AuthorRow side={side} />}
      {notice && <div data-so="suggestions-notice" className="text-xs">{notice}</div>}
      {view.kind !== "loading" && (
        <button type="button" data-so="suggestions-again" className="menu_button self-start" onClick={() => { again.current += 1; ask(); }}>{PRESENCE_TEXT.suggestionsAgain}</button>
      )}
    </div>
  );
}

export default SuggestionsPanel;
