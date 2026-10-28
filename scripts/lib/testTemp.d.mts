export declare const RM_TEMP: { recursive: true; force: true; maxRetries: number; retryDelay: number };
export declare function removeTempDirs(): string[];
export declare function testTempDirSync(prefix: string, base?: string): string;
export declare function testTempDir(prefix: string, base?: string): Promise<string>;
