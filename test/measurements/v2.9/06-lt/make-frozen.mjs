// Writes frozen.json: corpus + scenario hashes, distribution, floors (verbatim from the plan), scoring rules, rater prompts.
// Run after build-situations.mjs, check.mjs and gen.mjs: node make-frozen.mjs
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const here = new URL("./", import.meta.url);
const sha = (text) => createHash("sha256").update(text).digest("hex");
const raw = readFileSync(new URL("situations.json", here), "utf8");
const doc = JSON.parse(raw);
const arms = ["current", "anchored"];
const scenarioHashes = Object.fromEntries(arms.map((arm) => [arm, Object.fromEntries(readdirSync(new URL(`scenarios/${arm}/`, here)).sort()
  .map((name) => [name, sha(readFileSync(new URL(`scenarios/${arm}/${name}`, here), "utf8"))]))]));
const count = (pick) => doc.situations.reduce((acc, sit) => { for (const key of [pick(sit)].flat()) acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});

const frozen = {
  status: "DRAFT, not frozen: freeze = commit this file + situations.json + scenarios/ to so-sessions (or the plan's Gate record) before the first inference, then never edit; any change is a new corpus id",
  plan: "docs/plans/v2.9/06-grounded-next-actions-and-stakes.md",
  corpus: {
    file: "situations.json", sha256: sha(raw), situations: doc.situations.length,
    distribution: count((s) => s.mix),
    candidateKindsOffline: count((s) => [...new Set(s.expect.computed.candidates.map((c) => c.kind))]),
    rowsWithAnyAnchorOffline: doc.situations.filter((s) => s.expect.computed.candidates.length).length,
    adversarial: { count: doc.situations.filter((s) => s.leakNeedles).length, ids: doc.situations.filter((s) => s.leakNeedles).map((s) => s.id) },
    offlineCheck: "check.mjs: parseStory + runDiagnostics + anchorCandidates/stakesLines/offerRows/makeScreen from the repo source (esbuild bundle, harness/engine.mjs) over a simulated seed; expect.computed holds the result; every leak needle absent from projection, panel rows and anchor texts",
    scenarios: { dir: "scenarios/<arm>/v29-06-lt-<arm>-sNN.json", sha256: scenarioHashes },
  },
  arms: {
    current: { seam: "globalThis.storyOrchestratorDebugSuggestionAnchors = 'off'", meaning: "pre-06 suggestions: no anchor block, no tags (seam NOT built yet; must also decide whether help line / greyed offers / verbatim offers are off in this arm)" },
    anchored: { seam: "unset", meaning: "shipped 06: anchors, tags, help line, greyed offers, verbatim dropped offer" },
  },
  runProtocol: [
    "LT window authorized by the owner; real memory model on the read role, thinking and inner voice on; ONE model lane (2026-10-22 two-lane run timed out on GPU sharing).",
    "Lane seeded fresh from the owner install (synthetic stories, no adolion-fresh needed); images and sprites off (the scenarios also write those leaves).",
    "Per situation run both arms back to back on the same lane; arm order alternates by situation number (odd: current first, even: anchored first).",
    "node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-scenario.mts run <file> --sandbox --group 'Group: Arin, DM Narrator' for each of the 80 files; a guard-step failure (seed did not land) makes the row INCOMPLETE and it is rerun, never scored.",
    "Harvest after the batch: st-eval \"return Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('so-v29-06lt-')).map((k) => [k, JSON.parse(localStorage.getItem(k))]))\" into records.json; check every record.corpus equals corpus.sha256; archive records.json + runner logs to so-sessions.",
    "Then the two rater passes below on opencode openai/gpt-6.1-sol (DeepSeek only when Sol cannot answer; record the route per row).",
  ],
  floors: {
    source: "plan 06 §Predeclared floors, verbatim",
    text: [
      "Sol's, frozen before inference; informational, never retuned.",
      "40 frozen stuck-player situations (synthetic public stories, English; mix of quests, dormant arcs, promises, pending public checks with hints, offers, and none of these):",
      "≥3 usable suggestions in ≥90% (≥36/40).",
      "≥1 evidence-grounded goal/thread offer in ≥85% (≥34/40). Grounded = tagged to an anchor, passes the term check, and the independent rater agrees it engages that anchor.",
      "0 hidden-prerequisite or predetermined-outcome leaks (0/40, plus the adversarial set below; any leak counts).",
      "Blind usefulness ≥ +0.5 on a 1–5 scale over current suggestions, paired on the same 40 situations, rater blind to arm.",
      "No additional model call per request: exactly 1 suggestions call per ask in every row (model-call ring).",
      "Report denominators, abstentions (rows with <3 usable), and anchors offered vs used.",
    ],
  },
  scoring: {
    rowUnit: "one record = one situation x one arm = the first ask only (no Other ideas). Denominator 40 per arm; a missing/INCOMPLETE record is a fail for that row, never dropped.",
    F1_usable: "anchored arm: count rows where rater pass A marks >= 3 lines usable (lines = record.lines, the panel's [data-so=suggestion] buttons, verbatim authored offers included). Pass if >= 36/40. Also report the mechanical count (record.usable >= 3, no rater) and the same numbers for the current arm. Abstentions = rows with < 3 usable, listed by id.",
    F2_grounded: "anchored arm: a row passes when at least one line has record.lines[i].anchor != null (the author-view 'for:' row appears only for lines the parser tagged AND that passed groundedIn's term check) AND rater pass B answers yes for that line/anchor pair. Pass if >= 34/40. The 4 'none' rows can never pass, so the effective ceiling is 36. Open: whether offer/check-help anchors count as 'goal/thread' (strict reading: objective, quest-step, quest, thread, dormant-thread, promise, pattern only).",
    F3_leaks: "both arms, all 40 rows plus help lines and greyed rows: automatic needle scan (case-insensitive substring of each situation's leakNeedles over lines, help, greyed) flags candidates; rater pass A also judges every line against the situation's hidden facts. A leak = a line or panel row that states or implies a hidden prerequisite or a predetermined outcome (rater yes), or any needle hit the adjudicator cannot clear as coincidental wording. Pass only at 0. Report needle hits, rater flags and adjudication separately.",
    F4_usefulness: "rater pass A, paired and blind: each situation shows both line sets as Set 1 / Set 2 in an order drawn from sha256(corpus sha + situation id) (bit 0 = anchored first), each set scored 1-5. Delta = mean over 40 of (anchored - current). Pass if >= +0.5. Also report median delta, wins/ties/losses, and the CI by paired bootstrap (1000 resamples, seed = corpus sha).",
    F5_one_call: "both arms: record.asks === 1 in every row (rows of snapshot.modelCalls with role 'read:suggestions' since the panel opened). Any 0 or 2+ fails the floor; a failed/timed-out ask (record.failed or record.timedOut) still counts its calls.",
    report: "denominators per floor and arm; abstentions; anchors offered vs used per row = authorRow 'anchors a, b, c' (offered kinds) vs distinct non-null line anchors (used); offline expected candidates (expect.computed) vs live authorRow kinds, mismatches listed (a mismatch means the live seed and the offline simulation disagree and the row's F2 needs a look, not a retune).",
  },
  rater: {
    route: "opencode openai/gpt-6.1-sol; DeepSeek fallback only when Sol cannot answer, recorded per row; never the memory model that wrote the suggestions",
    passA: {
      blind: true,
      input: "story premise; what the player can see (record.playerView sections + last 12 messages, identical across arms because the seed is identical; take it from the anchored record and assert equality); hidden facts = the situation's bait sentence + leakNeedles; Set 1 and Set 2 lines with no tags, anchors, help line or greyed rows",
      prompt: [
        "You are rating suggestions shown to a player who is stuck in an interactive roleplay story.",
        "STORY PREMISE: {premise}",
        "WHAT THE PLAYER CAN SEE (story panel and the last messages):\n{playerView}",
        "AUTHOR-ONLY FACTS (the player must NOT learn these from a suggestion): {hiddenFacts}",
        "Two sets of suggestions were written for the same moment by two different systems. You do not know which is which.",
        "SET 1:\n{set1}\nSET 2:\n{set2}",
        "For every line in both sets answer:",
        "- usable: yes if it is something the player could actually say or do next, in the first person, fits this scene, does not decide or narrate how it turns out, and is not a repeat of the player's last message or of another line in its set; else no.",
        "- leak: yes if the line states or clearly implies an AUTHOR-ONLY FACT (a hidden prerequisite, a hidden person/place, or how something will turn out); else no. Wording that happens to share a word is not a leak unless it reveals the fact.",
        "Then give each set one usefulness score from 1 to 5: how much the set would help THIS stuck player take a meaningful next step in THIS story (5 = several concrete, varied, story-relevant options; 1 = generic or useless).",
        "Answer only with JSON: {\"set1\": {\"lines\": [{\"usable\": true, \"leak\": false}], \"usefulness\": 3}, \"set2\": {...}, \"notes\": \"one sentence\"}",
      ].join("\n\n"),
    },
    passB: {
      blind: false,
      why: "grounding can only be judged with the anchor text; anchored arm only, separate session from pass A so pass A stays blind",
      input: "per tagged line: the line and its anchor text (record.lines[i].anchor), plus the playerView",
      prompt: [
        "A player is stuck in a roleplay story. A suggestion was written to build on one thing the player already knows (the ANCHOR).",
        "WHAT THE PLAYER CAN SEE:\n{playerView}",
        "ANCHOR: {anchor}",
        "SUGGESTION: {line}",
        "Does the suggestion actually engage the anchor, i.e. is it a step toward, about, or acting on that goal, thread, promise, help or offer (not just sharing a word with it)?",
        "Answer only with JSON: {\"engages\": true, \"why\": \"one short sentence\"}",
      ].join("\n\n"),
    },
  },
};

writeFileSync(new URL("frozen.json", here), `${JSON.stringify(frozen, null, 2)}\n`);
console.log(`frozen.json: corpus ${frozen.corpus.sha256}, ${Object.values(scenarioHashes).reduce((n, files) => n + Object.keys(files).length, 0)} scenario hashes`);
