import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TURNS = 60;
const T4_BUDGET = 300;

export const NEEDLES = [
  { keyword: "Oszkar", line: "I pay the ferryman and ask his name. He says it is Oszkar, and I thank Oszkar for the crossing." },
  { keyword: "compass", line: "Before we leave the mill I hide the silver compass inside the hollow oak, where nobody will look." },
  { keyword: "340", line: "I admit to the narrator that my sister owes the guild exactly 340 crowns, and that is why we travel." },
  { keyword: "juniper", line: "At the east gate I give the guard the password, 'juniper tide', and wait for the bar to lift." },
  { keyword: "Brindlewick", line: "I brush down our old horse, Brindlewick, and promise him a long rest at the next town." },
  { keyword: "green wax", line: "I check that the letter we carry is still sealed with its green wax before I put it away." },
  { keyword: "saffron", line: "Someone at the stall warns me that the mayor is allergic to saffron, so I leave the spice behind." },
  { keyword: "Carrow", line: "We cannot take the short road: the bridge at Carrow collapsed two winters ago, so we turn north." },
  { keyword: "Vell", line: "I flex my hand and tell the story of losing two fingers to frostbite in the Vell pass." },
  { keyword: "cellar", line: "The innkeeper whispers that the inn's cellar has a tunnel that runs to the old chapel." },
  { keyword: "cloudberry", line: "I remind everyone that we promised the smith a jar of cloudberry honey for mending the axle." },
  { keyword: "Ilsabet", line: "I bow to the captain's daughter, who introduces herself as Ilsabet, and ask her the way." },
];

const FILLER = [
  "I keep walking along the road and look at the weather ahead.",
  "I stop to drink some water and rest my feet for a moment.",
  "I ask the narrator what the landscape around us looks like now.",
  "I check our packs and count how much food is left.",
  "I greet a passing traveller and ask about the road ahead.",
  "I look for a good place to make camp before it gets dark.",
  "I gather dry wood and start a small fire.",
  "I listen to the night sounds and keep watch for a while.",
  "At dawn I pack up the camp and set off again.",
  "I follow the river path and watch the fish in the shallows.",
  "I help a farmer push his cart out of the mud.",
  "I climb a low hill to see what lies beyond it.",
  "I buy bread at a roadside stall and share it.",
  "I hum an old travelling song to pass the time.",
  "I ask what the people in this valley do for a living.",
  "I sit by the road and mend a tear in my cloak.",
];

const STORY = {
  format: 2,
  title: "SO-V25-09 SP4 Retention",
  description: "v2.5 plan 09 SP4 T3 live fixture: one open checkpoint, so memory and the short-term tier run on a long solo chat.",
  qualities: [],
  checkpoints: [{ id: "road", name: "The long road", objective: "Travel on and keep the party supplied.", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "dm-narrator", name: "DM Narrator" }],
};

const playerLine = (turn) => (turn <= NEEDLES.length ? NEEDLES[turn - 1].line : FILLER[(turn - NEEDLES.length - 1) % FILLER.length]);

const armEval = (append) => [
  "const rt = globalThis.storyOrchestratorRuntime; const ctx = SillyTavern.getContext();",
  "if (ctx.groupId) throw new Error(`SP4 T3 runs in a SOLO chat: the page is in group ${ctx.groupId}`);",
  "if (typeof rt.setSpikeFlags !== 'function') throw new Error('this bundle has no setSpikeFlags handle: build the SP4 spike first');",
  `rt.setSpikeFlags({ sp4AppendShortTerm: ${append} });`,
  `if (rt.getGlobalSettings().spikes.sp4AppendShortTerm !== ${append}) throw new Error('the SP4 flag did not land');`,
  "if (!rt.getSnapshot().memory.settings.enabled) throw new Error('memory is off on this install: the short-term tier never runs');",
  `globalThis.__sp4 = { arm: '${append ? "append" : "rolling"}', t4: [] };`,
  "return { arm: globalThis.__sp4.arm, chatId: ctx.chatId, synthesisProfile: rt.getGlobalSettings().extraction.profiles?.synthesis ?? rt.getGlobalSettings().extraction.profileId };",
].join(" ");

const T4_EVAL = [
  "const snapshot = globalThis.storyOrchestratorRuntime.getSnapshot();",
  "const used = snapshot.memoryInjection?.trim?.short_term?.tokensUsed ?? 0;",
  "globalThis.__sp4.t4.push({ messages: SillyTavern.getContext().chat.length, used });",
  `if (used > ${T4_BUDGET}) throw new Error(\`T4: injected short_term is \${used} tokens (> ${T4_BUDGET})\`);`,
  "return { used };",
].join(" ");

const PLACEMENT_EVAL = [
  "const chat = SillyTavern.getContext().chat;",
  `const needles = ${JSON.stringify(NEEDLES.map((needle) => needle.keyword))};`,
  "const early = chat.slice(0, 24).filter((message) => message.is_user).map((message) => message.mes).join(' ');",
  "const missing = needles.filter((keyword) => !early.toLowerCase().includes(keyword.toLowerCase()));",
  "if (missing.length) throw new Error(`needles outside the first 24 messages: ${missing.join(', ')}`);",
  "return { messages: chat.length, planted: needles.length };",
].join(" ");

const scoreEval = (append) => [
  "const rt = globalThis.storyOrchestratorRuntime; const ctx = SillyTavern.getContext();",
  `const needles = ${JSON.stringify(NEEDLES.map((needle) => needle.keyword))};`,
  "const block = rt.getMemoryInjectionBlocks().short_term ?? '';",
  "const present = needles.filter((keyword) => block.toLowerCase().includes(keyword.toLowerCase()));",
  "const turns = ctx.chat.filter((message) => message.is_user).length;",
  `if (turns !== ${TURNS}) throw new Error(\`expected ${TURNS} player turns, found \${turns}\`);`,
  "const rows = rt.getSnapshot().memory.entries?.filter?.((entry) => entry.tier === 'short_term').length ?? null;",
  "const t4max = Math.max(0, ...globalThis.__sp4.t4.map((row) => row.used));",
  `rt.setSpikeFlags({ sp4AppendShortTerm: false });`,
  `return { arm: '${append ? "append" : "rolling"}', turns, present, share: present.length / needles.length, shortTermRows: rows, blockChars: block.length, t4max, t4: globalThis.__sp4.t4 };`,
].join(" ");

function fixture(append) {
  const arm = append ? "append" : "rolling";
  const steps = [
    { wait: { schedulerIdle: true, quietMs: 3000, timeoutMs: 300000 } },
    { solo_chat: { character: "DM Narrator" }, log: true },
    { eval: "const ctx = SillyTavern.getContext(); if (ctx.groupId) throw new Error('expected a solo chat'); for (const key of Object.keys(globalThis).filter((name) => name.startsWith('storyOrchestratorDebug'))) delete globalThis[key]; return { chatId: ctx.chatId, messages: ctx.chat.length };", log: true },
    { import_story: STORY },
    { eval: armEval(append), log: true },
  ];
  for (let turn = 1; turn <= TURNS; turn += 1) {
    steps.push({ send_generate: { text: playerLine(turn), timeoutMs: 300000, expectReply: true } });
    steps.push({ wait: { schedulerIdle: true, quietMs: 3000, timeoutMs: 300000 } });
    steps.push({ eval: T4_EVAL });
    if (turn === NEEDLES.length) steps.push({ eval: PLACEMENT_EVAL, log: true });
  }
  steps.push({ eval: scoreEval(append), log: true });
  steps.push({ solo_chat: { leave: true } });
  return {
    _note: `v2.5 plan 09 SP4 T3 (retention) + T4 (budget, every boundary), arm \`${arm}\` (${append ? "spike: spikes.sp4AppendShortTerm ON" : "control: today's rolling entry, flag OFF"}). LIVE, real LLM, on a lane. A new solo chat of DM Narrator (owned by the run, deleted by its cleanup); ${TURNS} real turns (send_generate), the first ${NEEDLES.length} player lines each plant one needle (the first 24 messages, asserted), the rest are needle-free filler. At turn ${TURNS} the injected short_term block (getMemoryInjectionBlocks().short_term) is scored: a needle is present iff its keyword occurs in the block, case-insensitive. Predeclared, never retuned (09-research-spikes.md SP4 T3): share(append) >= share(rolling) + 0.15 in BOTH runs of the series, pairing run k of each arm. T4: the injected short_term tokensUsed <= ${T4_BUDGET} after every boundary (the step throws otherwise). The step flips the install-wide spike flag and turns it OFF again in the score step; diff a run header around the batch. Route: the synthesis role's profile is logged by the arm step (rule 5). Generated by scripts/spike/v25-09/sp4-fixtures.mjs.`,
    steps,
  };
}

const crlf = (text) => text.replace(/\r?\n/g, "\r\n");

for (const append of [false, true]) {
  const path = join(ROOT, "test", "scenarios", `live-v25-09-sp4-t3-${append ? "append" : "rolling"}.json`);
  writeFileSync(path, crlf(`${JSON.stringify(fixture(append), null, 2)}\n`));
}
