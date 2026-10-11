import { spikeCalls } from "@judge/ideaSpikes";
import { noulAnswer, scoreAnswer } from "@judge/questions";
import { PICTURE_NOW_P, PICTURE_STRIKING_MIN } from "@judge/ideaSpikes";
import type { JudgeRuntime } from "@runtime/judge";

export async function judgePicture(judge: JudgeRuntime | null, reply: string): Promise<boolean | null> {
  if (!judge?.active("pictureCue")) return null;
  const request = spikeCalls("picture", { revision: 1, rows: [{ id: "reply", reply, label: "skip", trap: "none" }] })[0].request;
  const result = await judge.ask("pictureCue", request, { timeoutMs: 2500 });
  if (!result.answers || result.discarded) return null;
  const striking = scoreAnswer(result.answers, "striking")?.score ?? null;
  const now = noulAnswer(result.answers, "now");
  return striking === null || now === null ? null : striking >= PICTURE_STRIKING_MIN && now >= PICTURE_NOW_P;
}
