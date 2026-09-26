import { ROUTE_NOT_RECORDED, type ModelCallRow } from "@runtime/modelCalls";
import { MessageCitation } from "./MessageCitation";

const rowKey = (row: ModelCallRow, index: number) => `${row.at}-${row.role}-${index}`;

export const ModelCallsPanel = ({ calls }: { calls: readonly ModelCallRow[] }) => (
  <div data-so="model-calls" className="text-xs opacity-80">
    <div className="font-medium opacity-100">Calls</div>
    {calls.length === 0 ? (
      <div className="opacity-70">No model calls recorded in this chat yet.</div>
    ) : (
      calls.map((row, index) => (
        <div key={rowKey(row, index)} data-so="model-call" data-kind={row.kind} className="border-t border-solid border-white/10 mt-1 pt-1">
          <div className="opacity-100">
            {row.role} · <span data-so="model-call-route" className={row.route ? "" : "opacity-60"}>{row.route ?? ROUTE_NOT_RECORDED}</span> · <span data-so="model-call-result">{row.result}</span>
          </div>
          <div>
            {row.messageId !== null ? <><MessageCitation messageId={row.messageId} prefix="msg" /> · </> : null}
            {row.ms !== null ? `${row.ms} ms` : "time not recorded"}
            {row.tokens !== null ? ` · ${row.tokens} tokens` : ""}
          </div>
        </div>
      ))
    )}
  </div>
);

export default ModelCallsPanel;
