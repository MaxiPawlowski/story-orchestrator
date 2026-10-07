import { useEffect, useMemo, useRef, useState } from "react";
import { GUIDE_COPY } from "@features/helpCopy";
import { GuideMarkdown, headingDomId } from "./GuideMarkdown";
import { groupPages, indexPages, searchGuide, visiblePages } from "./search";
import type { GuidePage, GuideTarget } from "./types";

export interface GuideReaderProps {
  pages: readonly GuidePage[];
  authorView: boolean;
  homePage: string;
  target: GuideTarget | null;
  onTargetSeen?: () => void;
}

export const HOME_ID = "README";

const sameTarget = (a: GuideTarget | undefined, b: GuideTarget) => a?.id === b.id && a?.anchor === b.anchor;

export function GuideReader({ pages, authorView, homePage, target, onTargetSeen }: GuideReaderProps) {
  const shown = useMemo(() => visiblePages(pages, authorView), [pages, authorView]);
  const index = useMemo(() => indexPages(shown), [shown]);
  const groups = useMemo(() => groupPages(shown), [shown]);
  const [nav, setNav] = useState<{ history: GuideTarget[]; position: number }>(() => ({ history: [target ?? { id: HOME_ID }], position: 0 }));
  const { history, position } = nav;
  const [query, setQuery] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const seen = useRef(onTargetSeen);
  seen.current = onTargetSeen;

  const go = (next: GuideTarget) => {
    setQuery("");
    setNav((state) => (sameTarget(state.history[state.position], next)
      ? state
      : { history: [...state.history.slice(0, state.position + 1), next], position: state.position + 1 }));
  };

  useEffect(() => {
    if (!target) return;
    go(target);
    seen.current?.();
  }, [target]);

  const current = history[position] ?? { id: HOME_ID };
  const page = shown.find((candidate) => candidate.id === current.id) ?? null;
  const searching = query.trim().length > 0;
  const hits = searching ? searchGuide(index, query) : null;

  useEffect(() => {
    const container = body.current;
    if (!container || searching) return;
    const anchor = current.anchor ? container.querySelector(`#${CSS.escape(headingDomId(current.anchor))}`) : null;
    if (anchor) anchor.scrollIntoView({ block: "start" });
    else container.scrollTop = 0;
  }, [current.id, current.anchor, searching]);

  const githubUrl = page && homePage ? `${homePage}/blob/master/docs/guide/${page.doc}` : null;

  return (
    <section id="so-guide" aria-label={GUIDE_COPY.title} className="so-guide flex h-full min-h-0 flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" data-so="guide-back" className="menu_button fa-solid fa-arrow-left" aria-label={GUIDE_COPY.back} title={GUIDE_COPY.back}
          disabled={position === 0} onClick={() => { setQuery(""); setNav((state) => ({ ...state, position: Math.max(0, state.position - 1) })); }} />
        <button type="button" data-so="guide-forward" className="menu_button fa-solid fa-arrow-right" aria-label={GUIDE_COPY.forward} title={GUIDE_COPY.forward}
          disabled={position >= history.length - 1} onClick={() => { setQuery(""); setNav((state) => ({ ...state, position: Math.min(state.history.length - 1, state.position + 1) })); }} />
        <input id="so-guide-search" type="search" className="text_pole min-w-0 flex-1" aria-label={GUIDE_COPY.search} placeholder={GUIDE_COPY.searchPlaceholder}
          value={query} onChange={(event) => setQuery(event.target.value)} />
        {githubUrl && <a data-so="guide-github" className="text-xs underline" href={githubUrl} target="_blank" rel="noreferrer">{GUIDE_COPY.onGitHub}</a>}
      </div>
      <select data-so="guide-nav-select" className="text_pole md:hidden" aria-label={GUIDE_COPY.pages} value={page?.id ?? ""}
        onChange={(event) => go({ id: event.target.value })}>
        {groups.map((group) => (
          <optgroup key={group.audience} label={GUIDE_COPY.audience[group.audience]}>
            {group.pages.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
          </optgroup>
        ))}
      </select>
      <div className="flex min-h-0 flex-1 gap-3">
        <nav data-so="guide-nav" aria-label={GUIDE_COPY.pages} className="so-guide-nav hidden w-48 shrink-0 flex-col gap-2 overflow-y-auto md:flex">
          {groups.map((group) => (
            <div key={group.audience} data-audience={group.audience} className="flex flex-col gap-0.5">
              <div className="text-xs font-medium uppercase opacity-80">{GUIDE_COPY.audience[group.audience]}</div>
              {group.pages.map((entry) => (
                <button key={entry.id} type="button" data-so="guide-nav-item" data-page={entry.id} aria-current={entry.id === page?.id ? "page" : undefined}
                  className={`so-guide-nav-item text-left text-xs ${entry.id === page?.id ? "font-semibold" : "opacity-80"}`} onClick={() => go({ id: entry.id })}>
                  {entry.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div ref={body} className="so-guide-content min-w-0 flex-1 overflow-y-auto pr-1">
          {hits ? (
            hits.length ? (
              <ul data-so="guide-results" className="flex flex-col gap-2">
                {hits.map((hit) => (
                  <li key={hit.page.id}>
                    <button type="button" data-so="guide-result" data-page={hit.page.id} className="text-left" onClick={() => go({ id: hit.page.id })}>
                      <div className="font-medium underline">{hit.page.title}</div>
                      <div className="text-xs opacity-80">{hit.snippet}</div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <div data-so="guide-no-match" className="text-xs opacity-80">{GUIDE_COPY.noMatch}</div>
          ) : page ? (
            <GuideMarkdown doc={page.doc} body={page.body} homePage={homePage} onNavigate={go} />
          ) : (
            <div data-so="guide-missing" className="text-xs opacity-80">{GUIDE_COPY.missing}</div>
          )}
        </div>
      </div>
    </section>
  );
}
