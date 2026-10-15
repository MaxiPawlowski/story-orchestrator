import React from "react";
import type { PublicLabel, RelationshipDecl, RosterMember, SecretLabel } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { setRelationshipLabels } from "../gameMutations";
import GateBuilder from "./GateBuilder";
import { OptionalGate, TextField } from "./GameFields";

const HELP = "Words the player can see on a character's People page. A public label is how this character visibly treats the other side; the last row whose gate holds "
  + "is shown. A secret label stays hidden until its gate holds once, then the player has learned it for good. Players never see the feeling's number.";

const toHold = (text: string): number | undefined => (Number.isInteger(Number(text)) && Number(text) >= 1 ? Number(text) : undefined);

const RelationshipRow = ({ member, relationship }: { member: RosterMember; relationship: RelationshipDecl }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const shown = relationship.public ?? [];
  const secret = relationship.secret ?? [];
  const name = `${member.id} toward ${relationship.toward}`;
  const save = (next: { public?: PublicLabel[]; secret?: SecretLabel[] }) =>
    mutate((current) => setRelationshipLabels(current, member.id, relationship.toward, { public: next.public ?? shown, secret: next.secret ?? secret }));
  const patchPublic = (at: number, patch: Partial<PublicLabel>) => save({ public: shown.map((row, index) => (index === at ? { ...row, ...patch } : row)) });
  const patchSecret = (at: number, patch: Partial<SecretLabel>) => save({ secret: secret.map((row, index) => (index === at ? { ...row, ...patch } : row)) });
  return (
    <div data-so="relationship-labels-row" data-member={member.id} data-toward={relationship.toward} className="st-subpanel flex flex-col gap-2 p-2">
      <span className="st-pill self-start px-2 py-0.5 text-[11px]">{name}</span>
      {shown.map((row, at) => (
        <div key={`p${at}`} data-so="relationship-public-label" className="flex flex-col gap-1">
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={`${name} public label ${at + 1}`} value={row.label} onChange={(label) => patchPublic(at, { label })} />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" aria-label={`${name} public label ${at + 1} follows the feeling`} checked={row.follows_feeling === true}
                onChange={(event) => patchPublic(at, { follows_feeling: event.target.checked ? true : undefined, hold: event.target.checked ? row.hold : undefined })} />
              Follows the feeling
            </label>
            {row.follows_feeling && (
              <TextField label={`${name} public label ${at + 1} hold`} value={row.hold ? String(row.hold) : ""} onChange={(hold) => patchPublic(at, { hold: toHold(hold) })} />
            )}
            <button type="button" className="st-button danger" aria-label={`Remove ${name} public label ${at + 1}`}
              onClick={() => save({ public: shown.filter((_, index) => index !== at) })}>×</button>
          </div>
          <OptionalGate label={`${name} public label ${at + 1} shown when`} gate={row.when} qualities={qualities} onChange={(when) => patchPublic(at, { when })} />
        </div>
      ))}
      {secret.map((row, at) => (
        <div key={`s${at}`} data-so="relationship-secret-label" className="flex flex-col gap-1">
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={`${name} secret ${at + 1} id`} value={row.id} onChange={(id) => patchSecret(at, { id: id.trim() })} />
            <TextField label={`${name} secret ${at + 1} label`} value={row.label} onChange={(label) => patchSecret(at, { label })} />
            <button type="button" className="st-button danger" aria-label={`Remove ${name} secret ${at + 1}`}
              onClick={() => save({ secret: secret.filter((_, index) => index !== at) })}>×</button>
          </div>
          <span className="text-xs st-muted">Revealed when</span>
          <GateBuilder gate={row.revealed_when} qualities={qualities} onChange={(revealed_when) => patchSecret(at, { revealed_when })} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="st-button secondary" onClick={() => save({ public: [...shown, { label: "new label" }] })}>+ Public label</button>
        <button type="button" className="st-button secondary" onClick={() => save({ secret: [...secret, { id: `secret-${secret.length + 1}`, label: "secret label", revealed_when: { all: [] } }] })}>
          + Secret label
        </button>
      </div>
    </div>
  );
};

const RelationshipLabelsEditor: React.FC = () => {
  const roster = useDraftStore((state) => state.draft.roster);
  const rows = roster.flatMap((member) => (member.relationships ?? []).map((relationship) => ({ member, relationship })));
  if (!rows.length) return null;
  return (
    <div data-so="relationship-labels-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Relationship labels<HelpTooltip title={HELP} /></div>
      {rows.map(({ member, relationship }) => <RelationshipRow key={`${member.id}:${relationship.toward}`} member={member} relationship={relationship} />)}
    </div>
  );
};

export default RelationshipLabelsEditor;
