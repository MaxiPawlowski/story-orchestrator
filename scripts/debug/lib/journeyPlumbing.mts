export const PLUMBING_REPLY = 'The scene moves on quietly.';

export const plumbingReplyEval = (text: string = PLUMBING_REPLY): string => [
  "const rt = globalThis.storyOrchestratorRuntime; const ctx = SillyTavern.getContext(); const st = rt.getStory(); const names = rt.getSnapshot().castNames ?? {};",
  "const group = ctx.groups.find((g) => String(g.id) === String(ctx.groupId)); const off = new Set(group?.disabled_members ?? []);",
  "const enabled = (group?.members ?? []).filter((a) => !off.has(a)).map((a) => ctx.characters.find((c) => c.avatar === a)?.name).filter(Boolean);",
  "const narrator = st?.roster?.find((m) => m.view === 'omniscient'); const named = narrator ? (names[narrator.id] ?? narrator.name) : null;",
  "const pick = named && enabled.includes(named) ? named : enabled[0]; if (!pick) throw new Error('no enabled member to speak');",
  `const line = ${JSON.stringify(text)}; const before = ctx.chat.length; await ctx.executeSlashCommandsWithOptions('/sendas name=' + JSON.stringify(pick) + ' ' + line);`,
  "for (let i = 0; i < 40 && ctx.chat.length <= before; i += 1) await new Promise((r) => setTimeout(r, 250)); if (ctx.chat.length <= before) throw new Error('the plumbing reply did not land');",
  "return { plumbingReply: true };",
].join(' ');

type Step = Record<string, unknown>;
type Check = { id: string; steps: Step[] } & Record<string, unknown>;
type Journey = { id: string; title?: string; objective?: string; checks: Check[] } & Record<string, unknown>;

export function plumbingJourney(journey: Journey): { journey: Journey; replaced: number } {
  let replaced = 0;
  const checks = journey.checks.map((check) => ({
    ...check,
    steps: check.steps.flatMap((step): Step[] => {
      const send = step.send_generate as { text?: unknown } | undefined;
      if (!send) return [step];
      replaced += 1;
      return [{ send: String(send.text ?? '') }, { eval: plumbingReplyEval() }];
    }),
  }));
  return {
    replaced,
    journey: {
      ...journey,
      id: `${journey.id}-plumbing`,
      title: `PLUMBING ${journey.title ?? journey.id}`,
      objective: `PLUMBING ONLY, never evidence: every real turn is a posted player line plus a canned /sendas reply, so a no-model lane can run the checks' wiring. ${journey.objective ?? ''}`.trim(),
      expensive: false,
      checks,
    },
  };
}
