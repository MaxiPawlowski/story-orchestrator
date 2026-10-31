import { STORY_FEATURE_IDS, type StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceContext, WorkspaceIntent, WorkspacePage } from "./workspaceNavigation";

export interface WorkspacePageEntry {
  id: WorkspacePage;
  label: string;
  authorOnly?: true;
  description?: string;
}

export const WORKSPACE_CONTEXT_LABELS: Record<WorkspaceContext, string> = { story: "This chat", orchestrator: "Settings" };
export const WORKSPACE_PAGES: Record<WorkspaceContext, WorkspacePageEntry[]> = {
  story: [{ id: "play", label: "Play" }, { id: "features", label: "Story settings" },
    { id: "review", label: "Review", authorOnly: true }, { id: "author", label: "Author", authorOnly: true }],
  orchestrator: [
    { id: "library", label: "Library", description: "Start, continue or repair a story, or open the Studio." },
    { id: "features", label: "Features", description: "Every feature, on or off for all chats, with its own controls." },
    { id: "models", label: "Models", description: "Which Connection Manager profiles do the extension's work. Affects every chat." },
    { id: "judge", label: "Judge", description: "The optional judge service and the checks it runs." },
    { id: "images", label: "Images & stage", description: "Picture service, when pictures are drawn, and the sprite stage." },
    { id: "world", label: "World & lore", description: "How story lorebooks are scanned and placed." },
    { id: "display", label: "Display", description: "What shows in the chat: notes, the status strip, the briefing and panels." },
    { id: "authoring", label: "Authoring", description: "The wizard, questions, Author view and chapter budgets." },
    { id: "diagnostics", label: "Diagnostics", description: "What this SillyTavern can do, for checking a setup." },
    { id: "help", label: "Help", description: "Quick start, the guided tour, the guide and Help and Ask." },
  ],
};
export const SETTINGS_SUBPAGES: Partial<Record<WorkspacePage, Record<string, string>>> = {
  images: { "picture-types": "Picture types", "model-sources": "Model sources" },
};
export const visiblePages = (context: WorkspaceContext, authorView: boolean): WorkspacePageEntry[] =>
  WORKSPACE_PAGES[context].filter((page) => authorView || !page.authorOnly);
export const defaultPage = (context: WorkspaceContext): WorkspacePage => WORKSPACE_PAGES[context][0].id;
const pageLabel = (context: WorkspaceContext, page: WorkspacePage | undefined): string =>
  WORKSPACE_PAGES[context].find((entry) => entry.id === (page ?? defaultPage(context)))?.label ?? "";
export const workspaceCrumb = (intent: WorkspaceIntent, leaf: string): string => {
  const page = pageLabel(intent.context, intent.page);
  const sub = intent.page && intent.sub ? SETTINGS_SUBPAGES[intent.page]?.[intent.sub] ?? "" : "";
  const prefix = [page, sub].filter(Boolean).join(" › ");
  const strip = (text: string, head: string) => text === head ? "" : head && text.startsWith(`${head} › `) ? text.slice(head.length + 3) : text;
  const rest = [prefix, page, sub].reduce((text, head) => strip(text, head), leaf);
  return [WORKSPACE_CONTEXT_LABELS[intent.context], page, sub, rest].filter(Boolean).join(" › ");
};

export const SETUP_CONTROL = "so-setup";

export const storyPlayIntent = (): WorkspaceIntent => ({ context: "story", page: "play" });
export const LAST_PAGE_KEY = "so-workspace-last-page";
export const resumeIntent = (stored: string | null, authorView: boolean): WorkspaceIntent => {
  const [context, page, sub] = (stored ?? "").split("/");
  const entry = context === "story" || context === "orchestrator" ? visiblePages(context, authorView).find((item) => item.id === page) : undefined;
  if (!entry) return storyPlayIntent();
  const subOk = sub && SETTINGS_SUBPAGES[entry.id]?.[sub];
  return { context: context as WorkspaceContext, page: entry.id, ...(subOk ? { sub } : {}) };
};
export const lastPageValue = (location: { context: WorkspaceContext; page: WorkspacePage; sub?: string; list?: boolean }): string | null =>
  location.list ? null : [location.context, location.page, location.sub].filter(Boolean).join("/");
export const repairIntent = (): WorkspaceIntent => ({ context: "story", page: "play", control: SETUP_CONTROL });
export const modelsIntent = (): WorkspaceIntent => ({ context: "orchestrator", page: "models" });
export const judgeIntent = (control?: string): WorkspaceIntent => ({ context: "orchestrator", page: "judge", ...(control ? { control } : {}) });
export const featureOfControl = (control: string): StoryFeatureId | undefined => {
  const match = /^so-feature-([A-Za-z]+)-/.exec(control);
  return match && (STORY_FEATURE_IDS as readonly string[]).includes(match[1]) ? match[1] as StoryFeatureId : undefined;
};

export const FEATURE_INSTALL_HOMES: Partial<Record<StoryFeatureId, { page: WorkspacePage; control: string }>> = {
  illustrations: { page: "images", control: "so-image-settings" },
  sprites: { page: "images", control: "so-sprite-settings" },
  poses: { page: "images", control: "so-sprite-poses" },
};

const CHAT_SETTINGS = /^(story-library|so-group-story|so-chat-|so-author-view-switch|so-shape-override|so-restart-story|so-delete-story|so-export-state|so-story-identity|so-make-group|so-read-now)/;
const FEATURE_EXTRAS: Record<string, StoryFeatureId> = { "so-keep-last-question": "speakers", "so-inner-harvest": "inner" };
const SETTINGS_PAGES: Array<[RegExp, WorkspacePage, string?]> = [
  [/^(so-entry-|so-open-studio|so-new-story|so-getting-started|so-continue)/, "library"],
  [/^(so-presence-|so-hud-|so-your-move-|so-inline-|so-briefing-|so-player-setup|so-announce-transitions|so-device-display)/, "display"],
  [/^so-judge/, "judge"],
  [/^so-image-route/, "images", "picture-types"],
  [/^so-model-source/, "images", "model-sources"],
  [/^(so-image-|so-sprite-|so-live-head|so-gpu-broker|so-stage-|so-device-sprites)/, "images"],
  [/^(so-wi-|so-lorebooks|so-story-lore|so-world-)/, "world"],
  [/^(so-copilot-|so-chapter-budget|so-authoring-|so-prompt-trials|so-history-notes|so-outward-narration|so-swipe-contrast)/, "authoring"],
  [/^(so-capabilities|so-host-|so-engine-status|so-diagnostics|so-copy-diagnostics|so-context-limit)/, "diagnostics"],
  [/^so-help-/, "help"],
];

export const settingsLocationOf = (control: string): { page: WorkspacePage; sub?: string } => {
  const hit = SETTINGS_PAGES.find(([pattern]) => pattern.test(control));
  return hit ? { page: hit[1], ...(hit[2] ? { sub: hit[2] } : {}) } : { page: "models" };
};

export const settingIntent = (control: string): WorkspaceIntent => {
  const feature = featureOfControl(control);
  if (feature) return { context: "story", page: "features", feature, control };
  if (CHAT_SETTINGS.test(control)) return { context: "story", page: "features", control };
  const extra = Object.entries(FEATURE_EXTRAS).find(([prefix]) => control.startsWith(prefix));
  if (extra) return { context: "orchestrator", page: "features", feature: extra[1], control };
  return { context: "orchestrator", ...settingsLocationOf(control), control };
};
