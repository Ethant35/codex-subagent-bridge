import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseTask } from './schema.js';
import { Store, type Run } from './store.js';
import { Workspace } from './workspace.js';
import { FileTools, type ToolConfig } from './file-tools.js';
import { BridgeError, type ProviderResult } from './types.js';
import { runOpenRouter } from './providers/openrouter.js';
import { runClaude } from './providers/claude.js';
import { safeText } from './redact.js';
import { saveProposal } from './review.js';

const POLL_FAILURE = new BridgeError('STORE_CANCEL_CHECK_FAILED', 'Could not check local cancellation state; execution stopped for safety.', 'FAILED');

export async function delegate(value: unknown, store = new Store(), externalSignal?: AbortSignal): Promise<Run> {
  const task = parseTask(value); // Validation precedes run creation and all provider calls.
  const createdAt = new Date().toISOString();
  const run: Run = {
    id: task.taskId,
    correlationId: task.correlationId,
    state: 'QUEUED',
    task,
    instructionHash: createHash('sha256').update(task.instructions).digest('hex'),
    pid: process.pid,
    createdAt,
    updatedAt: createdAt,
  };
  try {
    store.create(run);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new BridgeError('DUPLICATE_TASK', 'Task ID already exists; use a new UUID');
    throw error;
  }

  const controller = new AbortController();
  const deadline = Date.now() + task.maxRuntimeMs;
  const cancel = () => controller.abort(new BridgeError('CANCELLED', 'Execution cancelled.', 'CANCELLED'));
  const checkCancellation = () => {
    if (controller.signal.aborted) return;
    try {
      if (store.cancelled(run.id)) cancel();
    } catch {
      controller.abort(POLL_FAILURE);
    }
  };

  externalSignal?.addEventListener('abort', cancel, { once: true });
  if (externalSignal?.aborted) cancel();
  const timeout = setTimeout(() => controller.abort(new BridgeError('TIMEOUT', 'Task exceeded its maximum runtime.', 'TIMED_OUT')), task.maxRuntimeMs);
  const polling = setInterval(checkCancellation, 50);
  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);

  const checkpoint = () => {
    if (Date.now() >= deadline && !controller.signal.aborted) {
      controller.abort(new BridgeError('TIMEOUT', 'Task deadline reached.', 'TIMED_OUT'));
    }
    checkCancellation();
    controller.signal.throwIfAborted();
  };

  let release: (() => void) | undefined;
  let capabilityPath: string | undefined;
  let finalizationError: BridgeError | undefined;
  try {
    while (!(release = store.acquire(run.id))) await delay(50, undefined, { signal: controller.signal });
    checkpoint();
    run.state = 'RUNNING';
    store.save(run);
    store.event(run.id, 'state', { state: 'RUNNING' });

    const workspace = path.join(store.dir(run.id), 'workspace');
    run.workspace = workspace;
    const ws = new Workspace(task, workspace);
    ws.prepare(checkpoint);
    store.save(run);

    const config: ToolConfig = { task, workspace, eventPath: path.join(store.dir(run.id), 'events.jsonl'), deadline };
    capabilityPath = path.join(store.dir(run.id), 'capability.json');
    // Capability lives in a private directory; exact instructions are preserved for the subprocess.
    fs.writeFileSync(capabilityPath, JSON.stringify(config), { mode: 0o600, flag: 'wx' });
    const tools = new FileTools(config);
    const ctx = { task, workspace, signal: controller.signal, configPath: capabilityPath, tools, event: (type: string, detail: unknown) => store.event(run.id, type, detail) };
    checkpoint();
    const result: ProviderResult = await (task.provider === 'openrouter' ? runOpenRouter(ctx) : runClaude(ctx));
    checkpoint();
    tools.assertHealthy();
    if (!result.output.trim()) throw new BridgeError('EMPTY_RESULT', 'Child returned no result');
    if (task.resultFormat === 'json') {
      try { JSON.parse(result.output); } catch { throw new BridgeError('INVALID_RESULT', 'Child result is not valid JSON'); }
    }
    checkpoint();
    if (task.reviewBeforeApply) {
      run.proposedPaths = saveProposal(ws, checkpoint);
      run.changedPaths = [];
    } else run.changedPaths = ws.publish(checkpoint);
    run.result = result;
    run.state = task.reviewBeforeApply ? 'AWAITING_REVIEW' : 'COMPLETED';
  } catch (error) {
    const err = controller.signal.aborted ? controller.signal.reason : error;
    run.state = err instanceof BridgeError ? err.state : 'FAILED';
    run.error = {
      code: err instanceof BridgeError ? err.code : 'EXECUTION_ERROR',
      message: safeText(err instanceof BridgeError ? err.message : 'Execution failed; inspect local environment and diagnostics'),
    };
  } finally {
    clearTimeout(timeout);
    clearInterval(polling);
    externalSignal?.removeEventListener('abort', cancel);
    process.removeListener('SIGTERM', cancel);
    process.removeListener('SIGINT', cancel);

    let capabilityCleanupFailed = false;
    if (capabilityPath) {
      try {
        fs.unlinkSync(capabilityPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') capabilityCleanupFailed = true;
      }
    }
    if (capabilityCleanupFailed) {
      finalizationError = new BridgeError('CAPABILITY_CLEANUP_FAILED', 'Could not safely remove the local task capability file.');
      setRunFailure(run, finalizationError);
    }

    let finalSaveFailed = false;
    try {
      store.save(run);
    } catch {
      finalSaveFailed = true;
    }
    let finalEventFailed = false;
    if (!finalSaveFailed) {
      try {
        store.event(run.id, 'state', { state: run.state, error: run.error });
      } catch {
        finalEventFailed = true;
      }
    }
    if (finalSaveFailed || finalEventFailed) {
      finalizationError ??= new BridgeError('STORE_FINALIZE_FAILED', 'Could not safely finalize local run state.');
      setRunFailure(run, finalizationError);
      // Best effort to replace a previously persisted COMPLETED state after an event failure.
      try { store.save(run); } catch { /* The caller still receives STORE_FINALIZE_FAILED. */ }
    }

    try {
      release?.();
    } catch {
      finalizationError ??= new BridgeError('STORE_RELEASE_FAILED', 'Could not safely release the local execution slot.');
      setRunFailure(run, finalizationError);
      try { store.save(run); } catch { /* The caller still receives STORE_RELEASE_FAILED. */ }
    }

    if (run.state === 'COMPLETED' && !finalizationError) {
      try {
        if (run.workspace) fs.rmSync(run.workspace, { recursive: true, force: true });
        if (run.workspace) fs.rmSync(path.join(path.dirname(run.workspace), 'originals'), { recursive: true, force: true });
      } catch {
        finalizationError = new BridgeError('RUN_CLEANUP_FAILED', 'Could not safely remove completed local recovery files.');
        setRunFailure(run, finalizationError);
        try { store.save(run); } catch { /* The caller still receives RUN_CLEANUP_FAILED. */ }
      }
    }
  }

  if (finalizationError) throw finalizationError;
  return run;
}

function setRunFailure(run: Run, error: BridgeError): void {
  run.state = 'FAILED';
  run.error = { code: error.code, message: error.message };
}
