export type State = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED' | 'BLOCKED';
export interface Task {
  version: 1; taskId: string; correlationId: string; provider: 'openrouter' | 'claude';
  backend: 'api' | 'sdk' | 'cli'; model: string; instructions: string; workspaceRoot: string;
  allowedOperations: Array<'read_file' | 'write_file' | 'list_files'>;
  readablePaths: string[]; writablePaths: string[]; maxRuntimeMs: number; maxToolSteps: number;
  maxSpendUsd: number | null; expectedOutput: string; resultFormat: 'text' | 'json';
  networkPolicy: 'provider-only'; credentialMode?: 'api-key' | 'subscription';
}
export interface ProviderResult { output: string; usage: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null }; sessionId?: string; sources?: string[] }
export interface ProviderContext {
  task: Task; workspace: string; signal: AbortSignal; configPath: string;
  tools: { execute(name: string, args: unknown): Promise<string> };
  event(type: string, detail: unknown): void;
}
export class BridgeError extends Error {
  constructor(public code: string, message: string, public state: State = 'FAILED') { super(message); this.name = 'BridgeError'; }
}
