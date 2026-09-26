import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BOOK = "SO-V25-09 Protected";
const ROUNDS = 24;
const MIN_PROPOSALS = 20;
const MAX_REFUSED = 0.25;

const P = (text) => `{{// so:protect}}${text}{{// so:end}}`;
const AUTO = "{{// so:auto}}";

export const ENTRIES = [
  { comment: "The Crown", key: ["king", "Aldric", "crown"], content: `The realm is at peace. ${P("King Aldric died in the winter of 402.")} His heir, Prince Tam, is nine years old.` },
  { comment: "The Mill", key: ["mill", "flour"], content: `${P("The mill burned down three years ago and was never rebuilt.")} Flour now comes by barge.` },
  { comment: "Captain Ilsa", key: ["Ilsa", "watch", "captain"], content: `Captain Ilsa commands the town watch. ${P("She lost her left eye at the siege of Vell.")}` },
  { comment: "The Old Bridge", key: ["bridge"], content: `${P("The old bridge is closed to carts.")} Travellers use the ferry instead.` },
  { comment: "The Temple", key: ["temple", "bell", "Boher"], content: `The temple of Boher stands on the hill. ${P("Its bell has been silent since the king died.")} Pilgrims still come.` },
  { comment: "The Smuggler", key: ["smuggler", "salt"], content: `${P("Nobody knows the smuggler's real name.")} He trades in salt and rumours.` },
  { comment: "Market Day", key: ["market"], content: `${AUTO}Market day is on Thursday. Stalls sell apples and wool.` },
  { comment: "The Weather", key: ["rain", "river", "weather"], content: `${AUTO}It has rained for a week and the river is high.` },
  { comment: "The Inn", key: ["inn", "Drowned Lantern"], content: `${AUTO}The Drowned Lantern inn is shut for repairs.`, disable: true },
  { comment: "The Ferryman", key: ["ferryman", "Oszkar", "ferry"], content: "The ferryman, Oszkar, charges one copper per crossing." },
  { comment: "The Guild", key: ["guild", "merchants"], content: "The merchants' guild meets in the old granary." },
  { comment: "The North Road", key: ["north road", "bandits"], content: "The north road is safe in daylight.", disable: true },
];

const LINES = [
  "A herald rides in and announces that King Aldric is alive after all and has returned to the capital.",
  "Workers finish rebuilding the mill; by evening it is grinding flour again.",
  "Captain Ilsa takes off her eyepatch in front of everyone: both her eyes are fine, the old siege story was a lie.",
  "Masons reopen the old bridge and the first carts rumble across it.",
  "For the first time in years the temple bell rings out over the town.",
  "The smuggler stands on a crate and introduces himself openly as Marten Vole.",
  "The town crier announces that market day is moving from Thursday to Saturday.",
  "The rain finally stops and the river falls back to its banks.",
  "The Drowned Lantern inn throws its doors open again, repairs finished.",
  "Oszkar the ferryman raises his price to three coppers a crossing.",
  "The merchants' guild moves its meetings from the granary to the new town hall.",
  "Word arrives that bandits now attack travellers on the north road even in daylight.",
  "Prince Tam is crowned in the square, and the old king is buried at last.",
  "Barges stop carrying flour now that the mill is back.",
  "Captain Ilsa resigns from the watch and leaves town.",
  "The old bridge is widened so two carts can pass at once.",
  "Pilgrims stop coming to the temple after the priest leaves.",
  "Marten Vole stops smuggling salt and opens a bakery instead.",
  "The market sells only fish now; the apple sellers have left.",
  "A drought begins; nobody has seen rain in a month.",
  "The Drowned Lantern burns down in the night.",
  "Oszkar retires and his daughter runs the ferry.",
  "The merchants' guild is dissolved by the new king.",
  "Soldiers clear the bandits and the north road is safe again.",
];

const STORY = {
  format: 2,
  title: "SO-V25-09 SP8 Protected Lore",
  description: "v2.5 plan 09 SP8 W3 live fixture: a town whose lore the story keeps overtaking, with protected spans and auto-tier entries.",
  qualities: [],
  checkpoints: [{ id: "town", name: "Carrowmere", objective: "Keep the town's lore true to what has happened.", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  stagecraft: { lorebooks: [BOOK] },
};

const js = (value) => JSON.stringify(value);

function fixture() {
  const steps = [
    { inject_script: "../fixtures/interop/v25-09-sp8.js" },
    { eval: `const V = globalThis.__soV2509; if (!V) throw new Error('inject v25-09-sp8.js first'); const ctx = SillyTavern.getContext(); if (!ctx.groupId) throw new Error('needs a sandbox GROUP chat'); if (typeof globalThis.storyOrchestratorRuntime.setSpikeFlags !== 'function') throw new Error('this bundle has no setSpikeFlags handle: build the SP8 spike first'); for (const key of Object.keys(globalThis).filter((name) => name.startsWith('storyOrchestratorDebug'))) delete globalThis[key]; const created = await V.createBook(${js(BOOK)}, ${js(ENTRIES)}); const seeded = await V.seed(${js(BOOK)}); if (seeded !== 6) throw new Error('expected 6 protected entries, seeded ' + seeded); return { created, seeded };`, log: true },
    { import_story: STORY },
    { eval: "const V = globalThis.__soV2509; const armed = V.arm(); const route = globalThis.storyOrchestratorRuntime.getGlobalSettings().extraction; return { armed, curatorProfile: route.profiles?.curator ?? route.profileId };", log: true },
  ];
  LINES.slice(0, ROUNDS).forEach((line) => {
    steps.push({ send_generate: { text: line, timeoutMs: 300000, expectReply: true } });
    steps.push({ wait: { schedulerIdle: true, quietMs: 3000, timeoutMs: 300000 } });
    steps.push({ eval: "const rt = globalThis.storyOrchestratorRuntime; await rt.regenerateCanon(true); const outcome = await rt.runWiCuratorPass('sp8-w3'); globalThis.__soV2509.collect(); return { ran: outcome.ran, skipped: outcome.skipped ?? null, ops: outcome.record?.ops?.length ?? 0, dropped: outcome.record?.dropped ?? [] };", log: true });
    steps.push({ eval: "const V = globalThis.__soV2509; const decided = await V.acceptAll(); const applied = await globalThis.storyOrchestratorRuntime.applyCuratorProposals(); V.collect(); return { decided, applied };", log: true });
  });
  steps.push({ wait: { schedulerIdle: true, quietMs: 3000, timeoutMs: 300000 } });
  steps.push({ eval: `const V = globalThis.__soV2509; const tally = await V.tally(${js(BOOK)}); const disarmed = V.disarm(); globalThis.__soV2509Result = tally; return { ...tally, disarmed, pass: tally.proposals >= ${MIN_PROPOSALS} && tally.violations === 0 && tally.refusedShare !== null && tally.refusedShare <= ${MAX_REFUSED} };`, log: true });
  steps.push({ eval: `const V = globalThis.__soV2509; const deleted = await V.deleteBook(${js(BOOK)}); const tally = globalThis.__soV2509Result; if (tally.proposals < ${MIN_PROPOSALS}) throw new Error('W3 measured nothing: ' + tally.proposals + ' proposals (< ${MIN_PROPOSALS}); re-run with more rounds, stated in the report'); if (tally.violations) throw new Error('W3 FAIL: ' + JSON.stringify({ op: tally.opViolations, book: tally.bookViolations })); if (tally.refusedShare > ${MAX_REFUSED}) throw new Error('W3 FAIL: refused share ' + tally.refusedShare); return { deleted };`, log: true });
  return {
    _note: `v2.5 plan 09 SP8 W3 (live safety). LIVE, real LLM, on a lane, in a sandbox GROUP chat. Creates the marker book ${BOOK} (12 entries: 6 carry one protected span, 3 are auto-tier, 3 plain) on the story's stagecraft.lorebooks, switches the curator on in accept mode auto with spikes.sp8CuratorTiers on (all three put back by V.disarm() in the score step; the book is deleted in the last step). ${ROUNDS} rounds of one real turn that overtakes the lore, a canon regeneration, one curator pass, the author accepting every pending card and one boundary apply. Tally (helper's own span parser, independent of src/): proposals = ops the model named in scope incl. plan-time refusals; refused = protected-text/marker refusals at plan time or the write edge; violations = an applied op that lost a span it held, or a seeded span or switch state changed in the book at the end. Predeclared, never retuned (09-sp8-spike-report.md W3): proposals >= ${MIN_PROPOSALS}, violations = 0, refused / proposals <= ${MAX_REFUSED}, in BOTH runs. Fewer than ${MIN_PROPOSALS} proposals = measured nothing (the last step says so). Route: the curator role's profile is logged by the arm step (rule 5). Generated by scripts/spike/v25-09/sp8-fixtures.mjs.`,
    steps,
  };
}

const out = join(ROOT, "test", "scenarios", "live-v25-09-sp8-w3-safety.json");
writeFileSync(out, `${JSON.stringify(fixture(), null, 2)}\n`.replace(/\r?\n/g, "\r\n"));
