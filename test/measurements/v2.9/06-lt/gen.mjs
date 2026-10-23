// Writes one so-scenario fixture per situation per arm from situations.json, then validates each with the repo's
// validateFixture + globalsReadButNeverWritten. Run from anywhere: node gen.mjs
// Arms: "current" sets globalThis.storyOrchestratorDebugSuggestionAnchors = "off" (seam to be added in the product);
//       "anchored" leaves it unset. Each run stores one record in localStorage under so-v29-06lt-<arm>-<id>.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const here = new URL("./", import.meta.url);
const raw = readFileSync(new URL("situations.json", here), "utf8");
const doc = JSON.parse(raw);
const CORPUS_SHA = createHash("sha256").update(raw).digest("hex");
const ARMS = { current: "off", anchored: null };
const SEAM = "storyOrchestratorDebugSuggestionAnchors";
const CONDITIONAL = /\b(?:if|unless|provided|as long as|only when|once you|so long as)\b/i;
const MATCHER = /\b(?:promise|promised|swear|vow|you have my word|i give you my word|on my word|i will|i'll|i shall)\b/i;
const J = (value) => JSON.stringify(value);

const HELPERS = "const pause = (ms) => new Promise((r) => setTimeout(r, ms)); "
  + "const until = async (test, ms, what) => { const end = Date.now() + ms; for (;;) { const v = await test(); if (v) return v; if (Date.now() > end) throw new Error('timed out after ' + ms + ' ms: ' + what); await pause(200); } }; "
  + "const audit = (id, from, to) => ({ id, createdAt: new Date().toISOString(), priority: 0, reason: 'manual', contractHash: 'h', scope: [], window: { from, to }, prompt: 'p', rawResponse: 'r', acceptedDeltas: [], rejected: [] }); "
  + "const open = async () => { if (!document.querySelector('#so-workspace-modal[open]')) document.querySelector('#so-open-workspace').click(); const modal = await until(() => document.querySelector('#so-workspace-modal[open]'), 10000, 'the workspace'); if (modal.dataset.context !== 'story') { const tab = [...modal.querySelectorAll('button')].find((b) => b.textContent.trim() === 'This story'); if (!tab) throw new Error('no Story context button'); tab.click(); await until(() => modal.dataset.context === 'story', 5000, 'the Story context'); } (await until(() => modal.querySelector('#so-workspace-page-play'), 5000, 'the Play page')).click(); (await until(() => document.querySelector('#so-open-suggestions'), 10000, 'the suggestions button')).click(); await until(() => !document.querySelector('#so-workspace-modal[open]'), 5000, 'the workspace to close'); return until(() => document.querySelector('#so-panel-suggestions'), 5000, 'the suggestions panel'); }; ";

const setupEval = (sit, arm) => "for (const key of Object.keys(globalThis).filter((k) => k.startsWith('storyOrchestratorDebug'))) delete globalThis[key]; "
  + "const s = globalThis.storyOrchestratorRuntime.getGlobalSettings(); if (s.image.enabled || s.sprites.enabled) throw new Error('media must be off'); "
  + "if (s.memory?.promises === false) throw new Error('memory.promises is off on this install'); "
  + "globalThis.storyOrchestratorDebugExtractionResponse = 'SCENE_NONE'; "
  + (ARMS[arm] ? `globalThis.${SEAM} = ${J(ARMS[arm])}; ` : `delete globalThis.${SEAM}; `)
  + "const ctx = SillyTavern.getContext(); for (let id = ctx.chat.length - 1; id >= 0; id -= 1) await ctx.deleteMessage(id, undefined, false); "
  + "const rt = globalThis.storyOrchestratorRuntime; rt.setUiSettings({ authorView: false }); rt.setExtractionSettings({ cadence: 0, stabilityLag: 0 }); "
  + HELPERS
  + `globalThis.__lt = { pause, until, audit, open, id: ${J(sit.id)}, arm: ${J(arm)}, corpus: ${J(CORPUS_SHA)} }; return { arm: ${J(arm)}, seam: globalThis.${SEAM} ?? null };`;

const afterImportEval = (sit) => {
  const needsLedger = sit.seed.some((op) => op.hiding);
  return "const rt = globalThis.storyOrchestratorRuntime; "
    + `await globalThis.__lt.until(() => rt.getSnapshot().storyId === ${J(sit.story.id)}, 10000, 'the story to load'); `
    + (needsLedger ? "rt.setEpistemicLedgerCapable(true); if (!rt.getSnapshot().memory.settings.epistemicLedgerCapable) throw new Error('the epistemic capability did not stick'); " : "")
    + `return { storyId: rt.getSnapshot().storyId, ledger: ${needsLedger} };`;
};

const promiseEval = (op, playerLine) => {
  const at = playerLine.indexOf(op.promise.quote);
  const conditional = CONDITIONAL.test(playerLine.slice(0, at + op.promise.quote.search(MATCHER)));
  const line = `[promised] ${op.promise.to} | m=`;
  return "const g = globalThis.__lt; const rt = globalThis.storyOrchestratorRuntime; const ctx = SillyTavern.getContext(); const m = ctx.chat.length - 1; "
    + "if (!ctx.chat[m]?.is_user) throw new Error('the promise line is not the last player message'); "
    + `const quote = ${J(op.promise.quote)}; await rt.runExtractionNow(${J(line)} + m + ' | \"' + quote + '\"' + String.fromCharCode(10) + 'NO_DELTA', 'manual', { from: 0, to: m }); `
    + (conditional
      ? "await g.pause(1500); if ((rt.getSnapshot().promises ?? []).some((row) => row.quote === quote)) throw new Error('a conditional promise reached the player projection'); return { conditional: true };"
      : "const rows = await g.until(() => { const r = (rt.getSnapshot().promises ?? []).filter((row) => row.quote === quote); return r.length ? r : null; }, 10000, 'the promise to be stored'); return { promise: rows[0].id, promisee: rows[0].promisee };");
};

const arcEval = (kind, text, n) => "const g = globalThis.__lt; const rt = globalThis.storyOrchestratorRuntime; const last = Math.max(0, SillyTavern.getContext().chat.length - 1); "
  + (kind === "open"
    ? `await rt.applyExtractionAudit(g.audit('lt-arc-${n}', 0, last), [], [], [{ kind: 'open', text: ${J(text)} }]); if (!rt.getArcs().some((a) => a.status === 'open' && a.text === ${J(text)})) throw new Error('the arc did not open: ' + ${J(text)}); return { open: rt.getArcs().filter((a) => a.status === 'open').length };`
    : `const before = rt.getArcs().filter((a) => a.status === 'resolved').length; await rt.applyExtractionAudit(g.audit('lt-arc-${n}', 0, last), [], [], [{ kind: 'resolved', text: ${J(text)} }]); if (rt.getArcs().filter((a) => a.status === 'resolved').length !== before + 1) throw new Error('the arc did not resolve: ' + ${J(text)}); return { resolved: before + 1 };`);

const hidingEval = (op) => "const rt = globalThis.storyOrchestratorRuntime; "
  + `const content = ${J(op.hiding.content)}; await rt.runExtractionNow(${J(`[hiding] ${op.hiding.subject} from ${op.hiding.from} | `)} + content, 'manual'); `
  + "const rows = rt.getEpistemic().filter((e) => e.tag === 'hiding' && !e.supersededBy && e.content === content); if (rows.length !== 1) throw new Error('the [hiding] row did not land exactly once: ' + JSON.stringify(rt.getEpistemic().map((e) => [e.tag, e.content]))); return { hiding: rows[0].id };";

const seedSteps = (sit) => {
  const steps = [];
  let lastPlayer = "";
  sit.seed.forEach((op, n) => {
    if (op.say) steps.push({ slash: `/sendas name="${op.say}" raw=false ${op.text}` });
    else if (op.set) steps.push({ slash: `/cp set ${op.set[0]} ${op.set[1]}` });
    else if (op.player) { lastPlayer = op.player; steps.push({ send: op.player }); }
    else if (op.stuck) { lastPlayer = op.stuck; steps.push({ send: op.stuck }); }
    else if (op.promise) steps.push({ eval: promiseEval(op, lastPlayer) });
    else if (op.arcOpen) steps.push({ eval: arcEval("open", op.arcOpen, n) });
    else if (op.arcResolve) steps.push({ eval: arcEval("resolved", op.arcResolve, n) });
    else if (op.hiding) steps.push({ eval: hidingEval(op) });
    else throw new Error(`${sit.id}: unknown seed op ${J(op)}`);
  });
  return steps;
};

const guardEval = (sit) => {
  const c = sit.expect.computed;
  const promises = c.candidates.filter((a) => a.kind === "promise").length;
  return "const rt = globalThis.storyOrchestratorRuntime; const st = rt.getEngineState(); "
    + `if (st.activeCheckpointId !== ${J(c.finalCheckpoint)}) throw new Error('seed did not land on ${c.finalCheckpoint}: ' + st.activeCheckpointId); `
    + `const promises = (rt.getSnapshot().promises ?? []).length; if (promises !== ${promises}) throw new Error('open player promises ' + promises + ', expected ${promises}'); `
    + "return { checkpoint: st.activeCheckpointId, boundary: st.boundary, checkpointStartedBoundary: st.checkpointStartedBoundary, arcs: rt.getArcs().map((a) => [a.status, a.openedAt, a.text]) };";
};

const recordEval = (sit, arm) => "const g = globalThis.__lt; const rt = globalThis.storyOrchestratorRuntime; rt.setUiSettings({ authorView: true }); await g.pause(800); "
  + "const t0 = Date.now(); await g.open(); const box = () => document.querySelector('#so-suggestions'); const end = Date.now() + 240000; let timedOut = false; "
  + "for (;;) { const b = box(); const n = b ? b.querySelectorAll('[data-so=suggestion]').length : 0; if (n >= 3 || (b && b.querySelector('[data-so=suggestions-failed]'))) break; if (Date.now() > end) { timedOut = true; break; } await g.pause(250); } "
  + "await g.pause(1500); const b = box(); const text = (n) => n?.textContent?.trim() ?? null; "
  + "const lines = b ? [...b.querySelectorAll('[data-so=suggestion]')].map((btn) => ({ text: text(btn), anchor: text(btn.closest('li')?.querySelector('[data-so=suggestion-anchor]'))?.replace(/^for: /, '') ?? null })) : []; "
  + "const help = b ? [...b.querySelectorAll('[data-so=suggestions-help]')].map(text) : []; "
  + "const greyed = b ? [...b.querySelectorAll('[data-so=suggestion-unavailable]')].map((btn) => ({ text: text(btn), disabled: btn.disabled })) : []; "
  + "const calls = (rt.getSnapshot().modelCalls ?? []).filter((row) => row.role === 'read:suggestions' && Date.parse(row.at) >= t0 - 1000); "
  + "const ctx = SillyTavern.getContext(); const st = rt.getEngineState(); "
  + "const record = { corpus: g.corpus, id: g.id, arm: g.arm, seam: globalThis.storyOrchestratorDebugSuggestionAnchors ?? null, at: new Date().toISOString(), chatId: ctx.chatId, storyId: rt.getSnapshot().storyId, "
  + "checkpoint: st.activeCheckpointId, boundary: st.boundary, lines, usable: lines.length, help, greyed, authorRow: text(b?.querySelector('[data-so=suggestions-author]')), "
  + "failed: text(b?.querySelector('[data-so=suggestions-failed]')), timedOut, asks: calls.length, calls: calls.map((row) => ({ at: row.at, route: row.route, result: row.result, ms: row.ms })), "
  + "playerView: { sections: (rt.getSnapshot().narrative?.sections ?? []).map((s) => ({ label: s.label, lines: s.lines })), transcript: ctx.chat.filter((m) => !m.is_system).slice(-12).map((m) => ({ name: m.name, mes: m.mes })) } }; "
  + "localStorage.setItem('so-v29-06lt-' + g.arm + '-' + g.id, JSON.stringify(record)); if (g.arm === 'current' && lines.some((line) => line.anchor)) throw new Error('current arm: a line carries an anchor tag, so the anchors-off seam did not apply'); return record;";

const cleanupEval = "const rt = globalThis.storyOrchestratorRuntime; rt.setUiSettings({ authorView: false }); document.querySelector('#so-panel-suggestions [data-so=\"panel-close\"]')?.click(); "
  + `delete globalThis.${SEAM}; delete globalThis.storyOrchestratorDebugExtractionResponse; delete globalThis.__lt; return true;`;

const scenario = (sit, arm) => ({
  _note: `v2.9 06 LT corpus ${sit.id} (${sit.mix}), arm ${arm}${ARMS[arm] ? ` (${SEAM}='${ARMS[arm]}')` : " (anchors on)"}. Real read-role model for the one suggestions ask; seeded state only (reads are seeded text, scheduled reads pinned to SCENE_NONE so both arms see the same state). Records one row in localStorage so-v29-06lt-${arm}-${sit.id}. Corpus situations.json sha256 ${CORPUS_SHA}. Premise: ${sit.premise}`,
  requires: { lane: "model", group: doc.group, members: ["Arin", "DM Narrator"], judge: "off" },
  steps: [
    { ext_setting: { extension: "story-orchestrator", key: ["settings", "image", "enabled"], value: false } },
    { ext_setting: { extension: "story-orchestrator", key: ["settings", "sprites", "enabled"], value: false } },
    { eval: setupEval(sit, arm) },
    { import_story: sit.story },
    { eval: afterImportEval(sit) },
    ...seedSteps(sit),
    { wait: { schedulerIdle: true, quietMs: 1500, timeoutMs: 60000 } },
    { log: true, eval: guardEval(sit) },
    { log: true, eval: recordEval(sit, arm) },
    { eval: cleanupEval },
  ],
});

const outRoot = new URL("scenarios/", here);
const written = [];
for (const arm of Object.keys(ARMS)) {
  mkdirSync(new URL(`${arm}/`, outRoot), { recursive: true });
  for (const sit of doc.situations) {
    const name = `v29-06-lt-${arm}-${sit.id}.json`;
    const url = new URL(`${arm}/${name}`, outRoot);
    const text = `${JSON.stringify(scenario(sit, arm), null, 2)}\n`;
    writeFileSync(url, text);
    written.push({ name, url, text });
  }
}

const schema = await import(pathToFileURL(new URL("../../../../scripts/debug/lib/scenarioSchema.mts", import.meta.url).pathname.replace(/^/([A-Za-z]:)/, "$1")).href);
let bad = 0;
for (const file of written) {
  const problems = schema.validateFixture(JSON.parse(file.text), file.name);
  const globals = schema.globalsReadButNeverWritten([{ name: file.name, text: file.text }]);
  if (problems.length || globals.length) { bad += 1; console.log(`${file.name}:\n  - ${[...problems, ...globals].join("\n  - ")}`); }
}
console.log(`corpus sha256 ${CORPUS_SHA}`);
console.log(`wrote ${written.length} scenarios (${Object.keys(ARMS).length} arms x ${doc.situations.length}); validateFixture + globalsReadButNeverWritten: ${bad ? `${bad} with problems` : "0 problems"}`);
process.exitCode = bad ? 1 : 0;
