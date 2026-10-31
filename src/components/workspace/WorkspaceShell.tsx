import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceContext, WorkspaceIntent, WorkspacePage } from "@runtime/workspaceNavigation";
import { defaultPage, lastPageValue, SETTINGS_SUBPAGES, visiblePages, WORKSPACE_CONTEXT_LABELS, WORKSPACE_PAGES } from "@runtime/workspaceRoutes";
import { writeLastPage } from "@runtime/lastPage";
import { Dialog, DialogHeader } from "@components/ui/Dialog";
import { NavList } from "@components/ui/NavList";
import { IconButton } from "@components/ui/IconButton";
import { SettingsSearch, type SearchPick } from "./SettingsSearch";

export interface WorkspaceLocation {
  context: WorkspaceContext;
  page: WorkspacePage;
  sub?: string;
  feature?: StoryFeatureId;
  list?: boolean;
}

export type WorkspaceNavigate = (location: WorkspaceLocation, control?: string) => void;

export interface WorkspaceShellProps {
  intent: WorkspaceIntent;
  storyTitle: string | null;
  authorView: boolean;
  onClose: () => void;
  badges?: Partial<Record<WorkspacePage, { text: string; tone?: "neutral" | "info" | "ok" | "warn" | "error" }>>;
  render: (location: WorkspaceLocation, navigate: WorkspaceNavigate) => ReactNode;
}

const NARROW = "(max-width: 699px)";
const narrowNow = () => typeof window.matchMedia === "function" && window.matchMedia(NARROW).matches;

const useNarrow = () => {
  const [narrow, setNarrow] = useState(narrowNow);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(NARROW);
    const change = () => setNarrow(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return narrow;
};

const initial = (intent: WorkspaceIntent): WorkspaceLocation => {
  const list = intent.context === "orchestrator" && !intent.page && !intent.control && narrowNow();
  return { context: intent.context, page: intent.page ?? defaultPage(intent.context), sub: intent.sub, feature: intent.feature, ...(list ? { list } : {}) };
};

const isDetail = (location: WorkspaceLocation) => Boolean(location.feature || location.sub);

export const revealControl = (root: HTMLElement | null, control: string): boolean => {
  const element = document.getElementById(control);
  if (!element || (root && !root.contains(element))) return false;
  for (let details = element.closest("details"); details; details = details.parentElement?.closest("details") ?? null) details.open = true;
  element.scrollIntoView({ block: "center" });
  const focusable = element.matches("button, input, select, textarea, [tabindex]") ? element
    : element.querySelector<HTMLElement>("button[aria-checked='true'], button, input, select, textarea, [tabindex]") ?? element;
  focusable.focus({ preventScroll: true });
  const row = element.closest<HTMLElement>("[data-so='setting-row'], [data-so='feature-row']") ?? element;
  row.classList.add("so-revealed");
  window.setTimeout(() => row.classList.remove("so-revealed"), 2000);
  return true;
};

export const WorkspaceShell = ({ intent, storyTitle, authorView, onClose, badges, render }: WorkspaceShellProps) => {
  const [location, setLocation] = useState(() => initial(intent));
  const [reveal, setReveal] = useState<{ control: string; at: number } | null>(() => intent.control ? { control: intent.control, at: 0 } : null);
  const narrow = useNarrow();
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const token = useRef(`so-workspace-${Date.now()}-${performance.now()}`);
  const depth = useRef(0);
  const openedUrl = useRef(window.location.href);
  const initialIntent = useRef(intent).current;
  const opener = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const navigate: WorkspaceNavigate = (next, control) => {
    if (control) setReveal({ control, at: Date.now() });
    if (isDetail(location) && !isDetail(next) && next.context === location.context && next.page === location.page && !control) {
      if (depth.current > 1) { history.back(); return; }
      history.replaceState({ soWorkspace: token.current, depth: depth.current, location: next }, "");
      setLocation(next);
      return;
    }
    setLocation(next);
    history.pushState({ soWorkspace: token.current, depth: ++depth.current, location: next }, "");
    if (!control) document.getElementById("so-workspace-content")?.scrollTo(0, 0);
  };
  const lastPage = lastPageValue(location);
  useEffect(() => { if (lastPage) writeLastPage(lastPage); }, [lastPage]);
  useEffect(() => {
    setLocation(initial(intent));
    if (intent.control) setReveal({ control: intent.control, at: Date.now() });
  }, [intent]);
  useEffect(() => {
    const id = token.current, previousFocus = opener.current, url = openedUrl.current;
    first.current?.focus();
    history.pushState({ soWorkspace: id, depth: 1, location: initial(initialIntent) }, "");
    depth.current = 1;
    const back = (event: PopStateEvent) => {
      if (event.state?.soWorkspace !== token.current) { depth.current = 0; close.current(); }
      else { depth.current = event.state.depth; setLocation(event.state.location); }
    };
    window.addEventListener("popstate", back);
    const viewport = window.visualViewport;
    const resize = () => {
      if (dialog.current) {
        dialog.current.style.setProperty("--so-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
        dialog.current.style.setProperty("--so-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      }
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("popstate", back);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      if (history.state?.soWorkspace === id && depth.current && window.location.href === url) history.go(-depth.current);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [initialIntent]);
  useEffect(() => {
    if (!reveal) return undefined;
    if (revealControl(dialog.current, reveal.control)) return undefined;
    const observer = new MutationObserver(() => { if (revealControl(dialog.current, reveal.control)) observer.disconnect(); });
    if (dialog.current) observer.observe(dialog.current, { childList: true, subtree: true });
    const stop = window.setTimeout(() => observer.disconnect(), 10_000);
    return () => { observer.disconnect(); window.clearTimeout(stop); };
  }, [reveal, location]);
  const pages = visiblePages(location.context, authorView);
  const inList = narrow && location.context === "orchestrator" && Boolean(location.list);
  const pageLabel = WORKSPACE_PAGES[location.context].find((page) => page.id === location.page)?.label ?? "";
  const subLabel = location.sub ? SETTINGS_SUBPAGES[location.page]?.[location.sub] : undefined;
  const showBack = narrow && (isDetail(location) || (location.context === "orchestrator" && !inList));
  const goBack = () => {
    if (depth.current > 1) history.back();
    else if (isDetail(location)) navigate({ context: location.context, page: location.page });
    else if (location.context === "orchestrator" && !inList) navigate({ context: "orchestrator", page: location.page, list: true });
    else close.current();
  };
  const switchContext = (context: WorkspaceContext) => {
    if (context === location.context) return;
    navigate(context === "orchestrator" && narrow ? { context, page: defaultPage(context), list: true } : { context, page: defaultPage(context) });
  };
  const pick = (choice: SearchPick) => navigate({ context: choice.intent.context, page: choice.intent.page ?? defaultPage(choice.intent.context),
    sub: choice.intent.sub, feature: choice.intent.feature }, choice.intent.control);
  const title = location.context === "story" ? storyTitle ?? "This chat" : "Story Orchestrator";
  const subtitle = location.context === "story" ? `This chat · ${authorView ? "Author view" : "Player view"}` : "Settings · all chats";
  const mobileTitle = showBack ? [pageLabel, subLabel].filter(Boolean).join(" › ") : title;
  const navGroups = [{ items: pages.map((page) => ({
    id: page.id, label: page.label, elementId: `so-workspace-page-${page.id}`,
    ...(location.context === "orchestrator" && badges?.[page.id] ? { badge: badges[page.id] } : {}),
  })) }];
  return createPortal(<Dialog id="so-workspace-modal" size="full" ref={dialog} data-context={location.context} data-view={inList ? "list" : "page"}
    aria-labelledby="so-workspace-heading" onCancel={(event) => { event.preventDefault(); if (narrow && showBack) goBack(); else close.current(); }}
    onClose={() => close.current()}>
    <div className="so-workspace-frame so-dialog-frame">
      <DialogHeader className="so-workspace-header" level={1} titleId="so-workspace-heading" title={narrow ? mobileTitle : title}
        subtitle={narrow && showBack ? undefined : subtitle} onClose={onClose} closeLabel="Close Story Orchestrator">
        {showBack && <IconButton id="so-workspace-back" className="so-workspace-back" icon="fa-chevron-left"
          label={isDetail(location) ? `Back to ${pageLabel}` : "Back to Settings"} onClick={goBack} />}
        <div className="so-workspace-context" role="group" aria-label="Workspace context">
          {(["story", "orchestrator"] as const).map((context) => <button key={context} type="button" id={`so-workspace-context-${context}`}
            ref={context === "story" ? first : undefined} className="so-workspace-context-btn" aria-pressed={location.context === context}
            onClick={() => switchContext(context)}>{WORKSPACE_CONTEXT_LABELS[context]}</button>)}
        </div>
        <SettingsSearch authorView={authorView} onPick={pick} />
      </DialogHeader>
      <div className="so-workspace-body">
        {(location.context === "story" ? pages.length > 1 : !narrow || inList) && <NavList id="so-workspace-nav" className="so-workspace-nav"
          label={`${WORKSPACE_CONTEXT_LABELS[location.context]} sections`} groups={navGroups} value={inList ? "" : location.page}
          mobile={location.context === "story" ? "bar" : "stack"}
          onSelect={(page) => navigate({ context: location.context, page: page as WorkspacePage })} />}
        {!inList && <main id="so-workspace-content" className="so-workspace-content">
          {render(location, navigate)}
        </main>}
      </div>
    </div>
  </Dialog>, document.body);
};
