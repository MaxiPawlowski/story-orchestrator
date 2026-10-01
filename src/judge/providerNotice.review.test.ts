import { JUDGE_PROVIDER_IDS, JUDGE_PROVIDERS } from "./providers";

describe("CR-J3 (user decision 2026-10-01): no gate, so the notice states the consent and the way out", () => {
  it.each(JUDGE_PROVIDER_IDS)("%s: a configured key or server means data is sent, and it names the switch that stops it", (provider) => {
    const notice = JUDGE_PROVIDERS[provider].notice;
    expect(notice).toMatch(/configured/i);
    expect(notice).toMatch(/\b(sends|go)\b/);
    expect(notice).toContain("\"Use the judgment model\"");
  });

  it("TypeSafe says the key is the consent", () => {
    expect(JUDGE_PROVIDERS.typesafe.notice).toMatch(/key/i);
    expect(JUDGE_PROVIDERS.typesafe.notice).toMatch(/consent/i);
  });
});
