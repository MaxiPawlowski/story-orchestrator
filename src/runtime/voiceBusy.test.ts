import { voiceChainPending, watchVoiceChain } from "./voiceBusy";

test("renders see a chained voice as busy until the runtime that reported it stops", () => {
  let chained = true;
  const stop = watchVoiceChain(() => chained);
  expect(voiceChainPending()).toBe(true);
  chained = false;
  expect(voiceChainPending()).toBe(false);
  chained = true;
  const later = watchVoiceChain(() => false);
  stop();
  expect(voiceChainPending()).toBe(false);
  later();
  expect(voiceChainPending()).toBe(false);
});
