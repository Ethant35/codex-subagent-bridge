import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../process.js';
import { safeText } from '../redact.js';
import { BridgeError, type ProviderContext, type ProviderResult, type Task } from '../types.js';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

const AUTH_ENV = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_BEDROCK', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_VERTEX_PROJECT_ID', 'CLOUD_ML_REGION',
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_BEDROCK_BASE_URL', 'ANTHROPIC_VERTEX_BASE_URL',
  'CLAUDE_CODE_USE_GATEWAY',
] as const;
const ROUTING_ENV = AUTH_ENV.filter((key) => !['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'].includes(key));
const ALLOWED_TOOL_NAMES = ['mcp__cpb__read_file', 'mcp__cpb__write_file', 'mcp__cpb__list_files'] as const;

type CredentialValidation = { env: NodeJS.ProcessEnv; warnings: string[] };

function fail(code: string, message: string, state: 'FAILED' | 'BLOCKED' = 'FAILED'): never {
  throw new BridgeError(code, message, state);
}

function safeEnvValue(key: string): string | undefined {
  const value = process.env[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function cleanEnvironment(task: Task): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'USER', 'LOGNAME']) {
    const value = safeEnvValue(key);
    if (value) env[key] = value;
  }
  // Do not pass provider credentials for a different provider into Claude.
  const apiKey = task.credentialMode === 'api-key' ? safeEnvValue('ANTHROPIC_API_KEY') : undefined;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (task.backend === 'cli' && task.credentialMode === 'subscription') {
    const configDir = safeEnvValue('CLAUDE_CONFIG_DIR');
    if (configDir) env.CLAUDE_CONFIG_DIR = configDir;
  }
  for (const key of ['CLAUDE_CODE_DISABLE_ATTACHMENTS','CLAUDE_CODE_DISABLE_FILE_MENTIONS','CLAUDE_CODE_DISABLE_CLAUDE_MDS','CLAUDE_CODE_DISABLE_AUTO_MEMORY','CLAUDE_CODE_DISABLE_BACKGROUND_TASKS','CLAUDE_CODE_DISABLE_CRON','CLAUDE_CODE_DISABLE_BUNDLED_SKILLS','CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC']) env[key]='1';
  return env;
}

export function validateClaudeCredentials(task: Task): CredentialValidation {
  if (task.provider !== 'claude' || !['sdk', 'cli'].includes(task.backend)) {
    fail('INVALID_CLAUDE_TASK', 'Claude requires the sdk or cli backend.');
  }
  if (task.credentialMode !== 'api-key' && task.credentialMode !== 'subscription') {
    fail('CREDENTIAL_MODE_REQUIRED', 'Select Claude credentialMode as api-key or subscription.');
  }
  if (ROUTING_ENV.some((key) => safeEnvValue(key) !== undefined)) {
    fail('UNSUPPORTED_CREDENTIAL_ROUTE', 'Claude execution is blocked because alternate authentication or routing configuration is present.');
  }

  const warnings: string[] = [];
  if (task.credentialMode === 'api-key') {
    if (!safeEnvValue('ANTHROPIC_API_KEY')) {
      fail('MISSING_CREDENTIAL', 'Claude api-key mode requires ANTHROPIC_API_KEY.');
    }
    if (safeEnvValue('CLAUDE_CODE_OAUTH_TOKEN')) {
      fail('AMBIGUOUS_CREDENTIALS', 'Claude API-key mode cannot run while another Claude credential is configured.');
    }
    warnings.push('Claude API-key mode can incur API charges.');
  } else {
    if (task.backend === 'sdk') {
      fail('SUBSCRIPTION_SDK_UNSUPPORTED', 'Claude subscription authentication is not supported through the Agent SDK without prior Anthropic approval.', 'BLOCKED');
    }
    if (safeEnvValue('ANTHROPIC_API_KEY') || safeEnvValue('CLAUDE_CODE_OAUTH_TOKEN')) {
      fail('AMBIGUOUS_CREDENTIALS', 'Claude subscription mode is blocked while API credentials are present.');
    }
    warnings.push('Claude subscription usage and remaining quota are controlled by Anthropic; this bridge does not estimate account quota.');
  }
  return { env: cleanEnvironment(task), warnings };
}

function mcpConfig(task: Task, workspace: string, configPath: string) {
  const cliPath = fileURLToPath(new URL('../cli.js', import.meta.url));
  return {
    cpb: {
      type: 'stdio' as const,
      command: process.execPath,
      args: [cliPath, 'tool-server', path.resolve(configPath)],
      env: {
        CPB_TASK_ID: task.taskId,
        CPB_WORKSPACE: path.resolve(workspace),
      },
      timeout: Math.max(1000, Math.min(task.maxRuntimeMs, 120_000)),
      alwaysLoad: true,
    },
  };
}

function contextPrompt(task: Task): string {
  return [
    'Execution contract metadata (the delegated task instructions follow as the user message):',
    `Task ID: ${task.taskId}`,
    `Parent correlation ID: ${task.correlationId}`,
    `Expected output: ${task.expectedOutput}`,
    `Result format: ${task.resultFormat}`,
    'Use only the explicitly provided cpb MCP tools. Do not invoke tools outside this MCP server.',
    'Do not claim completion unless the requested work is complete and verified.',
  ].join('\n');
}

export function sdkSetup(task: Task, workspace: string, configPath: string, diagnostic = false): Options {
  if (diagnostic && (task.provider !== 'claude' || task.backend !== 'sdk')) {
    fail('INVALID_CLAUDE_TASK', 'Claude setup diagnostics require an SDK task.');
  }
  const env = diagnostic ? cleanEnvironment(task) : validateClaudeCredentials(task).env;
  return buildSdkOptions(task, workspace, configPath, env);
}

function buildSdkOptions(task: Task, workspace: string, configPath: string, env: NodeJS.ProcessEnv): Options {
  return {
    cwd: path.resolve(workspace),
    env: env as Record<string, string>,
    model: task.model,
    tools: [],
    mcpServers: mcpConfig(task, workspace, configPath),
    allowedTools: ALLOWED_TOOL_NAMES.filter((name) => {
      const op = name.slice('mcp__cpb__'.length) as Task['allowedOperations'][number];
      return task.allowedOperations.includes(op);
    }),
    disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task', 'WebFetch', 'WebSearch'],
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    settingSources: [],
    strictMcpConfig: true,
    settings: { disableAllHooks: true, disableClaudeAiConnectors: true, fallbackModel: [] },
    plugins: [],
    skills: [],
    hooks: {},
    extraArgs: { bare: null, restricted: null },
    maxTurns: task.maxToolSteps + 1,
    ...(task.maxSpendUsd === null ? {} : { maxBudgetUsd: task.maxSpendUsd }),
    persistSession: false,
    systemPrompt: contextPrompt(task),
    abortController: new AbortController(),
    stderr: () => { /* Never forward provider diagnostics that may contain secrets. */ },
  };
}

function parseJsonLine(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

async function readSources(configPath: string): Promise<string[]> {
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { eventPath?: unknown };
    if (typeof config.eventPath !== 'string') return [];
    const log = await readFile(config.eventPath, 'utf8');
    const sources = new Set<string>();
    for (const line of log.split(/\r?\n/)) {
      const row = parseJsonLine(line);
      const detail = row?.detail && typeof row.detail === 'object' ? row.detail as Record<string, unknown> : undefined;
      if (row?.type === 'tool_allowed' && detail?.name === 'read_file' && typeof detail.path === 'string') sources.add(detail.path);
    }
    return [...sources];
  } catch {
    return [];
  }
}

function sdkResultFromLine(line: string, task: Task): ProviderResult | undefined {
  const event = parseJsonLine(line);
  if (event?.type !== 'result') return undefined;
  if (event.subtype !== 'success' || event.is_error === true || typeof event.result !== 'string' || !event.result.trim()) {
    fail('CLAUDE_EXECUTION_FAILED', 'Claude did not return a successful, non-empty result.');
  }
  if (Array.isArray(event.permission_denials) && event.permission_denials.length > 0) {
    fail('CLAUDE_PERMISSION_DENIED', 'Claude attempted an operation that the bridge did not authorize.');
  }
  const usage = event.usage && typeof event.usage === 'object' ? event.usage as Record<string, unknown> : {};
  const costUsd = numeric(event.total_cost_usd);
  if (task.maxSpendUsd !== null && costUsd === null) {
    fail('CLAUDE_COST_UNKNOWN', 'Claude did not provide cost metadata required by the configured spending limit.');
  }
  if (task.maxSpendUsd !== null && costUsd !== null && costUsd > task.maxSpendUsd) {
    fail('CLAUDE_BUDGET_EXCEEDED', 'Claude reported estimated spend above the configured limit.');
  }
  return {
    output: safeText(event.result),
    usage: {
      inputTokens: numeric(usage.input_tokens),
      outputTokens: numeric(usage.output_tokens),
      costUsd,
    },
    ...(typeof event.session_id === 'string' ? { sessionId: event.session_id } : {}),
  };
}

function classifyClaudeLines(lines: string[], task: Task, toolFailureSeen: boolean): ProviderResult {
  if (toolFailureSeen) fail('CLAUDE_TOOL_FAILED', 'Claude reported a failed tool operation; the task cannot be marked complete.');
  let result: ProviderResult | undefined;
  for (const line of lines) {
    const event = parseJsonLine(line);
    if (!event) fail('CLAUDE_MALFORMED_OUTPUT','Claude returned malformed structured output.');
    if (event?.type === 'result') result = sdkResultFromLine(line, task);
  }
  if (!result) fail('CLAUDE_EMPTY_RESULT', 'Claude exited without a structured final result.');
  return result;
}

function emitSdkProgress(ctx: ProviderContext, line: string) {
  const event = parseJsonLine(line);
  if (!event) return;
  // Only emit a small metadata allowlist; never echo prompts, tool arguments, or raw provider text.
  if (event.type === 'cpb_event') {
    ctx.event('claude.progress', {event:event.event, sessionId:event.sessionId, subtype:event.subtype, turns:event.turns, costUsd:event.costUsd, observed:event.observed});
  } else if (event.type === 'system' && event.subtype === 'init') {
    if(Array.isArray(event.tools) && event.tools.some(t => typeof t !== 'string' || !([...ALLOWED_TOOL_NAMES,'EndConversation'] as string[]).includes(t))) fail('CLAUDE_UNEXPECTED_TOOL','Claude enabled tools outside the bridge capability.');
    ctx.event('claude.session', { taskId: ctx.task.taskId, sessionId: event.session_id ?? null });
  } else if (event.type === 'result') {
    ctx.event('claude.result', {
      subtype: event.subtype,
      isError: event.is_error === true,
      turns: numeric(event.num_turns),
      costUsd: numeric(event.total_cost_usd),
    });
  } else if (event.type === 'rate_limit_event') {
    ctx.event('claude.rate_limit', { observed: true, status: (event.rate_limit_info as {status?:unknown} | undefined)?.status });
  } else if (event.type === 'system' && event.subtype === 'permission_denied') {
    ctx.event('claude.permission_denied', { observed: true });
  }
}

function hasToolFailure(event: Record<string, unknown>): boolean {
  if (event.type !== 'user' && event.type !== 'user_replay') return false;
  const message = event.message && typeof event.message === 'object' ? event.message as Record<string, unknown> : undefined;
  const blocks = message && Array.isArray(message.content) ? message.content : [];
  return blocks.some((block) => {
    if (!block || typeof block !== 'object') return false;
    const item = block as Record<string, unknown>;
    return (item.type === 'tool_result' || item.type === 'mcp_tool_result') && item.is_error === true;
  });
}

export async function runClaude(ctx: ProviderContext): Promise<ProviderResult> {
  if (ctx.task.maxSpendUsd === 0) fail('BUDGET_EXHAUSTED', 'Claude execution is blocked because the spending limit is zero.');
  const { env, warnings } = validateClaudeCredentials(ctx.task);
  if (ctx.task.credentialMode === 'subscription') {
    const auth = await safeAuthStatus(env);
    if (auth.available !== true || auth.loggedIn !== true || auth.authMethod !== 'claude.ai') {
      fail('CLAUDE_SUBSCRIPTION_LOGIN_REQUIRED', 'Claude CLI must have an existing claude.ai subscription login.');
    }
  }
  for (const warning of warnings) ctx.event('claude.warning', { message: warning });
  if (ctx.task.backend === 'sdk') {
    const runner = fileURLToPath(new URL('../claude-sdk-runner.js', import.meta.url));
    let toolFailureSeen = false;
    const result = await runProcess(process.execPath, [runner, path.resolve(ctx.configPath)], {
      cwd: path.resolve(ctx.workspace), env, signal: ctx.signal, timeoutMs: ctx.task.maxRuntimeMs,
      maxOutputBytes: 8 * 1024 * 1024,
      onLine: (line) => {
        const event = parseJsonLine(line);
        if (event?.type === 'cpb_event' && event.event === 'tool_failed') toolFailureSeen = true;
        emitSdkProgress(ctx, line);
      },
    });
    if (result.exitCode !== 0) fail('CLAUDE_SDK_RUNNER_FAILED', 'Claude SDK process exited unsuccessfully.');
    const outputLines = result.stdout.split(/\r?\n/).filter(Boolean);
    const envelope = outputLines.map(parseJsonLine).reverse().find((event) => event?.type === 'cpb_result');
    if (envelope?.type !== 'cpb_result' || typeof envelope.result !== 'object' || !envelope.result) {
      fail('CLAUDE_EMPTY_RESULT', 'Claude SDK runner exited without a structured final result.');
    }
    const value = envelope.result as Record<string, unknown>;
    if (typeof value.output !== 'string' || !value.output.trim()) fail('CLAUDE_EMPTY_RESULT', 'Claude returned an empty result.');
    if (toolFailureSeen) fail('CLAUDE_TOOL_FAILED', 'Claude reported a failed tool operation; the task cannot be marked complete.');
    const usage = value.usage && typeof value.usage === 'object' ? value.usage as Record<string, unknown> : {};
    const costUsd = numeric(usage.costUsd);
    if (ctx.task.maxSpendUsd !== null && (costUsd === null || costUsd > ctx.task.maxSpendUsd)) {
      fail(costUsd === null ? 'CLAUDE_COST_UNKNOWN' : 'CLAUDE_BUDGET_EXCEEDED', costUsd === null ? 'Claude did not provide cost metadata required by the configured spending limit.' : 'Claude reported estimated spend above the configured limit.');
    }
    return { ...value, output: safeText(value.output), sources: await readSources(ctx.configPath) } as unknown as ProviderResult;
  }
  return runClaudeCli(ctx, env);
}

async function runClaudeCli(ctx: ProviderContext, env: NodeJS.ProcessEnv): Promise<ProviderResult> {
  const task = ctx.task;
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', task.model,
    '--max-turns', String(task.maxToolSteps + 1),
    '--tools', '',
    '--restricted',
    ...(task.credentialMode === 'api-key' ? ['--bare'] : []),
    '--disable-slash-commands',
    '--no-chrome',
    '--settings', JSON.stringify({ disableAllHooks: true, disableClaudeAiConnectors: true, fallbackModel: [] }),
    '--permission-mode', 'dontAsk',
    '--strict-mcp-config',
    '--setting-sources', '',
    '--no-session-persistence',
    '--mcp-config', JSON.stringify({ mcpServers: mcpConfig(task, ctx.workspace, ctx.configPath) }),
    '--disallowedTools', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task', 'WebFetch', 'WebSearch',
    '--append-system-prompt', contextPrompt(task),
  ];
  const allowedTools = ALLOWED_TOOL_NAMES.filter((name) => task.allowedOperations.includes(name.slice('mcp__cpb__'.length) as Task['allowedOperations'][number]));
  if (allowedTools.length) args.splice(args.indexOf('--disallowedTools'), 0, '--allowedTools', ...allowedTools);
  if (task.maxSpendUsd !== null) args.push('--max-budget-usd', String(task.maxSpendUsd));
  let toolFailureSeen = false;
  const result = await runProcess('claude', args, {
    cwd: path.resolve(ctx.workspace), env, signal: ctx.signal, timeoutMs: task.maxRuntimeMs,
    input: task.instructions, maxOutputBytes: 8 * 1024 * 1024,
    onLine: (line) => {
      const event = parseJsonLine(line);
      if (event && hasToolFailure(event)) toolFailureSeen = true;
      emitSdkProgress(ctx, line);
    },
  });
  if (result.exitCode !== 0) fail('CLAUDE_CLI_FAILED', 'Claude Code CLI exited unsuccessfully.');
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const event = parseJsonLine(line);
    if (event && hasToolFailure(event)) toolFailureSeen = true;
  }
  const final = classifyClaudeLines(result.stdout.split(/\r?\n/).filter(Boolean), task, toolFailureSeen);
  if (!final.output.trim()) fail('CLAUDE_EMPTY_RESULT', 'Claude returned an empty result.');
  final.sources = await readSources(ctx.configPath);
  return final;
}

async function commandExists(command: string): Promise<boolean> {
  try {
    const result = await runProcess(command, ['--version'], { timeoutMs: 5000, maxOutputBytes: 4096 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function safeAuthStatus(env: NodeJS.ProcessEnv): Promise<Record<string, unknown>> {
  try {
    const result = await runProcess('claude', ['auth', 'status'], { env, timeoutMs: 8000, maxOutputBytes: 64 * 1024 });
    const parsed = parseJsonLine(result.stdout.trim());
    if (![0,1].includes(result.exitCode ?? -1) || !parsed || typeof parsed.loggedIn !== 'boolean') return { available: false, loggedIn: null, reason: 'unrecognized_status' };
    const authMethod = typeof parsed.authMethod === 'string' && ['none', 'claude.ai', 'oauth_token', 'api_key', 'api_key_helper', 'third_party'].includes(parsed.authMethod) ? parsed.authMethod : null;
    return { available: true, loggedIn: parsed.loggedIn, authMethod, statusExitCode: result.exitCode };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return { available: false, loggedIn: null, reason: code === 'MISSING_EXECUTABLE' ? 'cli_missing' : 'status_unavailable' };
  }
}

export async function claudeDiagnostics(): Promise<object> {
  let sdkAvailable = false;
  try {
    await import('@anthropic-ai/claude-agent-sdk');
    sdkAvailable = true;
  } catch {
    // Diagnostics report only dependency availability, never exception text.
  }
  const cliAvailable = await commandExists('claude');
  const configuredClaudeDir = safeEnvValue('CLAUDE_CONFIG_DIR');
  const env = cleanEnvironment({ backend: 'cli', credentialMode: 'subscription' } as Task);
  if (configuredClaudeDir) env.CLAUDE_CONFIG_DIR = configuredClaudeDir;
  const auth = cliAvailable ? await safeAuthStatus(env) : { available: false, loggedIn: null, reason: 'cli_missing' };
  const credentialConflicts = AUTH_ENV.filter((key) => safeEnvValue(key) !== undefined).map((key) => key);
  let setupValidated = false;
  if (sdkAvailable) {
    try {
      const sample: Task = {
        version: 1, taskId: '00000000-0000-4000-8000-000000000001', correlationId: 'doctor',
        provider: 'claude', backend: 'sdk', model: 'diagnostic-only', instructions: 'Diagnostic setup only; do not execute.',
        workspaceRoot: process.cwd(), allowedOperations: [], readablePaths: [], writablePaths: [],
        maxRuntimeMs: 1, maxToolSteps: 1, maxSpendUsd: null, expectedOutput: 'none', resultFormat: 'text',
        networkPolicy: 'provider-only',
      };
      sdkSetup(sample, process.cwd(), path.join(process.cwd(), 'diagnostic-capability.json'), true);
      setupValidated = true;
    } catch {
      setupValidated = false;
    }
  }
  const warnings = [
    ...(safeEnvValue('ANTHROPIC_API_KEY') ? ['ANTHROPIC_API_KEY is configured and may select API billing.'] : []),
    ...(safeEnvValue('ANTHROPIC_AUTH_TOKEN') || safeEnvValue('CLAUDE_CODE_OAUTH_TOKEN') ? ['Additional Claude authentication configuration is present; execution still requires an explicit credential mode.'] : []),
    ...(ROUTING_ENV.some((key) => safeEnvValue(key) !== undefined) ? ['Alternate Claude provider or endpoint routing configuration is present and will be rejected for execution.'] : []),
  ];
  return {
    sdk: { available: sdkAvailable },
    sdkSetup: { validated: setupValidated, inferencePerformed: false },
    cli: { available: cliAvailable },
    auth,
    configuredCredentialNames: credentialConflicts,
    warnings,
    liveInference: 'not-tested',
  };
}
