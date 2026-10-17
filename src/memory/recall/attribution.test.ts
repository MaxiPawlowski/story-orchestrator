import { message, PLAYER, ROSTER, spanIn } from "../../../test/support/recallKit";
import { attributeSpan } from "./attribution";
import type { RecallMessage } from "./live";

const attribute = (entry: RecallMessage, quote: string, candidateText = quote) =>
  attributeSpan({ source: spanIn([entry], entry.messageId, quote), messageText: entry.text, candidateText, roster: ROSTER, playerName: PLAYER });

describe("plan 43: quotation, not retrieval (VR8)", () => {
  it("renders a quoted span under the stored speaker, byte-equal to the source", () => {
    const entry = message(0, "Corvin", 'Corvin rubs his jaw. "The ferry leaves at the second bell."');
    const result = attribute(entry, "The ferry leaves at the second bell.");
    expect(result).toEqual({ ok: true, speaker: "Corvin", quote: "The ferry leaves at the second bell.", line: 'Corvin said: "The ferry leaves at the second bell."' });
    if (result.ok) expect(result.line.slice('Corvin said: "'.length, -1)).toBe(entry.text.slice(...spanIn([entry], 0, result.quote).span));
  });

  it("renders a player span as the player's name, and accepts a speaker tag naming the speaker", () => {
    expect(attribute(message(1, PLAYER, '"I never agreed to cross at night."'), "I never agreed to cross at night.")).toMatchObject({ ok: true, speaker: PLAYER });
    expect(attribute(message(2, "Hollis", '"Keep moving," Hollis says.'), "Keep moving,")).toMatchObject({ ok: true, speaker: "Hollis" });
  });

  it("an unquoted message with no other speaker tag and no narration is the speaker's own words", () => {
    expect(attribute(message(3, "Tamsin", "*Tamsin rolls her eyes* Nobody asked you."), "Nobody asked you.")).toMatchObject({ ok: true, speaker: "Tamsin" });
  });

  it("rejects narration, inside or outside quotes, never re-attributing it", () => {
    expect(attribute(message(4, "Hollis", 'Hollis counts the coins twice. "We are short."'), "Hollis counts the coins twice.")).toEqual({ ok: false, reason: "narration" });
    expect(attribute(message(5, "Tamsin", "*Tamsin rolls her eyes* Nobody asked you."), "Tamsin rolls her eyes")).toEqual({ ok: false, reason: "narration" });
    expect(attribute(message(6, "Tamsin", "Tamsin shrugs and walks off."), "Tamsin shrugs and walks off.")).toEqual({ ok: false, reason: "narration" });
  });

  it("rejects multi-speaker messages and quotes tagged to another roster member", () => {
    const multi = message(7, "Corvin", '"Hold the rope," Tamsin shouted. "I have it," Corvin answered.');
    expect(attribute(multi, "Hold the rope,")).toEqual({ ok: false, reason: "multi-speaker" });
    expect(attribute(multi, "I have it,")).toEqual({ ok: false, reason: "multi-speaker" });
    expect(attribute(message(8, "Corvin", '"Fine," Tamsin said, and Corvin shrugged.'), "Fine,")).toEqual({ ok: false, reason: "tagged to another speaker" });
    expect(attribute(message(9, "Corvin", 'Tamsin says, "Go on ahead." "Then I will," he answers.'), "Then I will,")).toEqual({ ok: false, reason: "tagged to another speaker" });
    expect(attribute(message(10, "Corvin", "Tamsin said we leave at dawn."), "we leave at dawn.")).toEqual({ ok: false, reason: "tagged to another speaker" });
  });

  it("rejects an altered quote, a span crossing quote marks, an empty span and a speaker outside the roster", () => {
    const entry = message(11, "Corvin", 'Corvin nods. "The ferry leaves at the second bell."');
    expect(attribute(entry, "The ferry leaves at the second bell.", "The ferry leaves at the third bell.")).toEqual({ ok: false, reason: "altered quote" });
    expect(attribute(entry, 'nods. "The ferry')).toEqual({ ok: false, reason: "spans quote marks" });
    expect(attributeSpan({ source: { ...spanIn([entry], 11, "The"), span: [3, 3] }, messageText: entry.text, candidateText: "", roster: ROSTER, playerName: PLAYER })).toEqual({ ok: false, reason: "empty span" });
    expect(attribute(message(12, "Narrator", 'The wind howls. "Turn back," a voice calls.'), "Turn back,")).toEqual({ ok: false, reason: "speaker not in roster" });
  });
});
