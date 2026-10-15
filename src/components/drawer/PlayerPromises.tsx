import type { PlayerPromise } from "@memory/promises/types";
import { PROMISE_COPY } from "@runtime/narrative";

export interface PlayerPromisesProps {
  promises: readonly PlayerPromise[];
}

export const PlayerPromises = ({ promises }: PlayerPromisesProps) => (
  <div id="so-player-promises" className="flex flex-col gap-1">
    <div className="font-medium">{PROMISE_COPY.heading}</div>
    {promises.map((promise) => (
      <div key={promise.id} data-so="player-promise" className="text-sm">
        <div className="opacity-80">{PROMISE_COPY.to(promise.promisee)}</div>
        <blockquote className="m-0 pl-2 border-l-2 whitespace-pre-wrap">&ldquo;{promise.quote}&rdquo;</blockquote>
        {(promise.deadline || promise.questTitle) && (
          <div className="text-xs opacity-70">
            {[promise.deadline ? PROMISE_COPY.by(promise.deadline) : "", promise.questTitle ? PROMISE_COPY.quest(promise.questTitle) : ""].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    ))}
  </div>
);

export default PlayerPromises;
