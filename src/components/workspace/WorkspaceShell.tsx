import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceContext, WorkspaceIntent, WorkspacePage } from "@runtime/workspaceNavigation";
import { WORKSPACE_CONTEXT_LABELS, WORKSPACE_PAGES as PAGES } from "@runtime/workspaceRoutes";

export interface WorkspaceLocation {
  context: WorkspaceContext;
  page: WorkspacePage;
  feature?: StoryFeatureId;
}

export interface WorkspaceShellProps {
  intent: WorkspaceIntent;
  storyTitle: string | null;
  authorView: boolean;
  onClose: () => void;
  render: (location: WorkspaceLocation, navigate: (location: WorkspaceLocation) => void) => ReactNode;
}

const initial = (intent: WorkspaceIntent): WorkspaceLocation => ({ context: intent.context, page: intent.page ?? (intent.context === "story" ? "play" : "library"), feature: intent.feature });

export const WorkspaceShell = ({ intent, storyTitle, authorView, onClose, render }: WorkspaceShellProps) => {
  const [location, setLocation] = useState(() => initial(intent));
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const token = useRef(`so-workspace-${Date.now()}-${performance.now()}`);
  const depth = useRef(0);
  const openedUrl = useRef(window.location.href);
  const initialIntent = useRef(intent).current;
  const opener = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const narrow = () => window.matchMedia("(max-width: 699px)").matches;
  const navigate = (next: WorkspaceLocation) => {
    if (location.feature && !next.feature && next.context === location.context && next.page === location.page) {
      if (depth.current > 1) { history.back(); return; }
      history.replaceState({ soWorkspace: token.current, depth: depth.current, location: next }, "");
      setLocation(next);
      return;
    }
    setLocation(next);
    history.pushState({ soWorkspace: token.current, depth: ++depth.current, location: next }, "");
    document.getElementById("so-workspace-content")?.scrollTo(0, 0);
  };
  useEffect(() => { setLocation(initial(intent)); }, [intent]);
  useEffect(() => {
    const id = token.current, previousFocus = opener.current, url = openedUrl.current;
    dialog.current?.showModal();
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
    if (!intent.control) return;
    const reveal = () => {
      const element = document.getElementById(intent.control ?? "");
      if (!element) return false;
      for (let details = element.closest("details"); details; details = details.parentElement?.closest("details") ?? null) details.open = true;
      element.scrollIntoView({ block: "center" }); element.focus();
      return true;
    };
    if (reveal()) return;
    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect(); });
    if (dialog.current) observer.observe(dialog.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [intent.control, location]);
  const pages = PAGES[location.context];
  const goBack = () => {
    if (depth.current > 1) history.back();
    else if (location.feature) navigate({ ...location, feature: undefined });
    else close.current();
  };
  return createPortal(<dialog id="so-workspace-modal" ref={dialog} data-context={location.context} aria-labelledby="so-workspace-heading"
    onCancel={(event) => { event.preventDefault(); narrow() ? goBack() : close.current(); }} onClose={() => close.current()}>
    <div className="so-workspace-frame">
      <header className="so-workspace-header">
        <div><h1 id="so-workspace-heading">{location.context === "story" ? storyTitle ?? "This story" : "Story Orchestrator"}</h1>
          <span className="so-workspace-scope">{location.context === "story" ? `This chat · ${authorView ? "Author view" : "Player view"}` : "All chats · Install settings"}</span></div>
        <button className="st-button secondary" onClick={onClose} aria-label="Close Story Orchestrator">Close</button>
      </header>
      <div className="so-workspace-context" aria-label="Workspace context">
        <button ref={first} aria-pressed={location.context === "story"} onClick={() => navigate({ context: "story", page: "play" })}>{WORKSPACE_CONTEXT_LABELS.story}</button>
        <button aria-pressed={location.context === "orchestrator"} onClick={() => navigate({ context: "orchestrator", page: "library" })}>{WORKSPACE_CONTEXT_LABELS.orchestrator}</button>
      </div>
      <div className="so-workspace-body">
        <nav className="so-workspace-nav" aria-label={`${location.context === "story" ? "Story" : "Orchestrator"} sections`}>
          {pages.map((page) => <button key={page.id} id={`so-workspace-page-${page.id}`} aria-current={location.page === page.id ? "page" : undefined}
            onClick={() => navigate({ context: location.context, page: page.id })}>{page.label}</button>)}
        </nav>
        <main id="so-workspace-content" className="so-workspace-content">
          <button className="so-mobile-back st-button secondary" onClick={goBack}>← Back</button>
          {render(location, navigate)}
        </main>
      </div>
    </div>
  </dialog>, document.body);
};
