import {
  DEFAULT_PHRASE_BANS, PHRASE_BAN_KEY, PHRASE_BANS_MAX, bannedPhraseRate, normalizePhraseBans, phraseBanBody, phraseBanVerdict, phraseHits, readPhraseBanCapability,
} from "./phraseBans";

const loud = { apiType: "llamacpp", loud: true, storyChat: true };

describe("spike phraseBans: request plumbing for backtracking phrase bans in the patched llama.cpp", () => {
  it("normalizes the list: trims, folds whitespace, drops duplicates ignoring case, long and non-string entries, caps the count", () => {
    expect(normalizePhraseBans(["  a  testament to ", "A TESTAMENT TO", 3, "", "x".repeat(65), "palpable"])).toEqual(["a testament to", "palpable"]);
    expect(normalizePhraseBans(Array.from({ length: 300 }, (_, index) => `phrase ${index}`))).toHaveLength(PHRASE_BANS_MAX);
  });

  it("reads the server capability from /props: absent on stock llama.cpp, true or an object on the patched build", () => {
    expect(readPhraseBanCapability({ default_generation_settings: {} })).toEqual({ supported: false, max: 0 });
    expect(readPhraseBanCapability({ so_phrase_bans: true })).toEqual({ supported: true, max: PHRASE_BANS_MAX });
    expect(readPhraseBanCapability({ so_phrase_bans: { enabled: true, max: 50 } })).toEqual({ supported: true, max: 50 });
    expect(readPhraseBanCapability(null)).toEqual({ supported: false, max: 0 });
  });

  it("adds the key only on a loud story-chat llama.cpp request to a server that declares the capability", () => {
    const supported = { supported: true, max: 3 };
    expect(phraseBanBody(DEFAULT_PHRASE_BANS, supported, loud)).toEqual({ [PHRASE_BAN_KEY]: DEFAULT_PHRASE_BANS.slice(0, 3) });
    expect(phraseBanBody(DEFAULT_PHRASE_BANS, { supported: false, max: 0 }, loud)).toEqual({});
    expect(phraseBanBody(DEFAULT_PHRASE_BANS, supported, { ...loud, apiType: "koboldcpp" })).toEqual({});
    expect(phraseBanBody(DEFAULT_PHRASE_BANS, supported, { ...loud, loud: false })).toEqual({});
    expect(phraseBanBody(DEFAULT_PHRASE_BANS, supported, { ...loud, storyChat: false })).toEqual({});
    expect(phraseBanBody([], supported, loud)).toEqual({});
  });

  it("scores banned phrases on whole words, across line breaks, case-insensitively", () => {
    expect(phraseHits("A testament to grit. Shivers\ndown her spine. Unspokenly.", DEFAULT_PHRASE_BANS)).toEqual({ "shivers down": 1, "a testament to": 1 });
    expect(bannedPhraseRate(["Her voice was barely above a whisper.", "Fine."], DEFAULT_PHRASE_BANS)).toEqual({ replies: 2, words: 8, hits: 1, perThousandWords: 125, repliesWithHit: 1 });
  });

  it("verdict uses the predeclared floors: rate halved, decode at least 95% of base, rating not worse", () => {
    const control = { rate: { replies: 10, words: 1000, hits: 10, perThousandWords: 10, repliesWithHit: 5 }, decodeTokensPerSecond: 40, ratingScore: 0 };
    expect(phraseBanVerdict(control, { ...control, rate: { ...control.rate, perThousandWords: 4 }, decodeTokensPerSecond: 38.5 })).toEqual({ rate: true, decode: true, rating: true, ok: true });
    expect(phraseBanVerdict(control, { ...control, rate: { ...control.rate, perThousandWords: 6 }, decodeTokensPerSecond: 37 }).ok).toBe(false);
  });
});
