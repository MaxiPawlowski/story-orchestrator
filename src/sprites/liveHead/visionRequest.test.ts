import { visionRigRequest } from "./visionRequest";
import { visualFixture } from "../visualFixtures";
test("vision request carries accepted bust lineage and an image-capable Sol target", () => {
  const source = visualFixture(), signal = new AbortController().signal;
  const request = visionRigRequest(source.bust, "synthetic-png", { id: "openai/gpt-6.1-sol", context: 32768, image: true }, signal);
  expect(request.images?.[0].data).toBe("synthetic-png"); expect(request.prompt).toContain(source.bust.sha256);
  expect(request.signal).toBe(signal); expect(request.harness).toBe("opencode");
  expect(() => visionRigRequest(source.bust, "png", { id: "openai/gpt-6.1-sol", context: 32768, image: false }, signal)).toThrow("vision model");
});
