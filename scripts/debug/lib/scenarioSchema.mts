// v2.3 plan 01 §C — the scenario vocabulary, closed.
//
// T1/T2 from the test-credibility audit: `evaluateExpect` reads the keys it knows and ignores the
// rest, and the step dispatcher takes the FIRST non-modifier key. So `{"expect": {"activeCheckpont":
// "cp2"}}` asserted nothing and reported ok, and a step carrying two verbs silently ran one. Both
// failure modes are invisible in a green run, which is the worst kind.
//
// This module is the single list of what the runner honours. A fixture is validated before it runs,
// so a typo is a loud load error rather than a check that quietly never fired.

import { branchSpec, nextReadWindowSpec, rollbackOutcomeSpec } from './identityVerbs.mts';
import { soloSpec } from './soloSandbox.mts';
import { validateRequires } from './scenarioRequires.mts';
import { preconditionProblems } from './stepPrecondition.mts';
import { modelClassProblems } from './modelClass.mts';

export const STEP_MODIFIERS = new Set(['adoptsNewChat', 'log', 'attempts', 'retryBack', 'expectFail', 'precondition', 'keep']);

// send_generate accepts { text, timeoutMs, expectReply } — expectReply makes a silent turn fail.

export const STEP_VERBS = new Set([
  'import_story', 'seed_metadata', 'select_story', 'restart_story', 'studio_save',
  'send', 'send_generate', 'slash', 'extract', 'expand', 'eval',
  'copilot', 'ui', 'stagecraft', 'assets', 'reload',
  'swipe', 'edit', 'delete', 'wait', 'expect', 'expect_ui',
  // v2.3 plan 06: fail a route at the transport, which is how a save that the server refused is
  // produced without a backend fault (killing the model does not fail metadata persistence).
  'block_route', 'unblock_route',
  // v2.4 plan 01 (X4, X10): the real host delete, /cut, event-level generation sequences, another
  // extension's setting (restored in the runner's finally) and the replay-equality recording.
  'host_delete', 'cut', 'emit_generation', 'ext_setting', 'record_state', 'inject_script',
  // v2.4 plan 02 §10 (X11): a branch or checkpoint chat, owned by the run and deleted by its cleanup.
  'branch_create',
  // v2.4 plan 02 follow-ups (E2): a solo chat owned by a group sandbox run, deleted by its cleanup.
  'solo_chat',
]);

export const EXPECT_KEYS = new Set([
  'activeCheckpoint', 'activeCheckpointIn', 'arcs', 'background', 'blackboard', 'blackboardMissing',
  // The audit triple R6's live proof needs: what the model returned, what was refused and why, and
  // what the read actually took.
  'accepted', 'rejected', 'auditRawContains',
  'canon', 'capability', 'convergence', 'copilot', 'epistemic', 'expansion', 'hotSwap', 'latched',
  'ledger', 'memory', 'memoryInjection', 'npcFired', 'pacingPrompt', 'requirementsReady',
  // v2.3 plan 06: the effect ledger's own account of what it changed, and the group state that
  // outlives the chat that wrote it.
  'effectsLedger', 'groupDisabled',
  // v2.3 plan 05: what a request that was actually sent contains, optionally scoped to a member and
  // to a region inside it (`payloadContains`/`payloadAbsent`, see lib/payloadAssert.mts).
  'payloadContains', 'payloadAbsent',
  // v2.4 plan 01: replay equality against a record_state recording, and the over-steer probe.
  'stateEquals', 'overSteer',
  // v2.4 plan 02 §10: the last runRollback outcome, and the window the scheduler reads next.
  'rollbackOutcome', 'nextReadWindow',
  'stagecraft', 'storyId', 'storyIdentity', 'tension',
  // Comparison-suffixed keys the runner reads by bracket access; they are honoured, so they are
  // part of the vocabulary, not typos.
  'auditCount>=', 'reconciliationEvents>=', 'sceneBreaks>=',
]);

export const EXPECT_UI_KEYS = new Set(['selector', 'contains', 'notContains', 'timeoutMs']);

export const WAIT_KEYS = new Set([
  'acceptedDelta', 'arcsSummarized', 'auditCount', 'backfillComplete', 'boundary', 'canonPresent',
  'checkpoint', 'checkpointIn', 'checkpointNot', 'expansionStatus', 'idle', 'memoryEntries',
  'memoryTier', 'progress', 'progressAnchor', 'quietMs', 'reconciliationEvents',
  'reconciliationEvidence', 'schedulerIdle', 'talkDecisions', 'timeoutMs',
]);

export const UI_ACTIONS = new Set([
  'open-drawer', 'drawer-tab', 'open-settings', 'select-profile', 'open-studio', 'close-studio',
  'studio-tab', 'studio-save', 'flag', 'screenshot', 'pipeline', 'assert-player-clean', 'hit-test', 'pointer-click', 'setting-toggle',
  'open-wizard', 'new-story-wizard', 'wizard-run', 'wizard-answer', 'wizard-apply', 'wizard-state',
  'stagecraft', 'curator-accept', 'curator-reject', 'memory-queue', 'branch-continue',
  'next-turn', 'memory-fates', 'jump', 'model-calls', 'gate-replay', 'inline', 'inline-level', 'briefing', 'briefing-dismiss',
  'touch-press',
  'sprite-reference',
  'card-reply-local',
  'sprite-base',
  'sprite-frames',
]);

export const STAGECRAFT_ACTIONS = new Set(['curate', 'accept', 'reject', 'accept-op', 'reject-op', 'apply', 'state']);

export const COPILOT_ACTIONS = new Set(['stage', 'probe', 'suggest', 'advance', 'nudge', 'clear-nudge', 'report', 'environment', 'provision']);

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const shapeProblems = (parse: () => unknown, where: string): string[] => {
  try {
    parse();
    return [];
  } catch (error) {
    return [`${where}: ${error instanceof Error ? error.message : String(error)}`];
  }
};

const near = (name: string, allowed: Set<string>): string => {
  const lower = name.toLowerCase();
  const hit = [...allowed].find((candidate) => candidate.toLowerCase() === lower)
    ?? [...allowed].find((candidate) => candidate.toLowerCase().startsWith(lower.slice(0, 4)) || lower.startsWith(candidate.toLowerCase().slice(0, 4)));
  return hit ? ` (did you mean "${hit}"?)` : '';
};

/** A value a verb will hand to the page as text: it has to be a non-empty string, not an object. */
function textProblems(value: unknown, where: string): string[] {
  if (typeof value === 'string' && value.trim()) return [];
  if (isRecord(value)) return [`${where}: expected a string, got an object ({"text": …} is the object form only where the runner documents it) — the verb hands this straight to the page`];
  return [`${where}: expected a non-empty string, got ${value === undefined ? 'nothing' : typeof value === 'number' ? 'a number' : JSON.stringify(value)}`];
}

function checkObject(value: unknown, allowed: Set<string>, where: string, problems: string[]): void {
  if (!isRecord(value)) {
    problems.push(`${where}: expected an object, got ${Array.isArray(value) ? 'an array' : typeof value}`);
    return;
  }
  const keys = Object.keys(value);
  // An empty assertion object asserts nothing and used to report ok — the purest vacuous pass.
  if (!keys.length) {
    problems.push(`${where}: empty assertion object — it would pass without checking anything`);
    return;
  }
  for (const key of keys) {
    if (!allowed.has(key)) problems.push(`${where}: unknown key "${key}"${near(key, allowed)}`);
  }
}

function checkAction(value: unknown, allowed: Set<string>, where: string, problems: string[]): void {
  // These verbs also accept a bare string shorthand for the action.
  const action = typeof value === 'string' ? value : isRecord(value) ? value.action : undefined;
  if (typeof action !== 'string') {
    problems.push(`${where}: no action named`);
    return;
  }
  if (!allowed.has(action)) problems.push(`${where}: unknown action "${action}"${near(action, allowed)}`);
}

/** Every problem with a step list, named by index and key. Empty means the fixture is runnable. */
// The vocabulary was closed in plan 01 and the JS inside it was not: an `eval` is a string the runner
// hands to `new Function`, so a typo is a SyntaxError in the middle of a long run — after the turns
// that took minutes, with the failure attributed to whatever the step was measuring. The wrapper is
// the runner's own (`return (async () => { … })()`), so top-level `await` is legal here exactly when
// it is legal there. Compiling only: nothing is executed at validation time.
export function evalSyntaxProblems(source: unknown, at: string): string[] {
  if (typeof source !== 'string') return [];
  try {
    new Function(`return (async () => { ${source} })()`);
    return [];
  } catch (error) {
    return [`${at}: the eval does not compile — ${error instanceof Error ? error.message : String(error)}`];
  }
}

export function validateSteps(steps: unknown, where = 'steps'): string[] {
  const problems: string[] = [];
  if (!Array.isArray(steps)) return [`${where}: expected an array of steps`];

  steps.forEach((step, index) => {
    const at = `${where}[${index}]`;
    if (!isRecord(step)) {
      problems.push(`${at}: expected an object`);
      return;
    }
    const verbs = Object.keys(step).filter((name) => !STEP_MODIFIERS.has(name));
    if (!verbs.length) {
      problems.push(`${at}: no verb (only modifiers: ${Object.keys(step).join(', ') || 'none'})`);
      return;
    }
    // "First key wins" silently ran one verb and dropped the rest.
    if (verbs.length > 1) {
      problems.push(`${at}: ${verbs.length} verbs in one step (${verbs.join(', ')}) — only the first would run; split them`);
      return;
    }
    if ('precondition' in step) problems.push(...preconditionProblems(step.precondition, index, at));
    if ('keep' in step && step.keep !== true) problems.push(`${at}.keep: expected true (the step's output is kept in the run record for a scorer), got ${JSON.stringify(step.keep)}`);
    const [verb] = verbs;
    if (!STEP_VERBS.has(verb)) {
      problems.push(`${at}: unknown step verb "${verb}"${near(verb, STEP_VERBS)}`);
      return;
    }
    const value = step[verb];
    // The SHAPE of a verb's value, not just its name. `{"send": {"text": …}}` passed this validator
    // and died at step 4 of the run ("sendCompactMessage requires a non-empty text string"), because
    // the verb takes a bare string — the same "validated is not runnable" shape as a selector that
    // pins a string instead of a DOM (2026-09-22). 17 corpus sends use the string form; the two that
    // did not were written the same day and had never been executed.
    if (verb === 'send') problems.push(...textProblems(value, `${at}.send`));
    if (verb === 'send_generate') problems.push(...textProblems(typeof value === 'string' ? value : isRecord(value) ? value.text : undefined, `${at}.send_generate`));
    // `import_story` takes a path string, a `{file}` reference, or an INLINE story object — only the
    // first two name a file to check, and the inline form is most of the corpus.
    if (verb === 'import_story' && (typeof value === 'string' || (isRecord(value) && 'file' in value))) {
      problems.push(...textProblems(typeof value === 'string' ? value : isRecord(value) ? value.file : undefined, `${at}.import_story.file`));
    }
    if (verb === 'edit') problems.push(...textProblems(isRecord(value) ? value.text : undefined, `${at}.edit.text`));
    if (verb === 'eval') problems.push(...evalSyntaxProblems(value, `${at}.eval`));
    if (verb === 'branch_create') problems.push(...shapeProblems(() => branchSpec(value), `${at}.branch_create`));
    if (verb === 'solo_chat') problems.push(...shapeProblems(() => soloSpec(value), `${at}.solo_chat`));
    if (verb === 'ext_setting' && isRecord(value) && value.extension === 'story-orchestrator' && [value.key].flat().join('.') === 'settings') {
      problems.push(`${at}.ext_setting: replaces every install setting for the run (it wiped a lane's memory profile); write each leaf with a key path, e.g. ["settings", "image", "enabled"]`);
    }
    if (verb === 'expect' && isRecord(value) && 'rollbackOutcome' in value) problems.push(...shapeProblems(() => rollbackOutcomeSpec(value.rollbackOutcome), `${at}.expect.rollbackOutcome`));
    if (verb === 'expect' && isRecord(value) && 'nextReadWindow' in value) problems.push(...shapeProblems(() => nextReadWindowSpec(value.nextReadWindow), `${at}.expect.nextReadWindow`));
    if (verb === 'expect') checkObject(value, EXPECT_KEYS, `${at}.expect`, problems);
    if (verb === 'expect_ui') checkObject(value, EXPECT_UI_KEYS, `${at}.expect_ui`, problems);
    if (verb === 'wait') checkObject(value, WAIT_KEYS, `${at}.wait`, problems);
    if (verb === 'ui') checkAction(value, UI_ACTIONS, `${at}.ui`, problems);
    if (verb === 'stagecraft') checkAction(value, STAGECRAFT_ACTIONS, `${at}.stagecraft`, problems);
    if (verb === 'copilot') checkAction(value, COPILOT_ACTIONS, `${at}.copilot`, problems);
  });

  return problems;
}

/** Validate a loaded scenario or journey file. Journeys carry their steps inside `checks[]`. */
/**
 * Fixtures that READ a page global they never SET. A lookup on an unset global returns undefined, so
 * the run reports whatever the missing value implies — `plan05-pin-quarantine` read
 * `globalThis.__p05Fact` in three steps without ever assigning it, and the failure read "the pinned
 * fact was deleted by the rollback instead of being quarantined": a product defect that did not exist,
 * in the sentence a reader would have believed (2026-09-22). Exported so the rule is unit-testable on
 * synthetic text rather than only observably green over a corpus that happens to be clean.
 */
/** Set by the runner, never by a fixture: so-journey's judge mode (`markJudgeMode`, v2.4 plan 07) names the arm a check runs in. */
export const RUNNER_SET_GLOBALS = new Set(['__soJudgeMode']);

export function globalsReadButNeverWritten(files: Array<{ name: string; text: string }>): string[] {
  const broken: string[] = [];
  for (const file of files) {
    const reads = [...file.text.matchAll(/globalThis\.(__[A-Za-z0-9_]+)/g)].map((match) => match[1]);
    const writes = new Set([...file.text.matchAll(/globalThis\.(__[A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]));
    for (const name of new Set(reads)) if (!writes.has(name) && !RUNNER_SET_GLOBALS.has(name)) broken.push(`${file.name}: reads ${name} and never sets it`);
  }
  return broken;
}

const SCRIPTED_PASS = /globalThis\.storyOrchestratorDebug(Epistemic|Ledger)Response\s*=/;
const READ_PIN = /globalThis\.storyOrchestratorDebugExtractionResponse\s*=\s*['"`]SCENE_NONE['"`]/;

export function scriptedPassesUnpinned(doc: unknown, where = 'fixture'): string[] {
  if (!isRecord(doc)) return [];
  const lane = isRecord(doc.requires) ? doc.requires.lane : undefined;
  const units = Array.isArray(doc.checks)
    ? doc.checks.filter(isRecord).map((check) => ({ id: `${where}:${String(check.id)}`, model: check.model, steps: check.steps }))
    : [{ id: where, model: doc.model, steps: doc.steps }];
  const broken: string[] = [];
  units.forEach((unit, at) => {
    if (unit.model === 'none' || lane === 'no-model' || !Array.isArray(unit.steps)) return;
    let pinned = false;
    let scripts = false;
    unit.steps.forEach((step, index) => {
      if (!isRecord(step)) return;
      if ('reload' in step) pinned = false;
      if (typeof step.eval !== 'string') return;
      if (READ_PIN.test(step.eval)) pinned = true;
      if (!SCRIPTED_PASS.test(step.eval)) return;
      scripts = true;
      if (!pinned) broken.push(`${unit.id} step ${index}: scripts an epistemic/ledger response with background reads unpinned`);
    });
    const before = at > 0 ? units[at - 1] : null;
    if (scripts && before && before.model !== 'none' && Array.isArray(before.steps)) broken.push(...carriedReads(before.id, before.steps, unit.id));
  });
  return broken;
}

const CHAT_MOVES = ['send', 'send_generate', 'edit', 'delete', 'swipe', 'host_delete', 'cut', 'reload'];
const waitsSchedulerIdle = (step: unknown) => isRecord(step) && isRecord(step.wait) && step.wait.schedulerIdle === true;

function carriedReads(id: string, steps: unknown[], after: string): string[] {
  const broken: string[] = [];
  let pinned = false;
  let lastMove = -1;
  steps.forEach((step, index) => {
    if (!isRecord(step)) return;
    if (typeof step.eval === 'string' && READ_PIN.test(step.eval)) pinned = true;
    if (!CHAT_MOVES.some((verb) => verb in step)) return;
    lastMove = index;
    if (!pinned) broken.push(`${after} follows ${id}, whose step ${index} moves the chat with background reads unpinned`);
    if ('reload' in step) pinned = false;
  });
  if (lastMove >= 0 && !steps.slice(lastMove + 1).some(waitsSchedulerIdle)) broken.push(`${after} follows ${id}, which ends without a schedulerIdle wait after its last chat move (step ${lastMove})`);
  return broken;
}

export function validateFixture(doc: unknown, where = 'fixture'): string[] {
  if (!isRecord(doc)) return [`${where}: expected an object`];
  const problems: string[] = [...validateRequires(doc.requires, `${where}.requires`)];
  problems.push(...modelClassProblems(doc.model, where));
  if (Array.isArray(doc.steps)) problems.push(...validateSteps(doc.steps, `${where}.steps`));
  if (Array.isArray(doc.setup)) problems.push(...validateSteps(doc.setup, `${where}.setup`));
  if (isRecord(doc.setup) && Array.isArray((doc.setup as Record<string, unknown>).steps)) {
    problems.push(...validateSteps((doc.setup as Record<string, unknown>).steps, `${where}.setup.steps`));
  }
  if (isRecord(doc.cleanup) && Array.isArray((doc.cleanup as Record<string, unknown>).steps)) {
    problems.push(...validateSteps((doc.cleanup as Record<string, unknown>).steps, `${where}.cleanup.steps`));
  }
  if (Array.isArray(doc.checks)) {
    doc.checks.forEach((check: unknown, index: number) => {
      if (!isRecord(check)) return;
      const id = typeof check.id === 'string' ? check.id : `#${index}`;
      problems.push(...modelClassProblems(check.model, `${where}.${id}`));
      if (Array.isArray(check.steps)) problems.push(...validateSteps(check.steps, `${where}.${id}.steps`));
    });
  }
  return problems;
}
