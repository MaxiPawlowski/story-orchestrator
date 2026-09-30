// v2.6 plan 13 R1: how each test asset is classified. Pure, so the rules are tested rather than trusted.
// Every column is a heuristic over the asset's own text, named as such in the generated table.

export const PURE_DIRS = ['engine', 'memory', 'extraction', 'judge', 'talk', 'pacing', 'generation', 'stagecraft', 'wizard', 'utils', 'constants', 'copilot', 'image', 'sprites'];

const HOST_IMPORT = /from\s+["']@services\/|from\s+["'][./]*services\/STAPI|stHost\//;

/** jest file tier: pure when it lives in a pure dir and neither it nor its path reaches the host seam. */
export function jestTier(path, text) {
  const dir = path.split('/')[1];
  if (PURE_DIRS.includes(dir) && !HOST_IMPORT.test(text)) return 'pure unit';
  return 'unit (host faked)';
}

const INVARIANT_FILE = /(guard|architecture|census|Census|ownership\.guard|faultMatrix|legacyFree|findingsLedger|typedResults)\.[a-z.]*test\.ts$/;
const DEFECT_TEXT = /\b(V\d{1,2}[a-z]?|T\d{1,2}|M\d{1,2}|L\d{1,2}|X\d{1,2}|S\d{1,2}|F\d{1,2}|C\d)\b[:)]|found live|regression|\bused to\b|was a bug|gotcha|mutant|negative control/i;
const CONTRACT_TEXT = /\bplan \d+|\bspec\b|contract|§|\bR\d+\b|\binvariant\b/i;

/** What an asset names as its reason to exist: invariant > defect > contract > nothing named. */
export function guardOf(path, text) {
  if (INVARIANT_FILE.test(path) || /architecture\.md/.test(text)) return 'invariant';
  if (/\.review\.test\.ts$/.test(path) || DEFECT_TEXT.test(text)) return 'defect';
  if (CONTRACT_TEXT.test(text)) return 'contract';
  return 'nothing named';
}

const TEST_CALL = /(?:^|[^\w.])(?:it|test)(?:\.each\([^)]*\))?(?:\.only|\.skip)?\s*\(/gm;
const ASSERTION = /\bexpect\s*\(|\bassert[.(]|\.rejects\b|\.toThrow/;

export function jestShape(text) {
  const tests = (text.match(TEST_CALL) ?? []).length;
  const assertions = (text.match(/\bexpect\s*\(|\bassert[.(]/g) ?? []).length;
  const skipped = (text.match(/\b(?:it|test|describe)\.skip\s*\(/g) ?? []).length;
  return { tests, assertions, skipped, vacuous: tests > 0 && !ASSERTION.test(text) };
}

export function testTitles(text) {
  return [...text.matchAll(/(?:^|[^\w.])(?:it|test)\s*\(\s*(["'`])((?:(?!\1).)+)\1/gm)].map((match) => match[2]);
}

const LLM_VERBS = new Set(['send_generate']);
const MODEL_VERBS = new Set(['extract', 'expand', 'copilot', 'stagecraft']);
const MOCKED = /debugResponse|storyOrchestratorDebug\w*Response|"response"\s*:/;
const ASSERTING = new Set(['expect', 'expect_ui', 'wait']);

/** Steps of a scenario or journey check: does it need a real model, and does anything in it assert? */
export function stepsShape(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const verbs = list.flatMap((step) => Object.keys(step ?? {}));
  const text = JSON.stringify(list);
  const generates = verbs.filter((verb) => LLM_VERBS.has(verb)).length;
  const modelCalls = verbs.filter((verb) => MODEL_VERBS.has(verb)).length;
  const needsLlm = generates > 0 || (modelCalls > 0 && !MOCKED.test(text));
  const evalAsserts = list.some((step) => typeof step?.eval === 'string' && /throw\b|ok\s*:\s*false|expectFail/.test(step.eval));
  const uiAsserts = list.filter((step) => step?.ui && (/^(assert|hit-test)/.test(String(step.ui.action ?? '')) || Object.keys(step.ui).some((key) => key.startsWith('expect')))).length;
  const asserts = verbs.filter((verb) => ASSERTING.has(verb)).length + (evalAsserts ? 1 : 0) + uiAsserts;
  return { steps: list.length, generates, modelCalls, needsLlm, asserts, vacuous: list.length > 0 && asserts === 0 };
}

/** A rough lane-time estimate in seconds: a real generation ~45 s (RTX PRO 4500 pod, 2026-09-20), an unmocked model pass ~20 s, a step ~2 s. */
export function estimateSeconds(shape) {
  return Math.round(5 + shape.steps * 2 + shape.generates * 45 + (shape.needsLlm ? shape.modelCalls * 20 : 0));
}

export function isVacuousNeedleSpec(spec) {
  if (!spec || typeof spec !== 'object' || typeof spec.none === 'string') return [];
  const found = [];
  for (const key of ['mustContain', 'mustNotContain']) for (const needle of spec[key] ?? []) if (typeof needle === 'string' && !needle.trim()) found.push(`${key}: ""`);
  const claims = (spec.minCount ?? 0) > 0 || ['mustContain', 'mustNotContain'].some((key) => (spec[key] ?? []).some((needle) => typeof needle === 'string' && needle.trim()));
  if (!claims) found.push('no assertion');
  return found;
}

/** Commits whose subject reads as a fix, per path, from `git log --name-only --format=@@%h%x09%s`. */
export function fixCommitsByPath(log) {
  const counts = new Map();
  let isFix = false;
  for (const line of log.split(/\r?\n/)) {
    if (line.startsWith('@@')) {
      const subject = line.split('\t').slice(1).join('\t');
      isFix = /^fix\b|^fix\(|\bfix(es|ed)?\b|\bdefect\b|\bregression\b/i.test(subject);
      continue;
    }
    if (!line.trim() || !isFix) continue;
    counts.set(line.trim(), (counts.get(line.trim()) ?? 0) + 1);
  }
  return counts;
}

const RECORDS_ROOT = 'test/journeys/records/';

/** A citation of a whole gate directory (`records/v2.4-plan01/`) names where a gate's runs live, not each run. */
export const isGenericCitation = (cited) => cited.replace(/\/+$/, '').slice(RECORDS_ROOT.length).split('/').filter(Boolean).length <= 1;

/**
 * Whether a record file is cited. A file, a stem cited without its extension, or a specific run directory
 * (`records/v2.4-plan07/part1-live-…/`) keeps everything it names. A generic gate-directory citation keeps
 * only the directory's markdown summaries; its run files move out with a pointer left behind.
 */
export function isCitedRecord(path, citations) {
  for (const cited of citations) {
    if (path === cited) return true;
    const base = cited.replace(/\/+$/, '');
    if (path.startsWith(`${base}.`) && !path.slice(base.length + 1).includes('/')) return true;
    if (!path.startsWith(`${base}/`)) continue;
    if (!isGenericCitation(cited) || path.endsWith('.md')) return true;
  }
  return false;
}

export const mdCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
