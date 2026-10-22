import type { DeliverySheet, NormalizedStory, RosterMember } from "@engine/index";
import { deliveryNames } from "@engine/validate/delivery";
import { gameLayer } from "@engine/validate/gameLayer";
import { routeKey, type RouteResolution } from "@extraction/modelRoute";
import { candidateKey, CONTINUED_TYPES, rowIneligible, type ConsumptionLedger, type PolishRow } from "../../polish/ledger";
import { judgePolish, planPolish, type PolishPlan } from "../../polish/plan";
import type { ContextLine } from "../../polish/prompt";
import { deliveryResolver, mineRepetitionBy } from "../delivery/mine";
import { fingerprintOf } from "../fingerprints";
import { withheldNames } from "../playerProjection";
import { POLISH_RING_CAP, type PolishRecord, type PolishVerdict } from "./ring";
import { beginRun } from "../runToken";
import type { PolishHostDeps } from "./types";

export interface ShadowTuning {
  holdMs: number;
  maxPerHour: number;
}

export interface ShadowDeps {
  host: PolishHostDeps;
  ledger: ConsumptionLedger;
  route: () => RouteResolution;
  planted: () => boolean;
  tuning: () => ShadowTuning;
  playerName: () => string;
  now: () => number;
}

const HOUR_MS = 3600000;

const sheetFor = (story: NormalizedStory, member: RosterMember): DeliverySheet | undefined =>
  member.polish ?? (member.view === "omniscient" ? story.polish?.narration : undefined);

const moodOf = (story: NormalizedStory, member: RosterMember, values: Record<string, unknown>): string | null => {
  const life = story.life?.members.find((entry) => entry.id === member.id);
  const layer = life?.mood ? gameLayer() : null;
  return life && layer ? layer.life.effectiveMood(life, values as Parameters<typeof layer.life.effectiveMood>[1]) : null;
};

const contextBefore = (rows: readonly unknown[], id: number): ContextLine[] => rows.slice(0, id)
  .map((row) => row as PolishRow)
  .filter((row) => row && row.is_system !== true && typeof row.mes === "string" && row.mes.trim() !== "")
  .slice(-2)
  .map((row) => ({ speaker: String(row.name ?? ""), text: row.mes as string }));

const revisionOf = (row: PolishRow) => `${String(row.send_date ?? "")}|${typeof row.swipe_id === "number" ? row.swipe_id : 0}`;

export function createShadow(deps: ShadowDeps) {
  const calls: number[] = [];
  const stopped = new Set<number>();
  const seen = new Map<string, string>();

  const record = (entry: PolishRecord) => {
    deps.host.setRing([...deps.host.ring(), entry].slice(-POLISH_RING_CAP));
  };

  const base = (row: PolishRow, id: number, speaker: string, plan: PolishPlan, verdict: PolishVerdict): PolishRecord => ({
    messageId: id, sendDate: String(row.send_date ?? ""), swipeId: typeof row.swipe_id === "number" ? row.swipe_id : 0, speaker, mode: "shadow",
    at: new Date(deps.now()).toISOString(), verdict, findings: plan.findings.map((finding) => ({ kind: finding.kind, phrase: finding.phrase })),
  });

  const prepare = (id: number, type: unknown) => {
    const story = deps.host.story();
    const state = deps.host.state();
    const feature = deps.host.feature();
    if (!story || !state || !feature.enabled || feature.controls.mode?.value === "off") return null;
    const rows = deps.host.rows();
    const row = rows[id] as PolishRow | undefined;
    if (!row || rowIneligible(row, type, stopped.has(id))) return null;
    const text = row.mes as string;
    const continued = typeof type === "string" && CONTINUED_TYPES.has(type);
    const prefix = continued ? seen.get(revisionOf(row)) : "";
    seen.set(revisionOf(row), text);
    if (prefix === undefined || !text.startsWith(prefix)) return null;
    const memberId = typeof row.name === "string" ? deliveryResolver(story)(row.name) : null;
    const member = memberId ? story.roster.find((entry) => entry.id === memberId) : undefined;
    if (!member || member.polish?.enabled === false) return null;
    const report = mineRepetitionBy(rows.slice(0, id + 1), story).get(member.id);
    const values = state.blackboard.values as Record<string, unknown>;
    const resting = deps.host.resting();
    const plan = planPolish({
      reply: text, from: prefix.length, speaker: member.name ?? member.id, sheet: sheetFor(story, member), tics: report?.tics ?? [], repeats: report?.hot ?? [],
      mood: moodOf(story, member, values), withheld: withheldNames(story, state.visitedPath, state.activeCheckpointId, values), resting, context: contextBefore(rows, id),
    });
    return "skip" in plan ? null : { story, row, plan, resting };
  };

  const receive = async (id: number, type: unknown): Promise<void> => {
    const prepared = prepare(id, type);
    if (!prepared) return;
    const { story, row, plan, resting } = prepared;
    const now = deps.now();
    while (calls.length && now - calls[0] > HOUR_MS) calls.shift();
    if (calls.length >= deps.tuning().maxPerHour) { record(base(row, id, plan.speaker, plan, "rate-limited")); return; }
    const route = deps.route();
    if (!deps.planted() && (!route.ok || !route.route || route.source === "fallback")) { record(base(row, id, plan.speaker, plan, "no-route")); return; }
    calls.push(now);
    const chatId = deps.host.chatId() ?? "";
    const candidate = deps.ledger.start(candidateKey(row, chatId, id, fingerprintOf), plan.findings.length, now, deps.tuning().holdMs);
    const run = beginRun(deps.host.ownership, { from: id, to: id });
    try {
      const answer = await deps.host.model(plan.prompt, { role: "polish", pass: "polish", maxTokens: plan.maxTokens, temperature: 0.4 });
      deps.ledger.observe({ kind: "tick", now: deps.now() });
      if (!run.stillOwns() || deps.host.story() !== story) return;
      const verdict = judgePolish(plan, answer, {
        names: deliveryNames(story), playerNames: [deps.playerName()].filter(Boolean), restates: (text) => resting(text) !== text,
      });
      record({
        ...base(row, id, plan.speaker, plan, verdict.status), latencyMs: deps.now() - now, ...(candidate.abandoned ? { consumedBy: candidate.abandoned } : {}),
        ...(route.ok && route.route ? { route: routeKey(route.route) } : {}), ...(verdict.refusals.length ? { refusals: verdict.refusals.map((refusal) => refusal.code) } : {}),
        windows: plan.windows.map((window, position) => ({ before: window.text, ...(verdict.replaced[position] !== undefined ? { after: verdict.replaced[position] } : {}) })),
      });
    } catch (error) {
      if (!run.stillOwns()) return;
      record({ ...base(row, id, plan.speaker, plan, "error"), latencyMs: deps.now() - now, refusals: [error instanceof Error ? error.message.slice(0, 160) : "error"] });
    } finally {
      deps.ledger.close(candidate);
    }
    if (run.stillOwns()) await deps.host.persist();
  };

  return { receive, noteStopped: (id: number | null) => { if (id !== null) stopped.add(id); }, calls: () => calls.length };
}
