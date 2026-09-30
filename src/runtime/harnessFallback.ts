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
}

export async function answerFallback(input: FallbackInput): Promise<ExtractionReply> {
  const fallback = fallbackRoute(input.settings, input.role, input.exists);
  if (!fallback) throw input.error;
  const startedAt = Date.now();
  const answer = await input.run(fallback);
  input.note(fallback, startedAt, "fallback", answer, routeKey(input.route));
  return answer;
}
