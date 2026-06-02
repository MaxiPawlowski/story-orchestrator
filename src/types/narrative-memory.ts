export interface Consequence {
  id: string;
  text: string;
  weight: number;
  tags: string[];
  sourceCheckpointId: string;
  createdAtTurn: number;
}

export interface NarrativeSeed {
  id: string;
  text: string;
  kind: "foreshadowing" | "thread" | "hook";
  resolved: boolean;
  sourceCheckpointId: string;
  createdAtTurn: number;
}

export interface RoleState {
  role: string;
  summary: string;
  lastUpdatedTurn: number;
}

export interface SceneMemoryEntry {
  text: string;
  checkpointId: string;
  turn: number;
}

export interface ForegoneTransition {
  transitionId: string;
  fromCheckpointId: string;
  reason: string;
  turn: number;
}

export interface NarrativeMemoryState {
  consequences: Consequence[];
  seeds: NarrativeSeed[];
  roleStates: Record<string, RoleState>;
  sceneMemory: SceneMemoryEntry[];
  foregoneTransitions: ForegoneTransition[];
}
