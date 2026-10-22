import { readFile } from 'node:fs/promises';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { sdkSetup } from './providers/claude.js';
import type { Task } from './types.js';

interface RunnerConfig {
  task: Task;
  workspace: string;
  eventPath?: string;
  deadline?: number;
}

function emit(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function validConfig(value: unknown): value is RunnerConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<RunnerConfig>;
  const task = config.task;
  return Boolean(
    task && task.provider === 'claude' && task.backend === 'sdk' &&
    typeof task.taskId === 'string' && typeof task.correlationId === 'string' &&
    typeof task.instructions === 'string' && task.instructions.trim() &&
    typeof task.model === 'string' && task.model.trim() &&
    typeof config.workspace === 'string' && pathIsAbsolute(config.workspace),
  );
}

function pathIsAbsolute(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\\/.test(value);
}

function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function asCost(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeProgress(message: SDKMessage): Record<string, unknown> | undefined {
  if (message.type === 'system' && message.subtype === 'init') {
    return { type: 'cpb_event', event: 'session', sessionId: message.session_id ?? null };
  }
  if (message.type === 'rate_limit_event') {
    return { type: 'cpb_event', event: 'rate_limit', observed: true };
  }
  if (message.type === 'system' && message.subtype === 'permission_denied') {
    return { type: 'cpb_event', event: 'permission_denied', observed: true };
  }
  if (message.type === 'result') {
    return {
      type: 'cpb_event', event: 'result', subtype: message.subtype,
      isError: message.is_error === true,
      turns: asCount(message.num_turns),
      costUsd: asCost(message.total_cost_usd),
    };
  }
  return undefined;
}

function hasFailedToolResult(message: SDKMessage): boolean {
  if (message.type !== 'user') return false;
  const envelope = message.message as unknown as { content?: unknown };
  if (!Array.isArray(envelope.content)) return false;
  return envelope.content.some((block: unknown) => {
    if (!block || typeof block !== 'object') return false;
    const item = block as Record<string, unknown>;
    return (item.type === 'tool_result' || item.type === 'mcp_tool_result') && item.is_error === true;
  });
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) throw new Error('invalid_config');
  const raw = await readFile(configPath, 'utf8');
  const config: unknown = JSON.parse(raw);
  if (!validConfig(config)) throw new Error('invalid_config');
  const { task, workspace } = config;
  if (config.deadline !== undefined && Date.now() >= config.deadline) throw new Error('timeout');

  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGTERM', interrupt);
  process.once('SIGINT', interrupt);
  const options = sdkSetup(task, workspace, configPath);
  options.abortController = controller;
  let final: Record<string, unknown> | undefined;
  let toolFailureSeen = false;

  try {
    const prompt = task.instructions;
    for await (const message of query({ prompt, options })) {
      if(message.type==='system' && message.subtype==='init' && message.tools.some(t=>!['mcp__cpb__read_file','mcp__cpb__write_file','mcp__cpb__list_files','EndConversation'].includes(t))) throw new Error('unexpected_tool');
      if (hasFailedToolResult(message)) {
        toolFailureSeen = true;
        emit({ type: 'cpb_event', event: 'tool_failed', observed: true });
      }
      const progress = safeProgress(message);
      if (progress) emit(progress);
      if (message.type === 'result') {
        if (message.subtype !== 'success' || message.is_error || typeof message.result !== 'string' || !message.result.trim()) {
          throw new Error('execution_failed');
        }
        if (message.permission_denials.length > 0) throw new Error('permission_denied');
        const usage = message.usage as unknown as Record<string, unknown>;
        final = {
          output: message.result,
          usage: {
            inputTokens: asCount(usage.input_tokens),
            outputTokens: asCount(usage.output_tokens),
            costUsd: asCost(message.total_cost_usd),
          },
          ...(typeof message.session_id === 'string' ? { sessionId: message.session_id } : {}),
        };
      }
    }
  } finally {
    process.removeListener('SIGTERM', interrupt);
    process.removeListener('SIGINT', interrupt);
  }

  if (toolFailureSeen) throw new Error('tool_failed');
  if (!final) throw new Error('empty_result');
  emit({ type: 'cpb_result', result: final });
}

main().catch((error: unknown) => {
  // Never serialize provider error text; it can contain prompts or credentials.
  const message = error instanceof Error ? error.message : '';
  const code = ['timeout', 'permission_denied', 'tool_failed', 'execution_failed', 'empty_result', 'invalid_config'].includes(message) ? message : 'runner_failed';
  emit({ type: 'cpb_error', code });
  process.exitCode = 1;
});
