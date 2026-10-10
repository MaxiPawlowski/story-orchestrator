import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { sceneFieldsInConflict } from "@memory/index";
import { clearStoryExtensionPrompt, getPlayerName, judgeLlamaComplete, judgeLocalTransport, judgeStatus, judgeTransport, readInjectedPromptBlocks, setStoryExtensionPrompt } from "@services/STAPI";
import type { JudgeTransport } from "@judge/index";
import { SceneCoordinator } from "../coordinators/sceneCoordinator";
import { JudgeRuntime } from "../judge";
import { quietVectorsFor } from "../coordinatorHosts";
import { VECTOR_YIELD_MAX_MS } from "../vectorYield";
import { createTypedJudge } from "../typedRead";
import { getGlobalSettings } from "../settingsStore";
import { runtimeManager } from "../runtimeManager";
import type { Disposers, LiveParts, WindowAccess } from "./types";

const llamaLogprob: JudgeTransport = async (request, options) => (await import("@judge/llamaLogprob")).createLlamaLogprobTransport(judgeLlamaComplete)(request, options);

export const startJudge = (live: LiveParts, { chatLastId }: WindowAccess) => {
  const judgeRuntime = new JudgeRuntime({
    getSettings: () => getGlobalSettings().judge,
    transport: judgeTransport,
    providers: { "llama-logprob": llamaLogprob, "systemone-local": judgeLocalTransport },
    status: judgeStatus,
    record: (record) => runtimeManager.recordJudgeCall(record),
    context: () => ({ boundary: runtimeManager.getEngineState()?.boundary ?? 0, messageId: chatLastId() }),
    ownership: runtimeManager.getOwnership(),
  });
  quietVectorsFor(() => judgeRuntime.whenIdle(VECTOR_YIELD_MAX_MS));
  live.typedJudge = createTypedJudge(() => judgeRuntime);
  runtimeManager.attachJudge(judgeRuntime);
  return judgeRuntime;
};

export const startScene = (live: LiveParts, disposers: Disposers, judgeRuntime: JudgeRuntime, { chatLastId, recentWindow }: WindowAccess) => {
  const tracker = INJECTION_REGISTRY.sceneTracker;
  const scene = new SceneCoordinator({
    judge: () => judgeRuntime,
    getStory: () => runtimeManager.getStory(),
    getState: () => runtimeManager.getEngineState(),
    getWindow: recentWindow,
    getPlayerName,
    getLastMessageId: chatLastId,
    getScene: () => runtimeManager.getSceneRead(),
    ownership: runtimeManager.getOwnership(),
    setScene: (record) => runtimeManager.recordSceneRead(record),
    inject: (text) => (text ? setStoryExtensionPrompt(tracker.key, text, tracker.depth) : clearStoryExtensionPrompt(tracker.key)),
    applied: () => readInjectedPromptBlocks().find((block) => block.key === tracker.key)?.value ?? null,
    withheldFields: () => sceneFieldsInConflict(runtimeManager.getCachedSnapshot().memory.conflicts),
    journal: (summary, note) => runtimeManager.noteRecap(summary, note),
  });
  live.scene = scene;
  runtimeManager.attachScene(scene);
  disposers.push(() => runtimeManager.attachScene(null));
  disposers.push(runtimeManager.subscribe(() => scene.sync()));
};
