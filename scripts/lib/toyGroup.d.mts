export declare const TOY_GROUP_NAME: string;
export declare const TOY_GROUP_MEMBERS: string[];
export declare function toyGroupCreateBody(): { name: string; members: string[]; avatar_url: string; allow_self_responses: boolean; activation_strategy: number; generation_mode: number; disabled_members: string[]; fav: boolean };
export declare function toyGroupProblems(groups: Array<{ name?: unknown; members?: unknown[] }> | null | undefined, avatars: string[] | null | undefined): string[];
export declare function shellArg(value: unknown): string;
