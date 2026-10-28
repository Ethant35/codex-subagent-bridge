import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { BridgeError, type Task, type State, type ProviderResult } from './types.js';
import { redact } from './redact.js';
import { taskSchema } from './schema.js';
import {atomicJSON,readPrivateFile} from './private-files.js';
export {atomicJSON,readPrivateFile} from './private-files.js';

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_STATES = new Set<State>(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'BLOCKED']);
const MAX_RUN_RECORD_BYTES = 8 * 1024 * 1024;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 1000;
const SCHEDULER_SCHEMA_VERSION = 1;
const SQLITE_BUSY_TIMEOUT_MS = 5000;
const PRIVATE_MODE_MASK = 0o077;
const MAX_EVENT_LINE_BYTES = 64 * 1024;

export interface Run {
  id: string;
  correlationId: string;
  state: State;
  task: Task;
  instructionHash: string;
  pid: number;
  createdAt: string;
  updatedAt: string;
  workspace?: string;
  result?: ProviderResult;
  error?: { code: string; message: string };
  changedPaths?: string[];
}

export interface ListOptions {
  /** Number of records in this page. Defaults to 100; maximum is 1000. */
  limit?: number;
  /** Exclusive key from the last record in the previous page. */
  before?: { createdAt: string; id: string };
}

/** Validate a private regular file without following a symbolic link. */
export function assertPrivateFile(file: string): void {
  assertPrivateRegularFile(file);
}

/** Validate the opened file itself, which avoids trusting only a path check. */
export function assertPrivateFileDescriptor(fd: number): void {
  assertPrivateRegularFd(fd);
}

/** Create a private file if absent, then validate its path and opened inode. */
export function ensurePrivateFile(file: string): void {
  let fd: number | undefined;
  let created = false;
  try {
    try {
      fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if (fd !== undefined) assertPrivateRegularFd(fd);
    assertPrivateRegularFile(file);
    if (created && fd !== undefined) {
      fs.fsyncSync(fd);
      syncDirectory(path.dirname(file));
    }
  } catch (error) {
    throw asStoreIOError(error, 'Could not safely prepare a private local state file.');
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* validation result is primary */ }
    }
  }
}

/** Append one bounded, redacted JSON record to a private JSONL file. */
export function appendPrivateJSONL(file: string, value: unknown): void {
  const safe = redactEvent(value);
  const line = `${JSON.stringify(safe)}\n`;
  if (Buffer.byteLength(line) > MAX_EVENT_LINE_BYTES) throw new BridgeError('STORE_LIMIT', 'The local event record exceeds the supported size.');
  let fd: number | undefined;
  try {
    try { assertPrivateRegularFile(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW, 0o600);
    assertPrivateRegularFd(fd);
    assertPrivateRegularFile(file);
    fs.writeFileSync(fd, line);
    fs.fsyncSync(fd);
  } catch (error) {
    throw asStoreIOError(error, 'Could not safely append a local event record.');
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* preserve the write or validation error */ }
    }
  }
}

export function alive(pid: number): boolean {
  if (!isValidPid(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    // EPERM means the process exists but this user cannot signal it.
    if (code === 'EPERM') return true;
    return false;
  }
}

export class Store {
  readonly root: string;
  readonly runsRoot: string;

  constructor(root = process.env.CPB_HOME || path.join(os.homedir(), '.cpb')) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    assertPrivateDirectory(this.root);
    this.runsRoot = path.join(this.root, 'runs');
    fs.mkdirSync(this.runsRoot, { recursive: true, mode: 0o700 });
    assertPrivateDirectory(this.runsRoot);
  }

  dir(id: string): string {
    const safeId = validateRunId(id);
    return path.join(this.runsRoot, safeId);
  }

  create(run: Run): void {
    validateRunRecord(run, run.id);
    const directory = this.dir(run.id);
    fs.mkdirSync(directory, { mode: 0o700 });
    try {
      assertPrivateDirectory(directory);
      this.save(run);
    } catch (error) {
      try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* preserve original error */ }
      throw error;
    }
  }

  save(run: Run): void {
    validateRunRecord(run, run.id);
    const directory = this.checkedRunDirectory(run.id);
    run.updatedAt = new Date().toISOString();
    atomicJSON(path.join(directory, 'run.json'), run);
  }

  get(id: string): Run {
    const safeId = validateRunId(id);
    const directory = this.checkedRunDirectory(safeId);
    let record: Run;
    try {
      const file = path.join(directory, 'run.json');
      const contents = readPrivateFile(file, MAX_RUN_RECORD_BYTES);
      record = JSON.parse(contents) as Run;
      validateRunRecord(record, safeId);
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw corruptRecord(safeId);
    }

    if ((record.state === 'QUEUED' || record.state === 'RUNNING') && !alive(record.pid)) {
      record.state = 'FAILED';
      record.error = {
        code: 'OWNER_LOST',
        message: 'Execution owner exited without a final result; edits were not confirmed',
      };
      this.save(record);
    }
    return record;
  }

  /**
   * Read at most 100 records by default and never return more than 1000.
   * Records are ordered newest-first by (createdAt, id); `before` is exclusive.
   * The scan still validates every stored record so corruption cannot be hidden
   * in a later page. Only the requested page is retained in memory.
   */
  list(options: ListOptions = {}): Run[] {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new BridgeError('INVALID_LIMIT', 'Run listing options must be an object.');
    const limit = options.limit ?? DEFAULT_LIST_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
      throw new BridgeError('INVALID_LIMIT', `Run listing limit must be an integer from 1 to ${MAX_LIST_LIMIT}.`);
    }
    const before = options.before;
    if (before !== undefined && (!before || typeof before !== 'object' || !isCanonicalTimestamp(before.createdAt) || !RUN_ID_PATTERN.test(before.id))) {
      throw new BridgeError('INVALID_CURSOR', 'Run listing cursor must contain a valid createdAt timestamp and run ID.');
    }

    assertPrivateDirectory(this.runsRoot);
    let names: string[];
    try {
      names = fs.readdirSync(this.runsRoot);
    } catch (error) {
      throw asStoreIOError(error, 'Could not read the private run store.');
    }

    const pageHeap: Run[] = [];
    for (const name of names) {
      if (!RUN_ID_PATTERN.test(name)) throw new BridgeError('STORE_CORRUPT', 'The run index contains an invalid entry name. Preserve the state directory and restore it from a stopped-process backup.');
      const run = this.get(name);
      if (before && compareKeys(run, before) >= 0) continue;
      retainNewest(pageHeap, run, limit);
    }
    pageHeap.sort((a, b) => -compareKeys(a, b));
    return pageHeap;
  }

  event(id: string, type: string, detail: unknown): void {
    const directory = this.checkedRunDirectory(id);
    appendPrivateJSONL(path.join(directory, 'events.jsonl'), { at: new Date().toISOString(), type, detail });
  }

  cancel(id: string): { id: string; state: State; cancelRequested: boolean } {
    const run = this.get(id);
    if (run.state !== 'QUEUED' && run.state !== 'RUNNING') {
      return { id: run.id, state: run.state, cancelRequested: false };
    }
    const directory = this.checkedRunDirectory(run.id);
    const file = path.join(directory, 'cancel');
    let fd: number | undefined;
    try {
      fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
      fs.writeFileSync(fd, 'cancel\n');
      fs.fsyncSync(fd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        assertPrivateRegularFile(file);
      } else {
        throw asStoreIOError(error, 'Could not safely record the cancellation request.');
      }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    return { id: run.id, state: run.state, cancelRequested: true };
  }

  cancelled(id: string): boolean {
    const file = path.join(this.checkedRunDirectory(id), 'cancel');
    try {
      assertPrivateRegularFile(file);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  /** SQLite serializes slot claims/recovery across independent CLI and MCP processes. */
  acquire(id: string): (() => void) | undefined {
    const safeId = validateRunId(id);
    const file = path.join(this.root, 'scheduler.sqlite');
    let db: DatabaseSync;
    try {
      db = openPrivateDatabase(file);
    } catch (error) {
      throw classifyDatabaseError(error);
    }

    let transactionOpen = false;
    let primaryError: unknown;
    let acquiredSlot: number | undefined;
    try {
      db.exec(`PRAGMA busy_timeout=${SQLITE_BUSY_TIMEOUT_MS}`);
      db.exec('BEGIN IMMEDIATE');
      transactionOpen = true;

      const versionRow = db.prepare('PRAGMA user_version').get() as { user_version?: unknown } | undefined;
      const version = versionRow?.user_version;
      if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
        throw new BridgeError('STORE_DATABASE_CORRUPT', 'The scheduler database has an invalid schema version. Preserve the state directory and restore it from a backup.');
      }
      if (version > SCHEDULER_SCHEMA_VERSION) {
        throw new BridgeError('STORE_VERSION_UNSUPPORTED', `The scheduler database uses schema version ${version}, newer than this CPB supports. Upgrade CPB before using this store.`);
      }

      const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='slots'").get();
      if (version === 0) {
        if (table) validateSlotsTable(db);
        else db.exec('CREATE TABLE slots (slot INTEGER PRIMARY KEY, pid INTEGER NOT NULL, id TEXT NOT NULL)');
        db.exec(`PRAGMA user_version=${SCHEDULER_SCHEMA_VERSION}`);
      } else {
        if (!table) throw new BridgeError('STORE_DATABASE_CORRUPT', 'The scheduler database is missing its slots table. Preserve the state directory and restore it from a backup.');
        validateSlotsTable(db);
      }

      const rows = db.prepare('SELECT slot,pid,id FROM slots').all() as unknown as Array<{ slot: number; pid: number; id: string }>;
      for (const row of rows) {
        if (!Number.isInteger(row.slot) || row.slot < 0 || row.slot > 1 || !isValidPid(row.pid) || !RUN_ID_PATTERN.test(row.id)) {
          throw new BridgeError('STORE_DATABASE_CORRUPT', 'The scheduler database contains an invalid slot record. Preserve the state directory and restore it from a backup.');
        }
        if (!alive(row.pid)) db.prepare('DELETE FROM slots WHERE slot=?').run(row.slot);
      }

      const occupied = db.prepare('SELECT slot FROM slots').all() as unknown as Array<{ slot: number }>;
      acquiredSlot = [0, 1].find((slot) => !occupied.some((row) => row.slot === slot));
      if (acquiredSlot !== undefined) db.prepare('INSERT INTO slots(slot,pid,id) VALUES(?,?,?)').run(acquiredSlot, process.pid, safeId);
      db.exec('COMMIT');
      transactionOpen = false;
    } catch (error) {
      primaryError = error;
      if (transactionOpen) {
        try { db.exec('ROLLBACK'); } catch { /* preserve the original failure */ }
        transactionOpen = false;
      }
    } finally {
      try { db.close(); } catch (error) { if (primaryError === undefined) primaryError = error; }
    }

    if (primaryError !== undefined) throw classifyDatabaseError(primaryError);
    if (acquiredSlot === undefined) return undefined;

    return () => {
      let releaseDB: DatabaseSync;
      try {
        releaseDB = openPrivateDatabase(file);
        releaseDB.exec(`PRAGMA busy_timeout=${SQLITE_BUSY_TIMEOUT_MS}`);
        releaseDB.prepare('DELETE FROM slots WHERE slot=? AND id=? AND pid=?').run(acquiredSlot, safeId, process.pid);
      } catch (error) {
        throw classifyDatabaseError(error);
      } finally {
        // A constructor failure leaves no connection to close.
        if (typeof releaseDB! !== 'undefined') {
          try { releaseDB!.close(); } catch (error) { throw classifyDatabaseError(error); }
        }
      }
    };
  }

  private checkedRunDirectory(id: string): string {
    const directory = this.dir(id);
    assertPrivateDirectory(directory, id);
    return directory;
  }
}

function validateRunId(id: string): string {
  if (typeof id !== 'string' || !RUN_ID_PATTERN.test(id)) throw new BridgeError('INVALID_ID', 'Run ID must be a UUID.');
  return id;
}

function isValidPid(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 0 && pid <= 0x7fffffff;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}

function validateRunRecord(value: unknown, expectedId: string): asserts value is Run {
  const r = value as Partial<Run> | null;
  const taskValid = !!r && !!r.task && typeof r.task === 'object' && taskSchema.safeParse(r.task).success;
  if (!r || typeof r !== 'object' || !RUN_ID_PATTERN.test(expectedId) || typeof r.id !== 'string' || r.id.toLowerCase() !== expectedId.toLowerCase() ||
      typeof r.correlationId !== 'string' || r.correlationId.length === 0 || r.correlationId.length > 256 ||
      !RUN_STATES.has(r.state as State) || !taskValid || r.task!.taskId.toLowerCase() !== expectedId.toLowerCase() ||
      !/^[a-f0-9]{64}$/i.test(r.instructionHash ?? '') || !isValidPid(r.pid) ||
      !isCanonicalTimestamp(r.createdAt) || !isCanonicalTimestamp(r.updatedAt)) {
    throw corruptRecord(expectedId);
  }
}

function corruptRecord(id: string): BridgeError {
  return new BridgeError('STORE_CORRUPT', `Run ${id} has a missing, unsafe, or invalid record. Preserve the state directory and restore it from a stopped-process backup.`);
}

function compareKeys(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Keep the newest page-sized set in a min-heap whose root is the oldest item. */
function retainNewest(heap: Run[], run: Run, limit: number): void {
  if (heap.length < limit) {
    heap.push(run);
    siftUpOldest(heap, heap.length - 1);
    return;
  }
  if (compareKeys(run, heap[0]!) <= 0) return;
  heap[0] = run;
  siftDownOldest(heap, 0);
}

function siftUpOldest(heap: Run[], index: number): void {
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareKeys(heap[index]!, heap[parent]!) >= 0) return;
    [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
    index = parent;
  }
}

function siftDownOldest(heap: Run[], index: number): void {
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let oldest = index;
    if (left < heap.length && compareKeys(heap[left]!, heap[oldest]!) < 0) oldest = left;
    if (right < heap.length && compareKeys(heap[right]!, heap[oldest]!) < 0) oldest = right;
    if (oldest === index) return;
    [heap[index], heap[oldest]] = [heap[oldest]!, heap[index]!];
    index = oldest;
  }
}

function assertDirectory(directory: string, code: string): void {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(directory); } catch (error) { throw asStoreIOError(error, 'Could not access the local run store.'); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new BridgeError('UNSAFE_STORE', 'The local run store contains an unsafe directory path.');
  if ((stat.mode & PRIVATE_MODE_MASK) !== 0) throw new BridgeError('UNSAFE_STORE', 'The local run store directory must not grant group or other users access.');
  void code;
}

function redactEvent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactEvent);
  if (!value || typeof value !== 'object') return redact(value);
  const sensitive = /^(?:prompt|instructions?|content|source|file|absolute.?path|authorization|api.?key|secret|password|request|response|output|input|message|text)$/i;
  const entries = Object.entries(value).map(([key, item]) => {
    if (sensitive.test(key)) return [key, '[OMITTED]'] as const;
    if (key.toLowerCase() === 'path') return [key, safeRelativeAuditPath(item) ? item : '[OMITTED]'] as const;
    return [key, redactEvent(item)] as const;
  });
  return redact(Object.fromEntries(entries));
}

function safeRelativeAuditPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !path.isAbsolute(value) && !value.includes('\\') &&
    !value.includes('\0') && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function assertPrivateDirectory(directory: string, id?: string): void {
  try {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & PRIVATE_MODE_MASK) !== 0) {
      throw new BridgeError('UNSAFE_STORE', 'CPB storage directories must be private, real directories.');
    }
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && id) throw corruptRecord(id);
    throw asStoreIOError(error, 'Could not access the private CPB storage directory.');
  }
}

function assertPrivateRegularFile(file: string): void {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(file); } catch (error) { throw error; }
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & PRIVATE_MODE_MASK) !== 0) {
    throw new BridgeError('UNSAFE_STORE', 'A local run-state file is not a private regular file.');
  }
}

function assertPrivateRegularFd(fd: number): void {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile() || (stat.mode & PRIVATE_MODE_MASK) !== 0) throw new BridgeError('UNSAFE_STORE', 'A local run-state file is not a private regular file.');
}

function syncDirectory(directory: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(directory, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0));
    fs.fsyncSync(fd);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Some filesystems/platforms do not support fsync on directory descriptors.
    // EIO and other real storage errors remain visible to the caller.
    if (!['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'EISDIR', 'EBADF'].includes(code ?? '')) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function openPrivateDatabase(file: string): DatabaseSync {
  try {
    ensurePrivateFile(file);
    return new DatabaseSync(file);
  } catch (error) {
    throw classifyDatabaseError(error);
  }
}

function validateSlotsTable(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(slots)').all() as unknown as Array<{ name: string; type: string; notnull: number; pk: number }>;
  const expected = [
    { name: 'slot', type: 'INTEGER', notnull: 0, pk: 1 },
    { name: 'pid', type: 'INTEGER', notnull: 1, pk: 0 },
    { name: 'id', type: 'TEXT', notnull: 1, pk: 0 },
  ];
  if (columns.length !== expected.length || columns.some((column, index) => {
    const e = expected[index]!;
    return column.name !== e.name || column.type.toUpperCase() !== e.type || column.notnull !== e.notnull || column.pk !== e.pk;
  })) throw new BridgeError('STORE_DATABASE_CORRUPT', 'The scheduler database has an unknown slots table shape. Preserve the state directory and restore it from a backup.');
}

function classifyDatabaseError(error: unknown): BridgeError {
  if (error instanceof BridgeError) return error;
  const err = error as NodeJS.ErrnoException & { errcode?: number };
  const resultCode = typeof err.errcode === 'number' ? err.errcode & 0xff : undefined;
  if (resultCode === 5 || resultCode === 6) return new BridgeError('STORE_LOCKED', 'The local scheduler database is busy. Retry after other CPB processes finish.');
  if (resultCode === 11 || resultCode === 26) return new BridgeError('STORE_DATABASE_CORRUPT', 'The local scheduler database is corrupt or is not a SQLite database. Preserve the state directory and restore it from a backup.');
  if (resultCode === 8 || resultCode === 10 || resultCode === 13 || resultCode === 14 || ['EACCES', 'EPERM', 'ENOSPC', 'EROFS'].includes(err.code ?? '')) {
    return new BridgeError('STORE_IO', 'The local scheduler database could not be accessed safely. Check private directory permissions and available disk space.');
  }
  return new BridgeError('STORE_DATABASE_ERROR', 'The local scheduler database operation failed. Preserve the state directory and inspect its integrity before retrying.');
}

function asStoreIOError(error: unknown, message: string): BridgeError {
  if (error instanceof BridgeError) return error;
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ELOOP') return new BridgeError('UNSAFE_STORE', 'A local run-state path cannot be a symbolic link.');
  return new BridgeError('STORE_IO', message);
}
