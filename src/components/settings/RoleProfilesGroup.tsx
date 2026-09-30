import type { PassRole } from "@extraction/passRole";
import type { PassProfiles } from "@runtime/passProfiles";
import type { RoleRouteView } from "@runtime/roleHealth";
import { effortLabel, isReasoningEffort, REASONING_EFFORTS, type ReasoningEffort } from "@utils/reasoningEffort";

export interface RoleProfileOption {
  id: string;
  name: string;
  model?: string;
}

export interface RoleProfilesGroupProps {
  routes: RoleRouteView[];
  assigned: PassProfiles;
  profiles: RoleProfileOption[];
  testing: PassRole | null;
  onAssign: (role: PassRole, profileId: string | null) => void;
  onTest: (role: PassRole) => void;
  onEffort: (role: PassRole, effort: ReasoningEffort) => void;
}

const STATE_COPY: Record<RoleRouteView["state"], { text: string; tone: string }> = {
  fallback: { text: "", tone: "" },
  untested: { text: "not tested yet", tone: "opacity-70" },
  ok: { text: "passed its self-test", tone: "text-green-400" },
  missing: { text: "profile no longer exists", tone: "text-red-300" },
  "not-configured": { text: "cannot be used", tone: "text-red-300" },
  "not-answering": { text: "not answering", tone: "text-yellow-300" },
  failed: { text: "failed its self-test", tone: "text-red-300" },
  "reasoning-exhausted": { text: "thought without answering", tone: "text-yellow-300" },
};

const reasoningNote = (route: RoleRouteView): string | null => {
  if (route.effort === "default" || !route.reasoning) return null;
  if (route.reasoning.unsupported) return `Not applied: ${route.reasoning.unsupported}.`;
  return route.reasoning.collapsed ? "This connection only switches thinking on or off." : null;
};

export const RoleProfilesGroup = ({ routes, assigned, profiles, testing, onAssign, onTest, onEffort }: RoleProfilesGroupProps) => {
  const setRoles = routes.filter((route) => route.state !== "fallback").length;
  return (
    <details id="so-role-profiles" className="text-sm">
      <summary className="cursor-pointer opacity-80">Models per task{setRoles ? ` (${String(setRoles)} set)` : ""}</summary>
      <div className="flex flex-col gap-2 pt-2">
        <div className="text-xs opacity-70">Affects every chat. A task left on "Same as memory model" asks the memory model profile above.</div>
        {routes.map((route) => {
          const value = assigned[route.role] ?? "";
          const dangling = value !== "" && !profiles.some((profile) => profile.id === value);
          const state = STATE_COPY[route.state];
          const note = reasoningNote(route);
          return (
            <div key={route.role} data-so="role-profile" data-role={route.role} data-state={route.state} className="flex flex-col gap-1">
              <label className="flex flex-col gap-1">
                <span>{route.label}</span>
                <select id={`so-role-profile-${route.role}`} value={value} onChange={(event) => onAssign(route.role, event.target.value || null)}>
                  <option value="">Same as memory model</option>
                  {dangling && <option value={value}>Missing profile ({value})</option>}
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.model ? ` (${profile.model})` : ""}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <span className="opacity-80">Reasoning effort</span>
                <select
                  id={`so-role-effort-${route.role}`}
                  value={route.effort}
                  onChange={(event) => { if (isReasoningEffort(event.target.value)) onEffort(route.role, event.target.value); }}
                >
                  {REASONING_EFFORTS.map((effort) => <option key={effort} value={effort}>{effortLabel(effort)}</option>)}
                </select>
              </label>
              {note && <div data-so="role-reasoning-note" className="text-xs text-yellow-300">{note}</div>}
              {route.state !== "fallback" && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    data-so="role-profile-test"
                    className="menu_button"
                    disabled={testing !== null || route.state === "missing"}
                    onClick={() => onTest(route.role)}
                  >{testing === route.role ? "Testing…" : "Test"}</button>
                  <span data-so="role-profile-state" className={state.tone}>{state.text}</span>
                  {route.state !== "untested" && route.state !== "ok" && <span className="min-w-0 opacity-80">{route.detail}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
};
