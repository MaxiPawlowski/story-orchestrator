import type { EffectTarget, RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import { MessageCitation } from "../MessageCitation";

const EPISTEMIC_TAG_LABELS: Record<string, string> = { knows: "knows", suspects: "suspects", believes: "believes (false)", unaware: "unaware", hiding: "hiding" };

const EFFECT_STATUS_COPY: Record<string, string> = {
  pending: "was being written when this chat last saved",
  applied: "applied",
  failed: "could not be applied",
  reverted: "put back",
  "revert-failed": "could not be put back — try again",
  "externally-changed": "someone else changed it after this story did, so it was left alone",
};

const describeEffectTarget = (target: EffectTarget): string => {
  if (target.kind === "cast") return `cast: ${target.member}`;
  if (target.kind === "wi") return `lore: ${target.book} · ${target.entry}`;
  if (target.kind === "an") return "author's note";
  if (target.kind === "background") return "background";
  if (target.kind === "extension") return target.name;
  return `preset: ${target.name} (${target.api})`;
};

// What this chat changed in state it SHARES with other chats — a group's cast, a
// lorebook, the Author's Note — and whether it could be put back. Author-only: it is the machinery a
// player never needs to know about, and it names entries and upcoming staging.
export const EffectLedgerPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const rows = [...(snapshot.effects?.ledger ?? [])].reverse();
  if (!rows.length) return null;
  return (
    <details data-so="effect-ledger" className="border-t border-solid border-white/10 mt-1 pt-1">
      <summary className="opacity-100 cursor-pointer">Host changes this chat made ({rows.length})</summary>
      {rows.map((row) => (
        <div key={row.id} data-so="effect-row" data-status={row.status} className="opacity-80 mt-1">
          <div>{describeEffectTarget(row.target)} <span className="opacity-60">· {row.effect} · {EFFECT_STATUS_COPY[row.status] ?? row.status}</span></div>
          {row.reason && <div className="so-warning-text">{row.reason}</div>}
          <div className="opacity-50">boundary {row.boundary} · <MessageCitation messageId={row.messageId} /></div>
        </div>
      ))}
    </details>
  );
};

// Lines the judgment model found no support for, kept here instead of in memory. The
// author can store one anyway; it goes in at its judged confidence.
export const NotStoredPanel = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const drops = snapshot.memory.verifyDrops ?? [];
  if (!drops.length) return null;
  return (
    <details data-so="memory-not-stored" className="border-t border-solid border-white/10 mt-1 pt-1">
      <summary className="opacity-100 cursor-pointer">Not stored — no support in the chat ({drops.length})</summary>
      {drops.map((drop) => (
        <div key={drop.entry.id} className="flex gap-2 opacity-80 flex-wrap mt-1">
          <span title={drop.entry.evidence}>{drop.entry.text}</span>
          <span className="opacity-60">support {drop.p.toFixed(2)}{drop.model ? ` · ${drop.model}` : ""}</span>
          <button className="menu_button" data-so="memory-store-anyway" onClick={() => void manager.storeDroppedMemory(drop.entry.id)}>Store anyway</button>
        </div>
      ))}
    </details>
  );
};

export const EpistemicPanel = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const entries = (snapshot.memory.epistemic ?? []).filter((entry) => !entry.supersededBy);
  if (!entries.length) return null;
  const subjects = Array.from(new Set(entries.map((entry) => entry.subject)));
  return (
    <div className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="opacity-100">Epistemic map ({entries.length})</div>
      {subjects.map((subject) => (
        <div key={subject} className="mt-1">
          <div className="opacity-100">{subject}</div>
          {entries.filter((entry) => entry.subject === subject).map((entry) => (
            <div key={entry.id} className="flex gap-2 opacity-80 flex-wrap">
              <span>[{EPISTEMIC_TAG_LABELS[entry.tag] ?? entry.tag}{entry.hiddenFrom ? ` from ${entry.hiddenFrom}` : ""}] {entry.content}{entry.pinned ? " 📌" : ""}</span>
              <button className="menu_button" onClick={() => void manager.setEpistemicPinned(entry.id, !entry.pinned)}>{entry.pinned ? "Unpin" : "Pin"}</button>
              <button className="menu_button" onClick={() => void manager.removeEpistemicEntry(entry.id)}>Remove</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const LedgerPanel = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const stored = snapshot.memory.ledger ?? [];
  const rows = snapshot.ledger;
  if (!rows.length) return null;
  const entities = Array.from(new Set(rows.map((row) => row.entity)));
  // Rows are version lists: the row shows the newest version, so Remove addresses that one.
  const idFor = (entity: string, field: string) => stored.filter((entry) => entry.entity.toLowerCase() === entity.toLowerCase() && entry.field.toLowerCase() === field.toLowerCase()).at(-1)?.id;
  return (
    <div className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="opacity-100">State ledger ({rows.length})</div>
      {entities.map((entity) => (
        <div key={entity} className="mt-1">
          <div className="opacity-100">{entity}</div>
          {rows.filter((row) => row.entity === entity).map((row) => {
            const id = row.bound ? undefined : idFor(row.entity, row.field);
            return (
              <div key={`${entity}-${row.field}`} className="flex gap-2 opacity-80 flex-wrap">
                <span>{row.field}={row.value}{row.bound ? " 🔒" : ""}</span>
                {row.bound && <span className="opacity-60" title="mirrored read-only from a blackboard quality">blackboard</span>}
                {id && <button className="menu_button" onClick={() => void manager.removeLedgerEntry(id)}>Remove</button>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export const ArcCanonPanel = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const arcs = snapshot.memory.arcs ?? [];
  const openArcs = arcs.filter((arc) => arc.status === "open");
  const resolvedArcs = arcs.filter((arc) => arc.status === "resolved");
  const canon = snapshot.memory.canon;
  if (!arcs.length && !canon) return null;
  return (
    <div className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="opacity-100">Arcs (open {openArcs.length} · resolved {resolvedArcs.length})</div>
      {arcs.map((arc) => (
        <div key={arc.id} className="mt-1">
          <div className={arc.status === "resolved" ? "opacity-60" : ""}>{arc.status === "resolved" ? "✓ " : "◦ "}{arc.text}{arc.pinned ? " 📌" : ""}</div>
          {arc.summary && <div className="opacity-70 italic">{arc.summary}</div>}
          <div className="flex gap-2 opacity-80 flex-wrap">
            <button className="menu_button" onClick={() => void manager.setArcPinned(arc.id, !arc.pinned)}>{arc.pinned ? "Unpin" : "Pin"}</button>
            <button className="menu_button" onClick={() => void manager.removeArc(arc.id)}>Remove</button>
          </div>
        </div>
      ))}
      {canon && (
        <div className="border-t border-solid border-white/10 mt-1 pt-1">
          <div className="opacity-100">Canon</div>
          <div className="opacity-80 whitespace-pre-wrap">{canon.text}</div>
        </div>
      )}
    </div>
  );
};

const AuthorMemoryPanels = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => (
  <>
    <NotStoredPanel snapshot={snapshot} manager={manager} />
    <ArcCanonPanel snapshot={snapshot} manager={manager} />
    <EpistemicPanel snapshot={snapshot} manager={manager} />
    <LedgerPanel snapshot={snapshot} manager={manager} />
    <EffectLedgerPanel snapshot={snapshot} />
  </>
);

export default AuthorMemoryPanels;
