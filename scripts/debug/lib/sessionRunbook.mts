import { TIERS, type Card, type CardDoc } from './sessionCharters.mts';
import type { LanePlan } from './sessionLanes.mts';

export const RUNBOOK_HEADER = '<!-- Generated from test/sessions/charters.json and test/sessions/lane-plan.json by `node scripts/debug/so-session.mts runbook --write`. Do not edit by hand. -->';

const S = 'node scripts/debug/so-session.mts';

export interface CardSteps { before?: string[]; beats?: Record<number, { replace?: string[]; after?: string[] }>; after?: string[] }

export const CARD_STEPS: Record<string, CardSteps> = {
  'T0-1': { before: ['$S shot $D entry-points'], beats: { 2: { after: ['$S shot $D after-transition'] } } },
  'T0-2': { before: ['$S shot $D away-recap'], beats: { 2: { replace: ['$S reload-mid-gen $D "We hold the wall. Belle, left side. Dalan, find the ones in the fog."'] } } },
  'T0-3': {
    beats: {
      0: { after: ['$S swipe-new $D'] },
      1: { after: ['$S regen $D'] },
      2: { after: ['$S delete $D last'] },
      3: { after: ['$S regen $D', '$S regen $D'] },
    },
  },
  'T1-2': { beats: { 1: { after: ['$S swipe-new $D'] } } },
  'T2-6': {
    beats: {
      0: { replace: ['$S turn $D "We take Wendhope as the Red Hands." --chat <chat A id from session.json>'] },
      1: { replace: ['$S turn $D "Not that job. Let\'s see who\'s in the tavern." --chat <chat B id from session.json>'] },
    },
  },
  'T3-6': { beats: { 0: { after: ['$S shot $D narrow-drawer-hud'] }, 2: { after: ['$S shot $D narrow-studio'] } } },
  'T4-1': {
    beats: {
      0: { after: ['$S swipe-new $D'] },
      1: { after: ['$S edit $D <the memorable line\'s message id> "I keep my own counsel."'] },
      2: { after: ['$S delete $D last'] },
      3: { after: ['$S swipe-new $D', '$S swipe-new $D'] },
    },
  },
  'T4-2': {
    beats: {
      0: { replace: ['$S switch-chat-mid-gen $D "We take Wendhope as the Loose Ends." --to <the Eshalanore chat id from session.json>'] },
      2: { replace: ['$S reload-mid-gen $D "We reach the walls. Hello the gate!"'] },
    },
    after: ['$S switch-chat-mid-gen $D "We ride on." --to <the Eshalanore chat id>', '$S reload-mid-gen $D "We knock again."'],
  },
  'T5-1': { beats: { 2: { after: ['$S adopt $D'] } } },
};

export const START_FLAGS: Record<string, string> = { 'T0-2': ' --age 24', 'T2-4': ' --age 24', 'T5-1': ' --arm agent' };

const UI_LINE = /^\((no chat line|read first|type|your own lines)/i;
const EDIT_LINE = /^\(edit to:\)\s*/i;
const CHAT_PREFIX = /^\((chat [AB])\)\s*/i;
const quote = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function cardCommands(card: Card, lane: number | null, seq = 1): string[] {
  const dir = `test/sessions/${card.tier}/${card.id}-${seq}`;
  const fill = (line: string) => line.replace(/\$S/g, S).replace(/\$D/g, dir);
  const steps = CARD_STEPS[card.id] ?? {};
  const out: string[] = [];
  if (card.waits) out.push(`# WAITS: ${card.waits}`, '# start it only with --force-waiting once that exists');
  out.push(`${S} start ${card.id}${lane ? ` --lane ${lane}` : ''}${START_FLAGS[card.id] ?? ''}${card.waits ? ' --force-waiting' : ''}`);
  if (card.story.kind === 'wizard' && card.setup.chat !== 'continue') out.push(`# wizard: drive it in the lane browser (so-ui.mts new-story-wizard / wizard-run / wizard-apply), premise ${card.story.premiseId ?? '(none)'}`);
  out.push(...(steps.before ?? []).map(fill));
  card.drive.forEach((beat, at) => {
    out.push(`# beat ${at + 1}: ${beat.title}${beat.aim.length ? ` -> ${beat.aim.join(' | ')}` : ''}`);
    const override = steps.beats?.[at];
    if (override?.replace) out.push(...override.replace.map(fill));
    else for (const line of beat.lines) {
      if (UI_LINE.test(line)) { out.push(`#   UI: ${beat.why ?? line}`); continue; }
      if (EDIT_LINE.test(line)) { out.push(`${S} edit ${dir} <message id> ${quote(line.replace(EDIT_LINE, ''))}`); continue; }
      const chat = CHAT_PREFIX.exec(line);
      out.push(`${S} turn ${dir} ${quote(line.replace(CHAT_PREFIX, ''))}${chat ? ` --chat <${chat[1]} id from session.json>` : ''}`);
    }
    out.push(...(override?.after ?? []).map(fill));
  });
  out.push(...(steps.after ?? []).map(fill));
  for (const gate of new Set(card.rubric.map((row) => row.gate).filter(Boolean))) out.push(`# blind gate ${gate}: tag each paired reply with --arm (card notes); stop rebuilds test/sessions/rating-pack/${gate}/, verdicts stay the user's`);
  if (card.provocations.length) out.push(...card.provocations.map((item) => `# provocation: ${item}`));
  out.push(`# flag at once on any of ${card.mustNotHappen.length} must-not-happen item(s), and when: ${card.flagWhen.join(' / ')}`);
  out.push(`${S} flag ${dir} "<what you saw>"`);
  out.push(`${S} stop ${dir}`);
  out.push(`${S} digest ${dir}`);
  for (const [at, row] of card.rubric.entries()) {
    if (row.media) { out.push(`# rubric ${at} (${row.feature}): unexercised in the no-media variant, so it takes no score and never counts green`); continue; }
    out.push(row.reviewer === 'user'
      ? `${S} score ${dir} ${at} --record "<${row.feature}: what was kept for the user>" --evidence <path:line>`
      : `${S} score ${dir} ${at} <works|annoying|broken|not-noticed> "<${row.feature}: what was seen>" --evidence <path:line|shots/x.png>`);
  }
  return out;
}

export function renderRunbook(doc: CardDoc, plan: LanePlan | null): string {
  const laneOf = new Map((plan?.assignments ?? []).map((row) => [row.card, row]));
  const out = [
    RUNBOOK_HEADER, '',
    '# Plan 14 autonomous runbook',
    '',
    'The exact command sequence per charter for the lead (plan 15 Part B). Claude plays each card on its lane; the main RP model is Artemis on the RunPod pod (profile `Artemis RunPod RP`, `http://127.0.0.1:18080` through the SSH tunnel); every orchestrator role stays on DeepSeek flash. The session dir shown is the first run (`-1`); `start` prints the real one.',
    '',
    '## Before any card',
    '',
    '```bash',
    'curl -s http://127.0.0.1:18080/v1/models',
    `${S} validate`,
    `${S} plan --write`,
    `${S} budget`,
    '```',
    '',
    '- The served bundle must be the dev flavour (`dist/manifest.json` `flavor: "dev"`); staging it is the lead\'s step, not the runbook\'s.',
    '- `start` fails closed (exit 2, `start-failed.json`, no session) on any blocking discrepancy: a card whose pinned story lacks the data it exercises, a lane seeded from another build, a setting the runtime does not read back as the baseline plus the card\'s overrides (`test/sessions/baseline-settings.json`), a failed routing pin (`page-pin.json`), a page problem, a recap that did not fire, a failed run header, or a tail that never acknowledged it is capturing.',
    '- `stop` exports every visited or created chat, asks each tail to drain and waits for it before stopping it, and exits 1 on an invalid session (failed header diff, missing capture, lost drain, missing required artifact, a ComfyUI call). A repo rebuild or merge mid-run is not a failed diff while the served bundle is unchanged (`--served-identity`): it is a warning in `session.json`. An invalid session is re-run, never scored.',
    '- Never touch ComfyUI at 127.0.0.1:8188: every card runs with `--media off` (the default), the recorded no-media variant; image and sprite rubric rows are unexercised, and no card here needs `--allow-comfy`.',
    '- Lanes run in parallel, tier by tier; at most two LLM-heavy lanes at once (llama-server `LLM_PARALLEL`). A lane whose chat a later card continues is leased (`lease.json`): `start` and `adolion-fresh seed` refuse to re-seed it until the continuation ran; `so-session lane archive <n>` keeps it if the lane is needed sooner.',
    '- `turn` sends one real line, waits for every reply of the round (a group send can be several generations) and for the scheduler, and appends the record to `turns.jsonl`. Mutations (`swipe-new`, `regen`, `edit`, `delete`, `switch-chat-mid-gen`, `reload-mid-gen`) record what they did and the rollback the product performed. They close the drawer and any popup first; `swipe-new` clicks only a hit-testable arrow. `swipe-new`, `regen` and `delete last` target the last character reply: a transition note after it is skipped and named in the record (`swipe-new` and `regen` delete it first, since ST swipes and regenerates only the last message). `flag` puts the drawer back the way it found it.',
    '- Beats are signposts: when the story moves elsewhere, play what the story offers and keep the card\'s look-for and must-not-happen in view.',
    '- A score is a claim the user will check: every `score` needs a note and evidence inside the session dir. Rows marked `--record` are recorded for the user\'s review, never scored.',
    '- After each `stop`, `test/sessions/BUDGET.md` is rewritten from every stopped session; add pod hours to its own table by hand.',
    '',
    '## Lane plan',
    '',
    '| Lane | Queue |',
    '|---|---|',
    ...Object.entries(plan?.queues ?? {}).map(([lane, ids]) => `| ${lane} | ${ids.join(' → ')} |`),
    '',
  ];
  for (const tier of TIERS) {
    const cards = doc.cards.filter((card) => card.tier === tier);
    if (!cards.length) continue;
    out.push(`## ${tier}`, '');
    for (const card of cards) {
      const row = laneOf.get(card.id);
      out.push(`### ${card.id} ${card.title} (lane ${row?.lane ?? '?'}${row ? (row.seed ? ', seeds the lane' : ', continues on its lane') : ''})`, '', '```bash', ...cardCommands(card, row?.lane ?? null), '```', '');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
}
