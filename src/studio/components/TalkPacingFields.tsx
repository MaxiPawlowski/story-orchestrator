import React from "react";
import {
  TALK_ATTEMPTS_CAP, TALK_BUDGET_CAP, TALK_LEAD_RUN_CAP, TALK_LEAD_WORDS_MAX, TALK_LEAD_WORDS_MIN, TALK_PROFILES, TALK_TURNS_CAP,
  type StoryTalkDefaults, type TalkControl, type TalkProfileName,
} from "@engine/index";
import { TALK_PROFILE_SHAPES, describeTalkPolicy, resolveTalkPolicy } from "@talk/index";
import HelpTooltip from "@components/studio/HelpTooltip";

const PROFILE_LABELS: Record<TalkProfileName, string> = {
  opening: "Opening: the lead sets the scene, a member pulls the player in",
  conversation: "Conversation: members trade lines, quiet ones get the floor",
  decision: "Decision: short, then the turn is the player's",
  action: "Action: the lead resolves, one reaction lands",
  aftermath: "Aftermath: members reflect, the lead stays brief",
};

const whole = (value: string, min: number, max: number): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : undefined;
};

const NumberField: React.FC<{ label: string; so: string; value: number | undefined; min: number; max: number; placeholder?: string; onChange: (next: number | undefined) => void }> = ({
  label, so, value, min, max, placeholder, onChange,
}) => (
  <label className="flex items-center gap-2 text-xs st-muted">
    {label}
    <input data-so={so} type="number" min={min} max={max} className="text_pole st-input w-20" aria-label={label} placeholder={placeholder}
      value={value ?? ""} onChange={(event) => onChange(whole(event.target.value, min, max))} />
  </label>
);

export interface TalkPacingFieldsProps {
  control: TalkControl;
  defaults?: StoryTalkDefaults;
  activeReplies?: boolean;
  emit: (next: TalkControl) => void;
}

const TalkPacingFields: React.FC<TalkPacingFieldsProps> = ({ control, defaults, activeReplies = false, emit }) => {
  const chainMax = control.chain === false ? null : control.chain?.max ?? 3;
  const policy = resolveTalkPolicy({ control, defaults, chainMax, activeReplies });
  const profile = control.profile ?? defaults?.profile;
  const shape = profile ? TALK_PROFILE_SHAPES[profile] : null;
  const budget = control.budget ?? {};
  const setBudget = (patch: Partial<NonNullable<TalkControl["budget"]>>) => {
    const next = { ...budget, ...patch };
    emit({ ...control, budget: next.voices === undefined && next.attempts === undefined ? undefined : next });
  };
  const toggle = <K extends "spotlight" | "address_player" | "reaction">(key: K, on: boolean, value: NonNullable<TalkControl[K]>, fromProfile: boolean) =>
    emit({ ...control, [key]: on ? value : fromProfile ? false : undefined });
  const spotlight = control.spotlight || null;
  const address = control.address_player || null;
  const afterTurns = address?.after_player_turns ?? policy.addressPlayer?.afterPlayerTurns ?? 2;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-1 text-xs st-muted">
          Pacing profile
          <HelpTooltip title={"A profile fills in the speech budget, whether the lead speaks first, a soft length for the lead, how many lead lines may run "
            + "in a row, spotlight, turning to the player and reaction beats. Anything set below wins over it. A profile never switches a feature off."} />
        </span>
        <select data-so="talk-profile" aria-label="Pacing profile" className="text_pole st-input" value={control.profile ?? ""}
          onChange={(event) => emit({ ...control, profile: TALK_PROFILES.find((name) => name === event.target.value) })}>
          <option value="">{defaults?.profile ? `story default (${defaults.profile})` : "none"}</option>
          {TALK_PROFILES.map((name) => <option key={name} value={name}>{PROFILE_LABELS[name]}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <NumberField label="Voices per player message" so="talk-budget-voices" value={budget.voices} min={1} max={TALK_BUDGET_CAP}
          placeholder={String(policy.budget?.voices ?? "")} onChange={(voices) => setBudget({ voices })} />
        <NumberField label="Generations at most" so="talk-budget-attempts" value={budget.attempts} min={1} max={TALK_ATTEMPTS_CAP}
          placeholder={String(policy.budget?.attempts ?? "")} onChange={(attempts) => setBudget({ attempts })} />
        <NumberField label="Lead reply length (words)" so="talk-lead-words" value={control.lead_words} min={TALK_LEAD_WORDS_MIN} max={TALK_LEAD_WORDS_MAX}
          placeholder={shape ? String(shape.leadWords) : "off"} onChange={(lead_words) => emit({ ...control, lead_words })} />
        <NumberField label="Lead lines in a row (at most)" so="talk-lead-run" value={control.lead_max_consecutive} min={1} max={TALK_LEAD_RUN_CAP}
          placeholder={shape ? String(shape.leadMax) : "off"} onChange={(lead_max_consecutive) => emit({ ...control, lead_max_consecutive })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input data-so="talk-spotlight" type="checkbox" checked={policy.spotlight !== null}
          onChange={(event) => toggle("spotlight", event.target.checked, spotlight ?? {}, Boolean(shape?.spotlight))} />
        A quiet member takes the next voice instead of adding one
      </label>
      {policy.spotlight ? (
        <div className="pl-6">
          <NumberField label="Quiet after (player turns)" so="talk-spotlight-quiet" value={spotlight?.quiet_after} min={1} max={TALK_TURNS_CAP}
            placeholder={String(policy.spotlight.quietAfter)} onChange={(quiet_after) => emit({ ...control, spotlight: { ...spotlight, quiet_after } })} />
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input data-so="talk-address" type="checkbox" checked={policy.addressPlayer !== null}
          onChange={(event) => toggle("address_player", event.target.checked, address ?? { after_player_turns: 2 }, Boolean(shape?.address))} />
        A member turns to the player (rides a voice already planned)
      </label>
      {policy.addressPlayer ? (
        <div className="flex flex-wrap gap-3 pl-6">
          <NumberField label="After (player turns)" so="talk-address-after" value={address?.after_player_turns} min={0} max={TALK_TURNS_CAP}
            placeholder={String(policy.addressPlayer.afterPlayerTurns)}
            onChange={(after) => emit({ ...control, address_player: { ...address, after_player_turns: after ?? afterTurns } })} />
          <NumberField label="Then wait (player turns)" so="talk-address-cooldown" value={address?.cooldown_player_turns} min={0} max={TALK_TURNS_CAP}
            placeholder={String(policy.addressPlayer.cooldown)}
            onChange={(cooldown) => emit({ ...control, address_player: { ...address, after_player_turns: afterTurns, cooldown_player_turns: cooldown } })} />
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input data-so="talk-reaction" type="checkbox" checked={policy.reaction !== null}
          onChange={(event) => toggle("reaction", event.target.checked, control.reaction || {}, Boolean(shape?.reaction))} />
        One reaction line after something consequential
      </label>
      <p data-so="talk-effective" className="text-xs st-muted">Effective: {describeTalkPolicy(policy)}.</p>
    </div>
  );
};

export default TalkPacingFields;
