import {
  authorsOwnNote, gatedWorldInfo, guidanceMembers, progressQualityForAnchor, ratingLevels, storyWarnings, TENSION_CURRENT_KEY,
  type GateLeaf, type GateNode, type PrimitiveValue, type Quality, type StoryV2, type ValidationError,
} from "@engine/index";
import { directorEnabled } from "@talk/index";
import { checkChapters } from "./chapterDiagnostics";
import { checkHouseRules, checkMotives, checkRequirementMembers } from "./authoringDiagnostics";
import { CAST_CONSEQUENCES, checkBackgrounds, checkCastCards, checkCastChangeMembers, checkNeverEnabled, checkPlayerInRoster, checkRequiredPersonas, type InstallFacts } from "./castDiagnostics";
import { ARRIVAL_CONSEQUENCES, checkGateOpenOnArrival } from "./arrivalDiagnostics";

export type DiagnosticSeverity = "blocking" | "warning" | "info";

export interface Diagnostic extends ValidationError {
  code: string;
  severity: DiagnosticSeverity;
  /** What it costs the story, in plain words. The technical line stays in `message`. */
  consequence?: string;
}

export const DIAGNOSTIC_CODES = [
  "undeclared-quality",
  "op-type-mismatch",
  "enum-value-invalid",
  "anchor-unreachable",
  "quality-out-of-scope",
  "quality-never-in-scope",
  "snapshot-latching-conflict",
  "stub-no-anchor",
  "threshold-unsatisfiable",
  "talk-member-unknown",
  "guidance-member-unknown",
  "talk-lead-outside-speakers",
  "talk-silence-without-director",
  "talk-chain-member-unknown",
  "talk-chain-empty",
  "agency-alternate-unknown",
  "agency-alternate-is-self",
  "scene-read-location-empty",
  "lore-select-inactive",
  "lore-select-exclusive-empty",
  "quality-hint-no-criteria",
  "quality-hint-latching-note",
  "quality-criteria-self-exclusion",
  "latching-enum-placeholder",
  "quality-rating-no-scale",
  "quality-outcome-player-evidence",
  "house-rule-compound",
  "checkpoint-inherits-author-note",
  "world-info-rests-off",
  "motive-member-unknown",
  "motive-for-player",
  "chapter-missing",
  "chapter-unknown",
  "chapter-unreachable",
  "chapter-no-exit",
  "chapter-reentry",
  "story-dead-end",
  "requirement-member-roster-id",
  "cast-member-no-card",
  "background-missing",
  "roster-member-is-player",
  "cast-change-unknown-member",
  "requirement-persona-missing",
  "gate-open-on-arrival",
  "cast-member-never-enabled",
] as const;

// Every code says what it costs the story before it says what is technically wrong: the
// consequence is what an author can act on, and the message is how they find it. One line each, and
// the panel renders the consequence first.
export const DIAGNOSTIC_CONSEQUENCES: Record<(typeof DIAGNOSTIC_CODES)[number], string> = {
  "undeclared-quality": "This gate can never open as written.",
  "op-type-mismatch": "This gate cannot be evaluated, so it never opens.",
  "enum-value-invalid": "This gate can never open, because the story never offers that value.",
  "anchor-unreachable": "The story can never get here.",
  "quality-out-of-scope": "The gate needs this reading, but at that point nothing is asked for it.",
  "quality-never-in-scope": "Nothing can react to this, because the story is never asked about it.",
  "snapshot-latching-conflict": "The value is copied once, so a later gate on a different value never passes.",
  "stub-no-anchor": "This part of the story leads nowhere it can finish.",
  "threshold-unsatisfiable": "Progress can never reach this threshold, so the story cannot converge here.",
  "talk-member-unknown": "The story asks for a speaker nobody can be, so who speaks falls back to SillyTavern.",
  "guidance-member-unknown": "Nobody hears this private direction, because no character in the cast has that name.",
  "talk-lead-outside-speakers": "This character still gets picked, just not at the weight you set.",
  "talk-silence-without-director": "Silence never happens, because nothing is choosing who speaks.",
  "talk-chain-member-unknown": "This scripted voice nobody can be is skipped, so fewer characters answer than you wrote.",
  "talk-chain-empty": "A scripted chain with no order speaks only its first voice.",
  "agency-alternate-unknown": "If the player refuses the route, there is nowhere prepared to go.",
  "agency-alternate-is-self": "If the player refuses the route, the recovery sends them back into it.",
  "scene-read-location-empty": "The story can never say where the scene is, so nothing can key off a place.",
  "lore-select-inactive": "This lore may never be active, so the story cannot rely on it being in play.",
  "lore-select-exclusive-empty": "Exclusive lore-select has no lorebook to judge, so it never excludes anything.",
  "quality-hint-no-criteria": "The model reads this from a bare list, so it may read it loosely.",
  "quality-hint-latching-note": "This value is written once and then holds, so the first confident read decides.",
  "quality-criteria-self-exclusion": "One option says it is not itself, which tells the model nothing.",
  "latching-enum-placeholder": "Once the first read lands this can never change, and the unset state is not one of its values.",
  "quality-rating-no-scale": "This quality is never read, because there is no scale to score it against.",
  "quality-outcome-player-evidence": "A player's line alone can move the story here: writing that they did it counts as done.",
  "house-rule-compound": "The check asks one question per rule, so a rule that demands two things is judged on whichever one the model reads.",
  "checkpoint-inherits-author-note": "The model keeps being told an earlier checkpoint's note here.",
  "world-info-rests-off": "These lorebook entries stay off in their lorebooks, and are switched on only in this story's own chats.",
  "motive-member-unknown": "Nobody is told this motive: no cast member has that id.",
  "motive-for-player": "The player's choices are theirs, so nobody is told this motive.",
  "chapter-missing": "The story cannot load, because this checkpoint belongs to no chapter.",
  "chapter-unknown": "The story cannot load, because this checkpoint names a chapter that does not exist.",
  "chapter-unreachable": "This chapter is never played, so it is never written up.",
  "chapter-no-exit": "The story stops in this chapter, but it is not marked as the last one, so it is never closed.",
  "chapter-reentry": "Going back to an earlier chapter reopens a closed record, so the story so far repeats itself.",
  "story-dead-end": "The story stops here without an ending, so its last chapter is never written up.",
  "requirement-member-roster-id": "The story never reads as ready: it waits for a character named by a cast id, while the card has another name.",
  ...CAST_CONSEQUENCES,
  ...ARRIVAL_CONSEQUENCES,
};

// D: what the Studio needs to know about the install, not the story.
export interface DiagnosticsContext extends InstallFacts {
  worldInfoGating?: "file" | "scan";
}

const namesOption = (text: string, option: string) => {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}_]+/u);
  const needle = option.trim().toLowerCase();
  return needle.includes(" ") ? text.toLowerCase().includes(needle) : words.includes(needle);
};

const walkLeaves = (gate: GateNode, visit: (leaf: GateLeaf) => void) => {
  if ("q" in gate) { visit(gate); return; }
  if ("all" in gate) gate.all.forEach((entry) => walkLeaves(entry, visit));
  else if ("any" in gate) gate.any.forEach((entry) => walkLeaves(entry, visit));
  else walkLeaves(gate.not, visit);
};

const buildQualityMap = (draft: StoryV2): Map<string, Quality> => {
  const map = new Map<string, Quality>();
  draft.qualities.forEach((quality) => map.set(quality.key, quality));
  draft.checkpoints.filter((checkpoint) => checkpoint.type === "anchor").forEach((anchor) => {
    const key = progressQualityForAnchor(anchor.id);
    if (!map.has(key)) map.set(key, { key, type: "float", source: "code", monotonic: true, rubric: "" });
  });
  if (!map.has(TENSION_CURRENT_KEY)) map.set(TENSION_CURRENT_KEY, { key: TENSION_CURRENT_KEY, type: "float", source: "extractor", rubric: "" });
  return map;
};

const buildReachable = (draft: StoryV2) => {
  const adjacency = new Map<string, string[]>();
  draft.checkpoints.forEach((checkpoint) => adjacency.set(checkpoint.id, []));
  draft.transitions.forEach((transition) => adjacency.get(transition.from)?.push(transition.to));
  return (start: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [...(adjacency.get(start) ?? [])];
    while (stack.length) {
      const next = stack.shift();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      stack.push(...(adjacency.get(next) ?? []));
    }
    return seen;
  };
};

const hintApplies = (quality: Quality, at: string, reachableFrom: (start: string) => Set<string>): boolean => {
  const hint = quality.scope_hint;
  if (!hint) return true;
  if (hint.from && at !== hint.from && !reachableFrom(hint.from).has(at)) return false;
  if (hint.until && at !== hint.until && !reachableFrom(at).has(hint.until)) return false;
  return true;
};

type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

interface DiagnosticRun {
  draft: StoryV2;
  context: DiagnosticsContext;
  push: (code: DiagnosticCode, severity: DiagnosticSeverity, path: string, message: string) => void;
  qualityByKey: ReturnType<typeof buildQualityMap>;
  checkpointById: Map<string, StoryV2["checkpoints"][number]>;
  reachableFrom: (start: string) => Set<string>;
  startId: string;
}

const checkGates = (run: DiagnosticRun) => {
  const { draft, push, qualityByKey, reachableFrom } = run;
  draft.transitions.forEach((transition, index) => {
    const path = `transitions.${index}.gate`;
    walkLeaves(transition.gate, (leaf) => {
      const quality = qualityByKey.get(leaf.q);
      if (!quality) {
        push("undeclared-quality", "blocking", path, `gate references undeclared quality '${leaf.q}'`);
        return;
      }
      const ordered = [">=", "<=", ">", "<"].includes(leaf.op);
      if (ordered && quality.type !== "int" && quality.type !== "float") push("op-type-mismatch", "blocking", path, `'${leaf.op}' needs a numeric quality but '${quality.key}' is ${quality.type}`);
      if (leaf.op === "in" && quality.type !== "enum" && quality.type !== "string") push(
        "op-type-mismatch",
        "blocking",
        path,
        `'in' needs an enum or string quality but '${quality.key}' is ${quality.type}`,
      );
      if (leaf.op === "in" && !Array.isArray(leaf.v)) push("op-type-mismatch", "blocking", path, `'in' needs an array value on '${quality.key}'`);
      if (leaf.op !== "in" && Array.isArray(leaf.v)) push("op-type-mismatch", "blocking", path, `only 'in' takes an array value on '${quality.key}'`);
      if (quality.type === "enum") {
        const values = Array.isArray(leaf.v) ? leaf.v : [leaf.v];
        values.forEach((value) => {
          if (!quality.values?.includes(String(value))) push("enum-value-invalid", "blocking", path, `'${String(value)}' is not a declared value of '${quality.key}'`);
        });
      }
      if (quality.source === "extractor" && !hintApplies(quality, transition.from, reachableFrom)) {
        push("quality-out-of-scope", "warning", path, `'${quality.key}' is gated at '${transition.from}' but its scope hint excludes it there`);
      }
    });
  });
};

const checkAnchorsReachable = (run: DiagnosticRun) => {
  const { draft, push, reachableFrom, startId } = run;
  const reachableFromStart = reachableFrom(startId);
  draft.checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.type !== "anchor" || checkpoint.id === startId) return;
    if (!reachableFromStart.has(checkpoint.id)) push("anchor-unreachable", "warning", `checkpoints.${index}`, `anchor '${checkpoint.id}' has no transition path from the start checkpoint`);
  });
};

const checkLatchingSnapshots = (run: DiagnosticRun) => {
  const { draft, push, reachableFrom } = run;
  draft.qualities.filter((quality) => quality.latching).forEach((quality) => {
    const snapshots = draft.checkpoints
      .filter((checkpoint) => checkpoint.state_snapshot && Object.prototype.hasOwnProperty.call(checkpoint.state_snapshot, quality.key))
      .map((checkpoint) => ({ id: checkpoint.id, value: (checkpoint.state_snapshot as Record<string, PrimitiveValue>)[quality.key] }));
    if (!snapshots.length) return;
    let conflict = false;
    snapshots.forEach((snapshot) => {
      const downstream = reachableFrom(snapshot.id);
      draft.transitions.forEach((transition) => {
        if (transition.from !== snapshot.id && !downstream.has(transition.from)) return;
        walkLeaves(transition.gate, (leaf) => {
          if (leaf.q !== quality.key) return;
          if (leaf.op === "==" && !Array.isArray(leaf.v) && leaf.v !== snapshot.value) conflict = true;
          if (leaf.op === "in" && Array.isArray(leaf.v) && !leaf.v.includes(snapshot.value)) conflict = true;
        });
      });
    });
    if (conflict) push("snapshot-latching-conflict", "warning", "qualities", `latching quality '${quality.key}' is snapshotted then gated at a conflicting value downstream`);
  });
};

const checkQualitiesInScope = (run: DiagnosticRun) => {
  const { draft, push } = run;
  const referencedKeys = new Set<string>();
  draft.transitions.forEach((transition) => walkLeaves(transition.gate, (leaf) => referencedKeys.add(leaf.q)));
  draft.checkpoints.forEach((checkpoint) => Object.keys(checkpoint.state_snapshot ?? {}).forEach((key) => referencedKeys.add(key)));
  draft.qualities.forEach((quality, index) => {
    if (quality.source !== "extractor" || quality.key === TENSION_CURRENT_KEY) return;
    if (!referencedKeys.has(quality.key)) {
      push(
        "quality-never-in-scope",
        "warning",
        `qualities.${index}`,
        `'${quality.key}' appears in no gate or state_snapshot — it never enters extraction scope, so the extractor is never asked about it`,
      );
    }
  });
};

const checkStubs = (run: DiagnosticRun) => {
  const { draft, push, checkpointById, reachableFrom } = run;
  Object.keys(draft.scaffolding ?? {}).forEach((stubId) => {
    const reachable = reachableFrom(stubId);
    const hasAnchor = [...reachable].some((id) => checkpointById.get(id)?.type === "anchor");
    if (!hasAnchor) push("stub-no-anchor", "warning", `scaffolding.${stubId}`, `stub '${stubId}' has no anchor reachable beyond it`);
  });
};

const checkTalkAndAgency = (run: DiagnosticRun) => {
  const { draft, push } = run;
  const rosterIdByRef = new Map<string, string>();
  draft.roster.forEach((member) => {
    rosterIdByRef.set(member.id.trim().toLowerCase(), member.id);
    if (member.name) rosterIdByRef.set(member.name.trim().toLowerCase(), member.id);
  });
  const resolveRosterRef = (ref: string): string | null => rosterIdByRef.get(ref.trim().toLowerCase()) ?? null;

  draft.checkpoints.forEach((checkpoint, index) => {
    const control = checkpoint.talk_control;
    const path = `checkpoints.${index}.talk_control`;
    if (control) {
      (control.speakers ?? []).forEach((speaker, speakerIndex) => {
        if (!resolveRosterRef(speaker.member)) push("talk-member-unknown", "warning", `${path}.speakers.${speakerIndex}`, `speaker '${speaker.member}' is not a roster member`);
      });
      if (control.lead) {
        const leadId = resolveRosterRef(control.lead);
        if (!leadId) {
          push("talk-member-unknown", "warning", `${path}.lead`, `lead '${control.lead}' is not a roster member`);
        } else if (control.speakers?.length) {
          const speakerIds = new Set(control.speakers.map((speaker) => resolveRosterRef(speaker.member)).filter(Boolean));
          if (!speakerIds.has(leadId)) push(
            "talk-lead-outside-speakers",
            "warning",
            `${path}.lead`,
            `lead '${control.lead}' is not in the speakers list; it still joins the candidates at weight 1, so list it to set its weight`,
          );
        }
      }
      if (control.allow_silence && !directorEnabled(control)) {
        push("talk-silence-without-director", "warning", path, "allow_silence only takes effect when the director is enabled");
      }
      if (control.chain) {
        (control.chain.sequence ?? []).forEach((ref, sequenceIndex) => {
          if (!resolveRosterRef(ref)) push("talk-chain-member-unknown", "warning", `${path}.chain.sequence.${sequenceIndex}`, `chain speaker '${ref}' is not a roster member`);
        });
        if (control.chain.mode === "scripted" && !(control.chain.sequence ?? []).length) {
          push("talk-chain-empty", "warning", `${path}.chain.sequence`, "a scripted chain needs an order");
        }
      }
    }
    Object.keys(guidanceMembers(checkpoint.guidance)).forEach((ref) => {
      if (!resolveRosterRef(ref)) push("guidance-member-unknown", "warning", `checkpoints.${index}.guidance.members.${ref}`, `guidance member '${ref}' is not a roster member`);
    });
    (checkpoint.effects?.npc_replies ?? []).forEach((reply, replyIndex) => {
      if (reply.after_member && !resolveRosterRef(reply.after_member)) {
        push("talk-member-unknown", "warning", `checkpoints.${index}.effects.npc_replies.${replyIndex}.after_member`, `after_member '${reply.after_member}' is not a roster member`);
      }
    });
    // A refusal fallback that names nothing is worse than none: the author sees a
    // recovery offered and the button takes them nowhere, which is why the runtime treats an unknown
    // alternate as absent. Say so here, where the author can fix it.
    const alternate = checkpoint.agency?.alternate;
    if (alternate) {
      if (!draft.checkpoints.some((entry) => entry.id === alternate)) push(
        "agency-alternate-unknown",
        "warning",
        `checkpoints.${index}.agency.alternate`,
        `alternate '${alternate}' is not a checkpoint of this story`,
      );
      else if (alternate === checkpoint.id) push(
        "agency-alternate-is-self",
        "warning",
        `checkpoints.${index}.agency.alternate`,
        `alternate '${alternate}' is this checkpoint, so the recovery would re-enter the route the player refused`,
      );
    }
  });
};

const checkThresholds = (run: DiagnosticRun) => {
  const { draft, push } = run;
  draft.checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.type !== "anchor" || typeof checkpoint.convergence_threshold !== "number") return;
    const available = draft.transitions.reduce((sum, transition) => sum + (transition.effects?.progress?.anchor === checkpoint.id ? transition.effects.progress.amount ?? 0 : 0), 0);
    if (available < checkpoint.convergence_threshold) push(
      "threshold-unsatisfiable",
      "warning",
      `checkpoints.${index}`,
      `anchor '${checkpoint.id}' threshold ${checkpoint.convergence_threshold} exceeds total available progress ${available}`,
    );
  });
};

const checkRatingScales = (run: DiagnosticRun) => {
  const { draft, push } = run;
  // A rating the judge cannot score is skipped without a word (judge/extraction.ts `if (!levels) continue`),
  // so the author sees a quality that simply never fires. Blocking, and the
  // message carries the shape the repair pass has to produce — the model is asked to correct itself
  // from this text alone.
  draft.qualities.forEach((quality, index) => {
    if (quality.read_as !== "rating" || ratingLevels(quality)) return;
    push(
      "quality-rating-no-scale",
      "blocking",
      `qualities.${index}`,
      `'${quality.key}' is read as a rating, so its scale has to be readable: either criteria.levels, or a rubric of the form rubric: "from 1 (barely) to 5 (completely)". As ` +
        `written the judge has no levels to score against and the quality is never read.`,
    );
  });
};

const checkOutcomeEvidence = (run: DiagnosticRun) => {
  const { draft, push, checkpointById } = run;
  const anchorLeaves = new Set<string>();
  draft.transitions.filter((transition) => checkpointById.get(transition.to)?.type === "anchor").forEach((transition) => walkLeaves(transition.gate, (leaf) => anchorLeaves.add(leaf.q)));
  draft.qualities.forEach((quality, index) => {
    if (quality.source !== "extractor" || (quality.type !== "bool" && quality.type !== "enum") || quality.evidence_from !== undefined || !anchorLeaves.has(quality.key)) return;
    push(
      "quality-outcome-player-evidence",
      "info",
      `qualities.${index}`,
      `'${quality.key}' gates the way into an anchor, and a line the player wrote can prove it; set evidence_from to world if only the world should, or to any to keep it`,
    );
  });
};

const checkInheritedNotes = (run: DiagnosticRun) => {
  const { draft, push, checkpointById } = run;
  const predecessors = new Map<string, string[]>();
  draft.transitions.forEach((transition) => predecessors.set(transition.to, [...(predecessors.get(transition.to) ?? []), transition.from]));
  draft.checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.effects?.author_note !== undefined) return;
    const notes = new Set<string>();
    const seen = new Set([checkpoint.id]);
    const stack = [...(predecessors.get(checkpoint.id) ?? [])];
    while (stack.length) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const previous = checkpointById.get(id);
      if (previous?.effects?.author_note === undefined) stack.push(...(predecessors.get(id) ?? []));
      else if (authorsOwnNote(previous)) notes.add(previous.name || previous.id);
    }
    if (!notes.size) return;
    const objective = draft.objective_block === "off" ? "the objective line is not added (objective_block is off)" : "the objective line is added";
    push(
      "checkpoint-inherits-author-note",
      "info",
      `checkpoints.${index}.effects.author_note`,
      `'${checkpoint.id}' plays under the note of ${[...notes].map((name) => `"${name}"`).join(" or ")}; ${objective}`,
    );
  });
};

const checkLatchingPlaceholders = (run: DiagnosticRun) => {
  const { draft, push } = run;
  // A latching enum that lists an unset-shaped member freezes on it.
  storyWarnings(draft).forEach((warning) => push("latching-enum-placeholder", "warning", warning.path, warning.message));
};

const checkJudgeHints = (run: DiagnosticRun) => {
  const { draft, push } = run;
  // Judge hints. A `not_for` clause written on the wrong option silently inverts it, so a clause that
  // names its own option is flagged.
  draft.qualities.forEach((quality, index) => {
    if (!quality.read_as) return;
    const criteria = quality.criteria && !("levels" in quality.criteria) ? (quality.criteria as Record<string, string | { what: string; not_for?: string }>) : null;
    if (quality.read_as === "choice" && quality.type === "enum" && !criteria && (quality.values ?? []).every((value) => !/\s/.test(value.trim()))) {
      push(
        "quality-hint-no-criteria",
        "info",
        `qualities.${index}`,
        `'${quality.key}' is read by the judge from single-word options with no description; the plain form works, but a line per option ("means…") removes ambiguity`,
      );
    }
    if (quality.latching) push("quality-hint-latching-note", "info", `qualities.${index}`, `'${quality.key}' latches, so the judge writes it only at confidence 0.9 or more (0.8 otherwise)`);
    Object.entries(criteria ?? {}).forEach(([option, criterion]) => {
      const notFor = typeof criterion === "string" ? "" : criterion.not_for ?? "";
      if (quality.type === "enum" && notFor && namesOption(notFor, option)) {
        push(
          "quality-criteria-self-exclusion",
          "warning",
          `qualities.${index}.criteria.${option}`,
          `the "not for" on '${option}' names '${option}' itself; "not for" lists what should NOT count as this option, so it probably belongs on another option`,
        );
      }
    });
  });
};

const checkLoreSelect = (run: DiagnosticRun) => {
  const { draft, push } = run;
  const required = new Set((draft.requirements?.lorebooks ?? []).map((name) => name.trim().toLowerCase()));
  (draft.lore_select?.lorebooks ?? []).forEach((name, index) => {
    if (name.trim() && !required.has(name.trim().toLowerCase())) push(
      "lore-select-inactive",
      "warning",
      `lore_select.lorebooks.${index}`,
      `'${name}' is not a required lorebook, so it may not be active; lore-select only reaches books ST is scanning. Add it under Requirements`,
    );
  });
  if (draft.lore_select?.exclusive && !draft.lore_select.lorebooks.some((name) => name.trim())) push(
    "lore-select-exclusive-empty",
    "warning",
    "lore_select.exclusive",
    "exclusive lore-select is on but names no lorebook; add the lorebooks it may judge",
  );
};

const checkSceneLocation = (run: DiagnosticRun) => {
  const { draft, push } = run;
  const locationIndex = draft.qualities.findIndex((quality) => quality.key === "location");
  if (locationIndex >= 0 && draft.qualities[locationIndex].type === "string" && !draft.scene_read?.locations?.length) {
    push(
      "scene-read-location-empty",
      "warning",
      `qualities.${locationIndex}`,
      "'location' is free text, so the scene tracker can never say where the scene is: the judge only picks from a list. Make it an enum, or list places under Scene read",
    );
  }
};

const checkWorldInfoGating = (run: DiagnosticRun) => {
  const { draft, context, push } = run;
  if (context.worldInfoGating === "scan") {
    const books = [...gatedWorldInfo([draft])].filter(([, comments]) => comments.size > 0);
    if (books.length) {
      const counts = books.map(([lorebook, comments]) => `${comments.size} lorebook ${comments.size === 1 ? "entry" : "entries"} in ${lorebook}`).join(", ");
      push(
        "world-info-rests-off",
        "info",
        "checkpoints",
        `Per-chat lorebook gating is on: ${counts} rest off in their files, and SillyTavern's lorebook editor shows them off. Story Orchestrator switches them on per chat ` +
          `along the story's path; with the extension off they stay off`,
      );
    }
  }
};

const DIAGNOSTIC_CHECKS = [
  checkGates,
  checkAnchorsReachable,
  checkLatchingSnapshots,
  checkQualitiesInScope,
  checkStubs,
  checkTalkAndAgency,
  checkThresholds,
  checkRatingScales,
  checkOutcomeEvidence,
  checkInheritedNotes,
  checkLatchingPlaceholders,
  checkJudgeHints,
  checkLoreSelect,
  checkHouseRules,
  checkSceneLocation,
  checkWorldInfoGating,
  checkMotives,
  checkChapters,
  checkRequirementMembers,
  checkCastCards,
  checkCastChangeMembers,
  checkBackgrounds,
  checkPlayerInRoster,
  checkRequiredPersonas,
  checkGateOpenOnArrival,
  checkNeverEnabled,
];

export const runDiagnostics = (draft: StoryV2, context: DiagnosticsContext = {}): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const run: DiagnosticRun = {
    draft,
    context,
    push: (code, severity, path, message) => { diagnostics.push({ code, severity, path, message, consequence: DIAGNOSTIC_CONSEQUENCES[code] }); },
    qualityByKey: buildQualityMap(draft),
    checkpointById: new Map(draft.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint])),
    reachableFrom: buildReachable(draft),
    startId: draft.checkpoints.find((checkpoint) => checkpoint.start)?.id ?? draft.checkpoints[0]?.id ?? "",
  };
  DIAGNOSTIC_CHECKS.forEach((check) => check(run));
  return diagnostics;
};
