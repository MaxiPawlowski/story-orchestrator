import { ModelCallError } from "@extraction/modelError";
import type { ExtractionReply, ModelRoute } from "@extraction/modelRoute";
import { routeKey } from "@extraction/modelRoute";
import type { PassRole } from "@extraction/passRole";
import type { NoteCall } from "./modelCallCore";
import { roleEffort, roleHarness, type RouteSettings } from "./passProfiles";

export const fallbackRoute = (settings: RouteSettings, role: PassRole, exists: (profileId: string) => boolean): ModelRoute | null => {
  const profileId = roleHarness(settings, role) ? settings.routes?.[role]?.onFailure?.profileId : undefined;
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
}

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
  return answer;
}
