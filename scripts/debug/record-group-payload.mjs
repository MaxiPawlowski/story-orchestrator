import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jest = join(root, "node_modules", "jest", "bin", "jest.js");
const result = spawnSync(process.execPath, [
  jest,
  "--rootDir", root,
  "--roots", join(root, "test", "support"),
  "--testMatch", "**/groupPayload.record.ts",
  "--runInBand",
  "--reporters", "default",
], { cwd: root, stdio: "inherit" });

if (result.status === 0) console.log("Wrote test/goldens/v2.7-03-group-payload.json. Review the diff, then run: npx jest src/runtime/groupPayloadInvariance.recorded.test.ts");
process.exit(result.status ?? 1);
