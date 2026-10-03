import type { PassRole } from "@extraction/passRole";
import type { PassProfiles } from "@runtime/passProfiles";
import type { RoleRouteView } from "@runtime/roleHealth";
import type { RouteMeter } from "@runtime/roleRouteEdits";
import { HARNESS_KEY_PREFIX } from "@utils/harness";
import { effortLabel, isReasoningEffort, REASONING_EFFORTS, type ReasoningEffort } from "@utils/reasoningEffort";
import { settingHelp } from "@features/settingsCopy";
import { FieldLabel } from "./Field";

export interface RoleProfileOption {
  id: string;
  name: string;
  model?: string;
}

export interface HarnessOption {
  key: string;
  label: string;
  vendor: string;
}

export interface RoleHarnessRoute {
  key: string;
  fallback: string | null;
}

export interface RoleProfilesGroupProps {
  routes: RoleRouteView[];
  assigned: PassProfiles;
  profiles: RoleProfileOption[];
  testing: PassRole | null;
  onAssign: (role: PassRole, profileId: string | null) => void;
  onTest: (role: PassRole) => void;
  onEffort: (role: PassRole, effort: ReasoningEffort) => void;
  harnesses?: HarnessOption[];
  harnessRoutes?: Partial<Record<PassRole, RoleHarnessRoute>>;
  meters?: RouteMeter[];
  onHarness?: (role: PassRole, key: string | null) => void;
  onFallback?: (role: PassRole, profileId: string | null) => void;
  onOpen?: () => void;
  authorView?: boolean;
}

const STATE_COPY: Record<RoleRouteView["state"], { text: string; tone: string }> = {
  fallback: { text: "", tone: "" },
  untested: { text: "not tested yet", tone: "opacity-70" },
  ok: { text: "passed its self-test", tone: "so-success-text" },
  missing: { text: "no longer available", tone: "so-error-text" },
  "not-configured": { text: "cannot be used", tone: "so-error-text" },
  "not-answering": { text: "not answering", tone: "so-warning-text" },
  failed: { text: "failed its self-test", tone: "so-error-text" },
  "reasoning-exhausted": { text: "thought without answering", tone: "so-warning-text" },
  "not-logged-in": { text: "not logged in", tone: "so-error-text" },
  quota: { text: "usage limit reached", tone: "so-warning-text" },
};

export const ROLE_EGRESS: Record<PassRole, string> = {
  read: "Story reads send the recent messages, the story's qualities, the current checkpoint and private character knowledge",
  synthesis: "Summaries send memory rows and message windows",
  authoring: "The wizard and the road ahead send the story draft and your notes",
  director: "Speaker direction sends the roster and the recent turns, before every group reply (a harness adds 2-7 s)",
  curator: "The curator sends its lorebook entries and the recent turns",
  inner: "The inner voice sends the drafted character's private knowledge and the recent turns, before that character speaks",
};

export const TESTING_TEXT = "testing…";
export const TESTING_HARNESS_TEXT = "testing… a harness can take a minute or more";

const reasoningNote = (route: RoleRouteView): string | null => {
  if (route.effort === "default" || !route.reasoning) return null;
  if (route.reasoning.unsupported) return `Not applied: ${route.reasoning.unsupported}.`;
  if (!route.reasoning.collapsed) return null;
  const sent = route.reasoning.sent;
  return sent && !sent.startsWith("enable_thinking") ? `This connection has no ${route.effort} level: it runs as ${sent}.` : "This connection only switches thinking on or off.";
};

const meterText = (meter: RouteMeter): string =>
  `${String(meter.calls)} call${meter.calls === 1 ? "" : "s"} this chat (${String(meter.failed)} failed, ${String(meter.fallback)} fell back), ` +
  `${String(meter.inputTokens)} in / ${String(meter.outputTokens)} out tokens`;

export const RoleProfilesGroup = ({
  routes, assigned, profiles, testing, onAssign, onTest, onEffort, harnesses = [], harnessRoutes = {}, meters = [], onHarness, onFallback, onOpen, authorView = false,
}: RoleProfilesGroupProps) => {
  const setRoles = routes.filter((route) => route.state !== "fallback").length;
  const choose = (role: PassRole, value: string) => {
    if (value.startsWith(HARNESS_KEY_PREFIX)) {
      onHarness?.(role, value);
      return;
    }
    if (harnessRoutes[role]) onHarness?.(role, null);
    onAssign(role, value || null);
  };
  return (
    <details id="so-role-profiles" className="text-sm" onToggle={(event) => { if (event.currentTarget.open) onOpen?.(); }}>
      <summary className="cursor-pointer opacity-80">Models per task{setRoles ? ` (${String(setRoles)} set)` : ""}</summary>
      <div className="flex flex-col gap-2 pt-2">
        <div className="text-xs opacity-70">Affects every chat. A task left on "Same as memory model" asks the memory model profile above.</div>
        {routes.map((route) => {
          const harness = harnessRoutes[route.role];
          const value = harness?.key ?? assigned[route.role] ?? "";
          const option = harness ? harnesses.find((entry) => entry.key === harness.key) : null;
          const dangling = !harness && value !== "" && !profiles.some((profile) => profile.id === value);
          const state = STATE_COPY[route.state];
          const note = reasoningNote(route);
          const meter = harness ? meters.find((entry) => entry.route === harness.key) : null;
          return (
            <div key={route.role} data-so="role-profile" data-role={route.role} data-state={route.state} className="flex flex-col gap-1">
              <FieldLabel htmlFor={`so-role-profile-${route.role}`} label={route.label} help={`${ROLE_EGRESS[route.role]}. ${settingHelp("extraction.profiles")}`} />
              <div className="flex flex-col gap-1">
                <select id={`so-role-profile-${route.role}`} value={value} onChange={(event) => choose(route.role, event.target.value)}>
                  <option value="">Same as memory model</option>
                  {dangling && <option value={value}>Missing profile ({value})</option>}
                  <optgroup label="Connection profiles">
                    {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.model ? ` (${profile.model})` : ""}</option>)}
                  </optgroup>
                  {(harnesses.length > 0 || (harness && !option)) && (
                    <optgroup label="Cloud harness (on the SillyTavern server)">
                      {harness && !option && <option value={harness.key}>Unavailable harness ({harness.key})</option>}
                      {harnesses.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              {harness && (
                <>
                  <div data-so="role-egress" className="text-xs opacity-80">
                    {`${ROLE_EGRESS[route.role]} to ${option?.vendor ?? "the harness's vendor"} via ${option?.label ?? harness.key}, from the machine running SillyTavern.`}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <FieldLabel htmlFor={`so-role-fallback-${route.role}`} setting="extraction.routes.*.onFailure.profileId" />
                    <select id={`so-role-fallback-${route.role}`} value={harness.fallback ?? ""} onChange={(event) => onFallback?.(route.role, event.target.value || null)}>
                      <option value="">Pause this task</option>
                      {profiles.map((profile) => <option key={profile.id} value={profile.id}>Use {profile.name}</option>)}
                    </select>
                  </div>
                  {meter && <div data-so="role-meter" className="text-xs opacity-70">{meterText(meter)}</div>}
                </>
              )}
              <div className="flex items-center gap-2 text-xs">
                <FieldLabel htmlFor={`so-role-effort-${route.role}`} setting="extraction.routes.*.route.options.effort" />
                <select
                  id={`so-role-effort-${route.role}`}
                  value={route.effort}
                  onChange={(event) => { if (isReasoningEffort(event.target.value)) onEffort(route.role, event.target.value); }}
                >
                  {REASONING_EFFORTS.map((effort) => <option key={effort} value={effort}>{effortLabel(effort)}</option>)}
                </select>
              </div>
              {note && <div data-so="role-reasoning-note" className="text-xs so-warning-text">{note}</div>}
              {route.state !== "fallback" && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    data-so="role-profile-test"
                    aria-label={`Test ${route.label}`}
                    className="menu_button"
                    disabled={testing !== null || route.state === "missing"}
                    onClick={() => onTest(route.role)}
                  >{testing === route.role ? "Testing…" : "Test"}</button>
                  {testing === route.role
                    ? <span data-so="role-profile-state" data-testing="true" className="opacity-70">{harness ? TESTING_HARNESS_TEXT : TESTING_TEXT}</span>
                    : <span data-so="role-profile-state" className={state.tone}>{state.text}</span>}
                  {testing !== route.role && (authorView || harness) && route.state !== "untested" && route.state !== "ok" && route.detail
                    ? <span data-so="role-profile-detail" className="min-w-0 opacity-80">{route.detail}</span> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
};
