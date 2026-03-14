import { getContext, type StoryOrchestratorHostContext } from "./context";

type SlashCommandHostResult = Awaited<ReturnType<StoryOrchestratorHostContext["executeSlashCommandsWithOptions"]>>;

async function runSlash(cmd: string, silent = true) {
  const { executeSlashCommandsWithOptions } = getContext();
  const toastrData = {
    success: window?.toastr?.success,
    info: window?.toastr?.info,
  };

  if (silent && window?.toastr) {
    window.toastr.success = () => void 0;
    window.toastr.info = () => void 0;
  }

  try {
    const result: SlashCommandHostResult = await executeSlashCommandsWithOptions(cmd, {
      handleParserErrors: true,
      handleExecutionErrors: true,
    });
    if (result?.isError) {
      console.warn("[Story A/N slash] error:", cmd, result?.errorMessage);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Story A/N slash] threw:", cmd, err);
    return false;
  } finally {
    if (silent && window?.toastr) {
      if (toastrData.success) window.toastr.success = toastrData.success;
      if (toastrData.info) window.toastr.info = toastrData.info;
    }
  }
}

export async function executeSlashCommands(
  commands: Iterable<string> | string,
  opts?: { silent?: boolean; delayMs?: number },
) {
  const silent = opts?.silent ?? true;
  const delayMs = Math.max(0, opts?.delayMs ?? 0);
  const iterable = typeof commands === "string" ? [commands] : Array.from(commands ?? []);
  let allOk = true;

  try {
    for (let index = 0; index < iterable.length; index += 1) {
      const command = typeof iterable[index] === "string" ? iterable[index] : "";
      const ok = await runSlash(command, silent);
      if (!ok) allOk = false;
      if (delayMs > 0 && index < iterable.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } catch (error) {
    console.warn("[Story Slash] failed to execute commands", error);
  }

  return allOk;
}
