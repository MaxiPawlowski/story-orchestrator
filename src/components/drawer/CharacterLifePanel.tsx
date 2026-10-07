import type { LifeAuthorView } from "@runtime/lifeSnapshot";

const towardLabel = (toward: string, names: Record<string, string>) => (toward === "player" ? "the player" : names[toward] ?? toward);

export const CharacterLifePanel = ({ life }: { life: LifeAuthorView }) => {
  const names = Object.fromEntries(life.rows.map((row) => [row.id, row.name]));
  const waiting = life.proposals.filter((proposal) => proposal.status === "proposed");
  return (
    <section id="so-character-life" aria-label="Character life" className="mt-3 text-xs">
      <div className="font-medium mb-1">Character life</div>
      {life.rows.map((row) => (
        <div key={row.id} data-so="life-member" data-member={row.id} className="mb-2">
          <div className="font-medium">
            {row.name}
            {row.mood ? <span className="opacity-70"> · {row.mood}</span> : null}
            {row.away ? <span data-so="life-away" className="opacity-70"> · away at {row.away}</span> : null}
          </div>
          {row.relationships.length > 0 && (
            <ul className="list-none p-0 m-0">
              {row.relationships.map((axis) => (
                <li key={axis.key} data-so="life-axis" data-key={axis.key}>
                  {axis.axis} toward {towardLabel(axis.toward, names)}: {axis.value} <span className="opacity-70">({axis.range[0]} to {axis.range[1]})</span>
                </li>
              ))}
            </ul>
          )}
          {row.agendas.map((agenda) => (
            <div key={agenda.id} data-so="life-agenda" data-agenda={agenda.id}>
              {agenda.goal}: {agenda.done} of {agenda.of}
              {agenda.next ? <span className="opacity-70"> · next: {agenda.next}</span> : null}
            </div>
          ))}
        </div>
      ))}
      {life.scopeOverflow.length > 0 && (
        <div data-so="life-overflow" className="opacity-70">Not read this turn: {life.scopeOverflow.join(", ")}</div>
      )}
      {waiting.length > 0 && (
        <div data-so="life-proposals">
          <div className="font-medium">Meanwhile, proposed</div>
          {waiting.map((proposal) => (
            <div key={proposal.id} data-so="life-proposal">{names[proposal.memberId] ?? proposal.memberId}: {proposal.text}</div>
          ))}
        </div>
      )}
    </section>
  );
};
