import type { TalkControl } from "@engine/index";
import type { JudgeDirectorDecision, JudgeDirectorInput } from "@judge/index";
import { directorInstruction, findCandidate, parseDirectorResponse, renderDirectorPrompt, type DirectorWindowMessage, type TalkCandidate, type TalkDecisionSource } from "@talk/index";
import { timeoutAbortReason } from "@utils/signals";
import { log } from "@utils/log";

export const DIRECTOR_TIMEOUT_MS = 20000;

export type JudgeNote = { confidence: number; via: "choice" | "composite" };

export type Decision =
  | { kind: "pass" }
  | { kind: "silence"; source: TalkDecisionSource; judge?: JudgeNote }
  | { kind: "player"; source: TalkDecisionSource; judge?: JudgeNote }
  | { kind: "member"; rosterId: string; name: string; source: TalkDecisionSource; judge?: JudgeNote };

export interface DirectorHost {
  getCheckpointInfo(): { name: string; objective: string; storyTitle: string } | null;
  judgeDirector?(input: JudgeDirectorInput): Promise<JudgeDirectorDecision | null>;
  callDirector(prompt: string, signal: AbortSignal): Promise<string>;
  getPlayerName?(): string;
}

export interface DirectorAsk {
  control: TalkControl;
  candidates: TalkCandidate[];
  window: DirectorWindowMessage[];
  handBack: boolean;
  sceneWork: boolean;
  leadPreferred: boolean;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    onTimeout();
    reject(new Error("director timeout"));
  }, ms);
  promise.then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

export async function runJudgeDecision(host: DirectorHost, ask: DirectorAsk): Promise<Decision | null> {
  const info = host.getCheckpointInfo();
  if (!host.judgeDirector || !info) return null;
  const { control, candidates, window, handBack, sceneWork } = ask;
  const instruction = directorInstruction(control);
  const lead = ask.leadPreferred ? findCandidate(candidates, control.lead)?.name : undefined;
  try {
    const verdict = await host.judgeDirector({
      checkpointName: info.name,
      objective: info.objective,
      ...(instruction ? { instruction } : {}),
      player: host.getPlayerName?.() ?? "",
      candidates: candidates.map((candidate) => ({ rosterId: candidate.rosterId, name: candidate.name, ...(candidate.role ? { role: candidate.role } : {}) })),
      ...(lead ? { lead } : {}),
      allowSilence: control.allow_silence === true,
      ...(handBack ? { allowHandBack: true } : {}),
      ...(sceneWork ? {} : { sceneWork: false }),
      window,
    });
    if (!verdict) return null;
    const judge = { confidence: verdict.confidence, via: verdict.via };
    if (verdict.kind === "silence") return { kind: "silence", source: "judge", judge };
    if (verdict.kind === "player") return { kind: "player", source: "judge", judge };
    const candidate = candidates.find((entry) => entry.rosterId === verdict.rosterId);
    return candidate ? { kind: "member", rosterId: candidate.rosterId, name: candidate.name, source: "judge", judge } : null;
  } catch (error) {
    log.warn("speaker direction: the judge failed, so the rules pick stands", error);
    return null;
  }
}

export async function runDirectorDecision(host: DirectorHost, ask: DirectorAsk): Promise<Decision | null> {
  const info = host.getCheckpointInfo();
  if (!info) return null;
  const { control, candidates: pool, window, handBack, sceneWork } = ask;
  const allowSilence = control.allow_silence === true;
  const prompt = renderDirectorPrompt({
    storyTitle: info.storyTitle,
    checkpointName: info.name,
    objective: info.objective,
    candidates: pool,
    allowSilence,
    ...(handBack ? { handBack: true } : {}),
    playerName: host.getPlayerName?.() ?? undefined,
    lead: ask.leadPreferred ? findCandidate(pool, control.lead)?.name : undefined,
    ...(sceneWork ? {} : { sceneWork: false }),
    instruction: directorInstruction(control),
    window,
  });
  const controller = new AbortController();
  try {
    const raw = await withTimeout(
      host.callDirector(prompt, controller.signal),
      DIRECTOR_TIMEOUT_MS,
      () => controller.abort(timeoutAbortReason(`the director did not answer within ${DIRECTOR_TIMEOUT_MS} ms`)),
    );
    const verdict = parseDirectorResponse(raw, pool, allowSilence, handBack);
    if (!verdict) return null;
    if (verdict.handBack) return { kind: "player", source: "director" };
    if (verdict.rosterId === null) return { kind: "silence", source: "director" };
    const candidate = pool.find((entry) => entry.rosterId === verdict.rosterId);
    return candidate ? { kind: "member", rosterId: candidate.rosterId, name: candidate.name, source: "director" } : null;
  } catch (error) {
    log.warn("speaker direction: the director failed, so the rules pick stands", error);
    return null;
  }
}
