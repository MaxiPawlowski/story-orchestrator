import { scriptModule } from "./modules";

export function isHostGenerating(): boolean {
  return Boolean(scriptModule.isGenerating());
}
