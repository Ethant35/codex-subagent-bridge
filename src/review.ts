import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { atomicJSON, readPrivateFile } from './private-files.js';
import { Workspace, readFileSafe, checkedPath } from './workspace.js';
import { BridgeError, type Task } from './types.js';
import type { Store } from './store.js';
import { redact } from './redact.js';

const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const proposalSchema = z.object({
  version: z.literal(1), taskHash: hex,
  files: z.array(z.object({ path: z.string(), beforeHash: hex.nullable(), afterHash: hex.nullable() }).strict()).max(1000),
}).strict();
const taskHash = (task: Task) => hash(JSON.stringify(redact(task)));
function optionalFile(root: string, file: string): Buffer | null {
  try { return readFileSafe(root, file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    checkedPath(root, file, true);
    return null;
  }
}
const fileHash = (data: Buffer | null) => data === null ? null : hash(data);

/** Persist immutable proposal hashes outside the child's file capability. */
export function saveProposal(ws: Workspace, checkpoint: () => void = () => {}): void {
  let bytes = 0;
  const files = [...new Set(ws.task.writablePaths)].map(file => {
    checkpoint();
    const data = optionalFile(ws.root, file);
    bytes += data?.length ?? 0;
    if (bytes > 8_000_000) throw new BridgeError('WORKSPACE_LIMIT', 'Proposed files exceed 8 MB.');
    const beforeHash = ws.original.get(file);
    if (beforeHash === undefined || (beforeHash !== null && data === null)) {
      throw new BridgeError('PROPOSAL_INVALID', 'A staged file is missing. File deletion is not supported.');
    }
    return { path: file, beforeHash, afterHash: fileHash(data) };
  });
  atomicJSON(path.join(path.dirname(ws.root), 'proposal.json'), { version: 1, taskHash: taskHash(ws.task), files });
}

function pending(store: Store, id: string) {
  const run = store.get(id);
  if (run.state !== 'AWAITING_REVIEW' || run.task.reviewBeforeApply !== true) {
    throw new BridgeError('REVIEW_NOT_PENDING', 'This run has no pending review. Inspect its state before proceeding.');
  }
  return run;
}

function loadProposal(store: Store, id: string) {
  const run = pending(store, id);
  const dir = store.dir(id);
  const workspace = checkedPath(fs.realpathSync(dir), 'workspace');
  let proposal: z.infer<typeof proposalSchema>;
  try { proposal = proposalSchema.parse(JSON.parse(readPrivateFile(path.join(dir, 'proposal.json'), 2_000_000))); }
  catch { throw new BridgeError('PROPOSAL_INVALID', 'Proposal record is missing or invalid. Preserve the run store.'); }
  const paths = [...new Set(run.task.writablePaths)];
  if (proposal.taskHash !== taskHash(run.task) || proposal.files.length !== paths.length ||
      proposal.files.some((file, index) => file.path !== paths[index])) {
    throw new BridgeError('PROPOSAL_INVALID', 'Proposal does not match the authorized task.');
  }
  let bytes = 0;
  const files = proposal.files.map(file => {
    const before = file.beforeHash === null ? null : readFileSafe(checkedPath(fs.realpathSync(dir), 'originals'), file.path);
    const after = optionalFile(workspace, file.path);
    bytes += after?.length ?? 0;
    if (bytes > 8_000_000 || fileHash(before) !== file.beforeHash || fileHash(after) !== file.afterHash ||
        (before !== null && after === null)) {
      throw new BridgeError('PROPOSAL_CHANGED', 'Staged files or original backups changed. Do not apply this proposal.');
    }
    return { ...file, before, after };
  });
  return { run, workspace, proposal, files, reviewToken: hash(JSON.stringify(proposal)) };
}

/** Full file replacement view; binary data uses lossless base64, never a truncated preview. */
export function reviewChanges(store: Store, id: string) {
  const data = loadProposal(store, id);
  const changes = data.files.filter(file => file.beforeHash !== file.afterHash).map(file => {
    const text = [file.before, file.after].every(bytes => bytes === null ||
      (!bytes.includes(0) && Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)));
    const encoding = text ? 'utf8' : 'base64';
    const current = fileHash(optionalFile(data.run.task.workspaceRoot, file.path));
    return {
      path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash, encoding,
      before: file.before?.toString(encoding) ?? null, after: file.after?.toString(encoding) ?? null,
      conflict: current !== file.beforeHash,
    };
  });
  return { id, state: data.run.state, changes, reviewToken: data.reviewToken, modified: false };
}

/** Serialize local decisions. A crash leaves the lock for explicit recovery, never an automatic retry. */
function decide<T>(store: Store, id: string, action: () => T): T {
  pending(store, id);
  const file = path.join(store.dir(id), 'review.lock');
  let fd: number;
  try { fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new BridgeError('REVIEW_LOCKED', 'A review decision is active or was interrupted. Inspect recovery; do not retry automatically.');
    throw error;
  }
  try { fs.writeFileSync(fd, String(process.pid)); fs.fsyncSync(fd); return action(); }
  finally { fs.closeSync(fd); fs.unlinkSync(file); }
}

function cleanup(store: Store, id: string): void {
  for (const name of ['workspace', 'originals']) {
    const dir = path.join(store.dir(id), name);
    // Never use a persisted arbitrary workspace path as a deletion target.
    if (fs.existsSync(dir)) checkedPath(fs.realpathSync(store.dir(id)), name);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function applyChanges(store: Store, id: string, token: string | undefined) {
  if (!token || !hex.safeParse(token).success) throw new BridgeError('REVIEW_REQUIRED', 'Run cpb review RUN_ID, inspect every change, then pass its --review-token to cpb apply.');
  return decide(store, id, () => {
    const data = loadProposal(store, id);
    if (token !== data.reviewToken) throw new BridgeError('REVIEW_CHANGED', 'Review token does not match this proposal. Run cpb review again.');
    // Validate every changed destination before any source write.
    for (const file of data.files) {
      if (file.beforeHash !== file.afterHash && fileHash(optionalFile(data.run.task.workspaceRoot, file.path)) !== file.beforeHash) {
        throw new BridgeError('WRITE_CONFLICT', 'Project files changed after the snapshot. No changes applied. Discard and prepare a new task.', 'BLOCKED');
      }
    }
    const ws = new Workspace(data.run.task, data.workspace);
    for (const file of data.files) ws.original.set(file.path, file.beforeHash);
    const run = data.run;
    run.state = 'RUNNING'; run.pid = process.pid;
    store.save(run);
    try {
      // Publish the bytes verified against the token, never a later reread of staging.
      run.changedPaths = ws.publish(undefined, new Map(data.files.map(file => [file.path, file.after])));
      run.state = 'COMPLETED';
      store.save(run);
      store.event(id, 'review_applied', { changedFileCount: run.changedPaths.length });
      cleanup(store, id);
    } catch (error) {
      run.state = 'FAILED';
      run.error = { code: error instanceof BridgeError ? error.code : 'APPLY_FAILED', message: 'Apply did not finish safely. Inspect cpb recovery before any further changes.' };
      store.save(run);
      throw new BridgeError(run.error.code, run.error.message);
    }
    return run;
  });
}

export function discardChanges(store: Store, id: string) {
  return decide(store, id, () => {
    const run = pending(store, id);
    run.state = 'DISCARDED'; run.changedPaths = [];
    store.save(run);
    store.event(id, 'review_discarded', {});
    cleanup(store, id);
    return run;
  });
}
