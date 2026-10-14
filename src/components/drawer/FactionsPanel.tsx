import type { FactionAuthorView } from "@runtime/factionSnapshot";

export const FactionsPanel = ({ factions }: { factions: FactionAuthorView }) => (
  <section id="so-factions" aria-label="Factions" className="mt-3 text-xs">
    <div className="font-medium mb-1">Factions</div>
    {factions.rows.map((row) => (
      <div key={row.id} data-so="faction-row" data-faction={row.id} className="mb-2">
        <div className="font-medium">
          {row.name}: <span data-so="faction-value">{row.value}</span> <span className="opacity-70">({row.range[0]} to {row.range[1]})</span> · {row.band}
          {row.visible ? null : <span data-so="faction-hidden" className="opacity-70"> · hidden from the player</span>}
        </div>
        {row.members.length > 0 && <div data-so="faction-members" className="opacity-70">Members: {row.members.join(", ")}</div>}
        {row.moves.length > 0 && (
          <ul className="list-none p-0 m-0">
            {row.moves.map((move) => (
              <li key={move.id} data-so="faction-move" data-move={move.id} data-fired={move.boundary === null ? undefined : "true"}>
                {move.id} ({move.add > 0 ? `+${move.add}` : move.add}, heard by {move.heardBy === "faction" ? "the whole faction" : "members present"})
                {move.boundary === null
                  ? <span className="opacity-70"> · not yet</span>
                  : <span> · fired at turn {move.boundary}{move.messageId === null ? "" : `, message ${move.messageId}`}</span>}
              </li>
            ))}
          </ul>
        )}
        {row.ledger.length > 0 && <div data-so="faction-ledger" className="opacity-70">From memory: {row.ledger.join("; ")}</div>}
      </div>
    ))}
    {factions.scopeOverflow.length > 0 && (
      <div data-so="faction-overflow" className="opacity-70">Not read this turn: {factions.scopeOverflow.join(", ")}</div>
    )}
  </section>
);
