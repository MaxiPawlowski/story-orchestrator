import { ModelCallError } from "@extraction/modelError";
import type { ExtractionReply, FellBack, ModelRoute } from "@extraction/modelRoute";
import { routeKey, routeLabel } from "@extraction/modelRoute";
import type { PassRole } from "@extraction/passRole";
import type { NoteCall } from "./modelCallCore";
import { defaultFallbackRoute, roleEffort, roleHarness, type RouteSettings } from "./passProfiles";

export const fallbackRoute = (settings: RouteSettings, role: PassRole, exists: (profileId: string) => boolean): ModelRoute | null => {
  if (!roleHarness(settings, role)) return defaultFallbackRoute(settings, role, exists);
  const profileId = settings.routes?.[role]?.onFailure?.profileId;
  if (!profileId || !exists(profileId)) return null;
  const effort = roleEffort(settings, role);
  return effort === "default" ? { kind: "profile", profileId } : { kind: "profile", profileId, effort };
};

export interface FallbackInput {
  error: unknown;
  route: ModelRoute;
  settings: RouteSettings;
  role: PassRole;
  exists: (profileId: string) => boolean;
  run: (route: ModelRoute) => Promise<ExtractionReply>;
  note: NoteCall;
  fallback?: ModelRoute | null;
  label?: (profileId: string) => string;
}

const fellBackFrom = (input: FallbackInput, fallback: ModelRoute, answer: ExtractionReply): FellBack => {
  const label = input.label ?? ((id: string) => id);
  const by = routeKey(fallback);
  return {
    from: routeKey(input.route),
    fromLabel: routeLabel(routeKey(input.route), label),
    kind: input.error instanceof ModelCallError ? input.error.kind : "transport",
    reason: input.error instanceof Error ? input.error.message : String(input.error),
    by,
    label: routeLabel(by, label),
    model: answer.model ?? null,
  };
};

export async function answerFallback(input: FallbackInput): Promise<ExtractionReply> {
  const fallback = input.fallback === undefined ? fallbackRoute(input.settings, input.role, input.exists) : input.fallback;
  if (!fallback) throw input.error;
  const startedAt = Date.now();
  let answer: ExtractionReply;
  try {
    answer = await input.run(fallback);
  } catch (error) {
    input.note(fallback, startedAt, error instanceof ModelCallError ? error.kind : "transport", undefined, routeKey(input.route));
    throw error;
  }
  input.note(fallback, startedAt, "fallback", answer, routeKey(input.route));
  return { ...answer, fellBack: fellBackFrom(input, fallback, answer) };
}
