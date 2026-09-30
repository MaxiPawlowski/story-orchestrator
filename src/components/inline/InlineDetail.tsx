import type { InlineAction, InlineItem } from "@runtime/inlineTimeline";
import "./inline.css";

export interface InlineActions {
  run: (action: InlineAction) => void;
  inspect: (messageId: number) => void;
}

const ACTION_LABEL = (action: InlineAction): string => {
  if (action.kind === "pin-fact") return action.pinned ? "Pin" : "Unpin";
  if (action.kind === "lock-fact") return action.locked ? "Lock" : "Unlock";
  if (action.kind === "exclude-fact") return "Exclude";
  if (action.kind === "curator-op") return action.decision === "accepted" ? "Accept" : "Decline";
  return `Keep: ${action.label}`;
};

const STATE_ICON: Record<InlineItem["state"], string> = {
  live: "fa-solid fa-spinner",
  pending: "fa-regular fa-clock",
  applied: "fa-solid fa-check",
  refused: "fa-solid fa-ban",
};

export interface InlineDetailProps {
  items: InlineItem[];
  showDetail: boolean;
  showActions: boolean;
  actions?: InlineActions;
}

export const InlineDetail = ({ items, showDetail, showActions, actions }: InlineDetailProps) => (
  <ul data-so="inline-detail" className="so-inline-list">
    {items.map((item) => (
      <li key={item.id} data-so="inline-item" data-state={item.state} data-level={item.level} className="so-inline-row">
        <span className="so-inline-line">
          <i className={`${STATE_ICON[item.state]} so-inline-state`} aria-label={item.state} role="img" />
          <span className="so-inline-text">{item.text}</span>
        </span>
        {showDetail && item.detail && <span data-so="inline-item-detail" className="so-inline-more">{item.detail}</span>}
        {showActions && actions && item.actions?.length ? (
          <span className="so-inline-actions">
            {item.actions.map((action, index) => (
              <button key={index} type="button" data-so="inline-action" data-kind={action.kind} className="menu_button" onClick={() => actions.run(action)}>
                {ACTION_LABEL(action)}
              </button>
            ))}
          </span>
        ) : null}
      </li>
    ))}
  </ul>
);

export default InlineDetail;
