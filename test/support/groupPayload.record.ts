import { writeFileSync } from "node:fs";
import { GROUP_PAYLOAD_GOLDEN, groupPayloadSteps } from "./groupPayloadTurn";

describe("re-record test/goldens/v2.7-03-group-payload.json", () => {
  it("writes the scripted group turn's blocks", async () => {
    writeFileSync(GROUP_PAYLOAD_GOLDEN, `${JSON.stringify(await groupPayloadSteps(), null, 2)}\n`);
  });
});
