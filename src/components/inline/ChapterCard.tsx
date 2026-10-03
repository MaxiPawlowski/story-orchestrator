import type { ChapterCard as ChapterCardView } from "@runtime/chapterCards";
import { briefingParagraphs, type BriefingView } from "@engine/index";
import { PRESENCE_TEXT } from "@features/presenceCopy";

export interface ChapterCardProps {
  card: ChapterCardView;
}

const eyebrow = (card: ChapterCardView) => {
  if (card.interlude) return PRESENCE_TEXT.interlude;
  if (card.final) return PRESENCE_TEXT.finalChapter;
  return card.number === null ? PRESENCE_TEXT.chapter : `${PRESENCE_TEXT.chapter} ${card.number}`;
};

const CardBriefing = ({ view }: { view: BriefingView }) => (
  <div data-so="chapter-card-briefing" className="so-chapter-card-briefing">
    {view.tone && <p data-so="briefing-tone" className="so-chapter-card-briefing-tone">{view.tone}</p>}
    {view.sections.map((section, index) => (
      <div key={index} data-so="briefing-section">
        <div className="so-chapter-card-briefing-heading">{section.heading}</div>
        {briefingParagraphs(section.text).map((paragraph, at) => <p key={at}>{paragraph}</p>)}
      </div>
    ))}
  </div>
);

export const ChapterCard = ({ card }: ChapterCardProps) => (
  <section data-so="chapter-card" data-chapter-kind={card.interlude ? "interlude" : "chapter"} className="so-chapter-card" aria-label={`${eyebrow(card)}: ${card.title}`}>
    <div className="so-chapter-card-eyebrow">{eyebrow(card)}</div>
    <div className="so-chapter-card-title">{card.title}</div>
    {card.briefing && <CardBriefing view={card.briefing} />}
  </section>
);

export default ChapterCard;
