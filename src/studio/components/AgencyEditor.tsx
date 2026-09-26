import { DEFAULT_AGENCY, OBJECTIVE_KINDS, type AgencyPolicy, type ObjectiveKind } from "@engine/index";

export interface AgencyEditorProps {
  policy: Partial<AgencyPolicy> | undefined;
  /** Every other checkpoint, for the authored refusal fallback. */
  checkpoints: Array<{ id: string; name: string }>;
  onChange(next: Partial<AgencyPolicy> | undefined): void;
}

// The policy is optional in the record and DEFAULTED in the runtime, so the editor
// shows the defaults the story is actually playing under rather than empty boxes: an author who leaves
// this alone is not opting out, and one who changes it sees exactly what changes.
export function AgencyEditor({ policy, checkpoints, onChange }: AgencyEditorProps) {
  const effective: AgencyPolicy = { ...DEFAULT_AGENCY, ...(policy ?? {}) };
  const patch = (next: Partial<AgencyPolicy>) => {
    const merged: Partial<AgencyPolicy> = { ...(policy ?? {}), ...next };
    (Object.keys(merged) as Array<keyof AgencyPolicy>).forEach((key) => {
      if (merged[key] === DEFAULT_AGENCY[key] || merged[key] === undefined) delete merged[key];
    });
    onChange(Object.keys(merged).length ? merged : undefined);
  };

  return (
    <div data-so="agency-editor" className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs">
        <span>Objective kind</span>
        <select data-so="agency-objective-kind" className="text_pole st-input" value={effective.objective_kind} onChange={(event) => patch({ objective_kind: event.target.value as ObjectiveKind })}>
          {OBJECTIVE_KINDS.map((kind) => <option key={kind} value={kind}>{kind === "player_action" ? "Needs the player's own act" : "World pressure"}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input data-so="agency-protect-choice" type="checkbox" checked={effective.protect_player_choice} onChange={(event) => patch({ protect_player_choice: event.target.checked })} />
        <span>Never narrate the player accepting what they refused</span>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input data-so="agency-never-narrate" type="checkbox" checked={effective.never_narrate_player_action} onChange={(event) => patch({ never_narrate_player_action: event.target.checked })} />
        <span>The player&apos;s own acts are theirs to write</span>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input data-so="agency-attempts-only" type="checkbox" checked={Boolean(effective.player_attempts_only)} onChange={(event) => patch({ player_attempts_only: event.target.checked })} />
        <span>The player&apos;s message is an attempt; the world decides whether it works</span>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span>If the player refuses the route here</span>
        <select data-so="agency-alternate" className="text_pole st-input" value={effective.alternate ?? ""} onChange={(event) => patch({ alternate: event.target.value || undefined })}>
          <option value="">Offer the author a generated road ahead</option>
          {checkpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}</option>)}
        </select>
      </label>
    </div>
  );
}

export default AgencyEditor;
