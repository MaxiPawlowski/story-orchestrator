import type { InChatDiscovery } from "@runtime/inChatTypes";
import { IN_CHAT_COPY } from "@features/inChatCopy";
import { Button } from "@components/ui/Button";
import "./inchat.css";

export interface DiscoveryCardProps {
  item: InChatDiscovery;
  onOpen?: () => void;
}

export const DiscoveryCard = ({ item, onOpen }: DiscoveryCardProps) => {
  const eyebrow = item.first ? IN_CHAT_COPY.discoveryFirst : IN_CHAT_COPY.discoveryMore;
  return (
    <section data-so="discovery-card" data-page={item.page} data-first={item.first || undefined} className="so-ic-discovery" aria-label={`${eyebrow}: ${item.name}`}>
      <i className={`fa-solid ${item.page === "places" ? "fa-map-location-dot" : "fa-address-book"} so-ic-discovery-icon`} aria-hidden="true" />
      <div className="so-ic-discovery-body">
        <div className="so-ic-eyebrow">{eyebrow}</div>
        <div className="so-ic-discovery-name">{item.name}</div>
        {item.facts.length > 0 && (
          <ul className="so-ic-discovery-facts">
            {item.facts.map((fact) => <li key={fact}>{fact}</li>)}
          </ul>
        )}
      </div>
      {onOpen && (
        <Button size="sm" variant="ghost" icon="fa-book-open" data-so="discovery-open" aria-label={IN_CHAT_COPY.discoveryOpenLabel(item.name)} onClick={onOpen}>
          {IN_CHAT_COPY.discoveryOpen}
        </Button>
      )}
    </section>
  );
};

export default DiscoveryCard;
