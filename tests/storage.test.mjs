import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { Store, appendPrivateJSONL, assertPrivateFile, assertPrivateFileDescriptor, ensurePrivateFile } from '../dist/store.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpb-store-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new Store(path.join(root, 'state'));
  const id = randomUUID();
  const correlationId = randomUUID();
  store.create({
    id, correlationId, state: 'COMPLETED',
    task: validTask(id, correlationId, 'private prompt must stay private'),
    instructionHash: 'a'.repeat(64), pid: process.pid,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
  return { root, store, id };
}

function validTask(taskId, correlationId, instructions) {
  return {
    version: 1, taskId, correlationId, provider: 'openrouter', backend: 'api', model: 'openai/gpt-4.1-mini', instructions,
    workspaceRoot: '/tmp/cpb-test-workspace', allowedOperations: ['read_file'], readablePaths: ['README.md'], writablePaths: [],
    maxRuntimeMs: 30000, maxToolSteps: 2, maxSpendUsd: 0.1, expectedOutput: 'test output', resultFormat: 'text', networkPolicy: 'provider-only',
  };
}

test('list reports corrupt run records instead of silently omitting them', (t) => {
  const { store, id } = fixture(t);
  fs.writeFileSync(path.join(store.dir(id), 'run.json'), '{bad json containing prompt-look-alike-secret');
  assert.throws(() => store.list(), (error) => {
    assert.equal(error.code, 'STORE_CORRUPT');
    assert.match(error.message, new RegExp(id));
    assert.doesNotMatch(error.message, /prompt-look-alike-secret/);
    return true;
  });
});

test('run IDs must be canonical UUIDs before any store path is formed', (t) => {
  const { store } = fixture(t);
  assert.throws(() => store.get('a'.repeat(36)), (error) => error.code === 'INVALID_ID');
});

test('persisted owner PID must be a positive safe integer', (t) => {
  const { store, id } = fixture(t);
  const record = JSON.parse(fs.readFileSync(path.join(store.dir(id), 'run.json'), 'utf8'));
  record.state = 'RUNNING';
  record.pid = 0; // kill(pid, 0) tests the caller's process group, not PID zero.
  fs.writeFileSync(path.join(store.dir(id), 'run.json'), JSON.stringify(record));
  assert.throws(() => store.get(id), (error) => error.code === 'STORE_CORRUPT');
});

test('persisted task records are validated without echoing task contents', (t) => {
  const { store, id } = fixture(t);
  const file = path.join(store.dir(id), 'run.json');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  record.task = { version: 1, taskId: id, instructions: 'private stored instruction' };
  fs.writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
  assert.throws(() => store.get(id), (error) => {
    assert.equal(error.code, 'STORE_CORRUPT');
    assert.doesNotMatch(error.message, /private stored instruction/);
    return true;
  });
});

test('existing runs directory must stay private and must not be a symlink', (t) => {
  const { root, store } = fixture(t);
  fs.chmodSync(path.join(store.root, 'runs'), 0o755);
  assert.throws(() => new Store(store.root), (error) => error.code === 'UNSAFE_STORE');
  const linkedRoot = path.join(root, 'linked-state');
  fs.mkdirSync(linkedRoot, { mode: 0o700 });
  fs.symlinkSync(path.join(store.root, 'runs'), path.join(linkedRoot, 'runs'));
  assert.throws(() => new Store(linkedRoot), (error) => error.code === 'UNSAFE_STORE');
});

test('run directory symlink cannot redirect record writes outside the store', (t) => {
  const { root, store, id } = fixture(t);
  const runDir = store.dir(id);
  const run = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8'));
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside, { mode: 0o700 });
  fs.rmSync(runDir, { recursive: true });
  fs.symlinkSync(outside, runDir);
  assert.throws(() => store.save(run), (error) => error.code === 'UNSAFE_STORE');
  assert.equal(fs.existsSync(path.join(outside, 'run.json')), false);
});

test('corrupt scheduler database produces a classified, non-destructive error', (t) => {
  const { store } = fixture(t);
  const dbPath = path.join(store.root, 'scheduler.sqlite');
  fs.writeFileSync(dbPath, 'not a SQLite database', { mode: 0o600 });
  const before = fs.readFileSync(dbPath);
  assert.throws(() => store.acquire(randomUUID()), (error) => error.code === 'STORE_DATABASE_CORRUPT');
  assert.deepEqual(fs.readFileSync(dbPath), before);
});

test('newer scheduler schema is rejected before any mutation', (t) => {
  const { store } = fixture(t);
  const dbPath = path.join(store.root, 'scheduler.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version=99');
  db.close();
  fs.chmodSync(dbPath, 0o600);
  assert.throws(() => store.acquire(randomUUID()), (error) => error.code === 'STORE_VERSION_UNSUPPORTED');
  const check = new DatabaseSync(dbPath, { readOnly: true });
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 99);
  assert.equal(check.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table'").get().count, 0);
  check.close();
});

test('SQLite lock contention has a stable error code', (t) => {
  const { store } = fixture(t);
  const release = store.acquire(randomUUID());
  assert.equal(typeof release, 'function');
  release();
  const dbPath = path.join(store.root, 'scheduler.sqlite');
  const blocker = new DatabaseSync(dbPath);
  blocker.exec('BEGIN EXCLUSIVE');
  try {
    assert.throws(() => store.acquire(randomUUID()), (error) => error.code === 'STORE_LOCKED');
  } finally {
    blocker.exec('ROLLBACK');
    blocker.close();
  }
});

test('records and scheduler schema from the released v1.0.0 Store remain readable and migrate additively', (t) => {
  const { store } = fixture(t);
  const fixtureRoot = new URL('../evidence/readiness/storage-v1.0.0/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', fixtureRoot), 'utf8'));
  const releaseRecords = manifest.records.map(({ file, sha256 }) => {
    const source = new URL(file, fixtureRoot);
    const bytes = fs.readFileSync(source);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
    const run = JSON.parse(bytes.toString('utf8'));
    fs.mkdirSync(store.dir(run.id), { mode: 0o700 });
    fs.copyFileSync(source, path.join(store.dir(run.id), 'run.json'));
    fs.chmodSync(path.join(store.dir(run.id), 'run.json'), 0o600);
    return run;
  });

  const dbPath = path.join(store.root, 'scheduler.sqlite');
  const dbBytes = fs.readFileSync(new URL(manifest.database.file, fixtureRoot));
  assert.equal(createHash('sha256').update(dbBytes).digest('hex'), manifest.database.sha256);
  fs.copyFileSync(new URL(manifest.database.file, fixtureRoot), dbPath);
  fs.chmodSync(dbPath, 0o600);

  for (const expected of releaseRecords) assert.deepEqual(store.get(expected.id), expected);
  const release = store.acquire('33333333-3333-4333-8333-333333333333');
  assert.equal(typeof release, 'function');
  release();
  const migrated = new DatabaseSync(dbPath, { readOnly: true });
  assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, 1);
  migrated.close();
  for (const expected of releaseRecords) assert.deepEqual(store.get(expected.id), expected);
});

test('event and cancellation paths reject symlinks', (t) => {
  const { root, store, id } = fixture(t);
  const outsideEvents = path.join(root, 'outside-events');
  fs.writeFileSync(outsideEvents, 'preserve');
  fs.symlinkSync(outsideEvents, path.join(store.dir(id), 'events.jsonl'));
  assert.throws(() => store.event(id, 'test', { secret: 'local-only' }), (error) => error.code === 'UNSAFE_STORE');
  assert.equal(fs.readFileSync(outsideEvents, 'utf8'), 'preserve');

  const run = store.get(id);
  run.state = 'RUNNING';
  store.save(run);
  const outsideCancel = path.join(root, 'outside-cancel');
  fs.writeFileSync(outsideCancel, 'preserve');
  fs.symlinkSync(outsideCancel, path.join(store.dir(id), 'cancel'));
  assert.throws(() => store.cancel(id), (error) => error.code === 'UNSAFE_STORE');
  assert.equal(fs.readFileSync(outsideCancel, 'utf8'), 'preserve');
});

test('private JSONL helper appends bounded, redacted, fsynced records and rejects unsafe paths', (t) => {
  const { root } = fixture(t);
  const directory = path.join(root, 'private');
  fs.mkdirSync(directory, { mode: 0o700 });
  const file = path.join(directory, 'events.jsonl');
  appendPrivateJSONL(file, {
    type: 'tool_allowed', path: 'src/source.ts', absolutePath: '/private/source.ts', prompt: 'do not persist me',
    detail: { sessionId: 'session-1', instructions: 'private instructions', generationId: 'gen-1', path: '../outside.ts' },
  });
  assertPrivateFile(file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try { assertPrivateFileDescriptor(fd); } finally { fs.closeSync(fd); }
  const event = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(event.path, 'src/source.ts');
  assert.equal(event.absolutePath, '[OMITTED]');
  assert.equal(event.prompt, '[OMITTED]');
  assert.equal(event.detail.instructions, '[OMITTED]');
  assert.equal(event.detail.path, '[OMITTED]');
  assert.equal(event.detail.sessionId, 'session-1');
  assert.equal(event.detail.generationId, 'gen-1');
  assert.throws(() => appendPrivateJSONL(file, { blob: 'x'.repeat(70 * 1024) }), (error) => error.code === 'STORE_LIMIT');

  const linked = path.join(directory, 'linked.jsonl');
  const outside = path.join(root, 'outside.jsonl');
  fs.writeFileSync(outside, 'preserve');
  fs.symlinkSync(outside, linked);
  assert.throws(() => appendPrivateJSONL(linked, { type: 'test' }), (error) => error.code === 'UNSAFE_STORE');
  assert.equal(fs.readFileSync(outside, 'utf8'), 'preserve');
  assert.throws(() => assertPrivateFile(linked), (error) => error.code === 'UNSAFE_STORE');
});

test('ensurePrivateFile creates a mode-0600 file and rejects existing symlinks', (t) => {
  const { root } = fixture(t);
  const directory = path.join(root, 'private');
  fs.mkdirSync(directory, { mode: 0o700 });
  const file = path.join(directory, 'ledger.sqlite');
  ensurePrivateFile(file);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  ensurePrivateFile(file);
  const target = path.join(directory, 'target');
  fs.writeFileSync(target, 'preserve', { mode: 0o600 });
  const link = path.join(directory, 'link');
  fs.symlinkSync(target, link);
  assert.throws(() => ensurePrivateFile(link), (error) => error.code === 'UNSAFE_STORE');
});

test('uppercase UUID spelling remains addressable for existing records', (t) => {
  const { store } = fixture(t);
  const id = 'A1234567-B123-4C23-8D23-E123456789AB';
  const correlationId = randomUUID();
  store.create({ id, correlationId, state: 'COMPLETED', task: validTask(id, correlationId, 'safe'), instructionHash: 'a'.repeat(64), pid: process.pid, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(store.get(id).id, id);
  assert.equal(store.list().some((run) => run.id === id), true);
});

test('list returns bounded stable pages with a lossless cursor walk', (t) => {
  const { store, id: initialId } = fixture(t);
  const expected = [];
  expected.push({ id: initialId, createdAt: store.get(initialId).createdAt });
  for (let i = 0; i < 257; i++) {
    const id = randomUUID();
    const correlationId = randomUUID();
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(i / 2))).toISOString();
    store.create({ id, correlationId, state: 'COMPLETED', task: validTask(id, correlationId, `generated-${i}`), instructionHash: 'a'.repeat(64), pid: process.pid, createdAt, updatedAt: createdAt });
    expected.push({ id, createdAt });
  }
  expected.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const first = store.list({ limit: 31 });
  assert.equal(first.length, 31);
  const walked = [...first];
  while (walked.length < expected.length) {
    const last = walked.at(-1);
    const page = store.list({ limit: 31, before: { createdAt: last.createdAt, id: last.id } });
    assert.ok(page.length > 0 && page.length <= 31);
    walked.push(...page);
  }
  assert.deepEqual(walked.map(({ id, createdAt }) => ({ id, createdAt })), expected);
  assert.throws(() => store.list({ limit: 0 }), (error) => error.code === 'INVALID_LIMIT');
  assert.throws(() => store.list({ limit: 1001 }), (error) => error.code === 'INVALID_LIMIT');
});

test('scheduler reserves exactly two slots and reuses a released slot', (t) => {
  const { store } = fixture(t);
  const releaseFirst = store.acquire(randomUUID());
  const releaseSecond = store.acquire(randomUUID());
  assert.equal(typeof releaseFirst, 'function');
  assert.equal(typeof releaseSecond, 'function');
  assert.equal(store.acquire(randomUUID()), undefined);
  releaseFirst();
  const releaseThird = store.acquire(randomUUID());
  assert.equal(typeof releaseThird, 'function');
  assert.equal(store.acquire(randomUUID()), undefined);
  releaseSecond();
  releaseThird();
  const releaseReused = store.acquire(randomUUID());
  assert.equal(typeof releaseReused, 'function');
  releaseReused();
});

test('run record FIFO is rejected promptly in a child process', (t) => {
  const { store, id } = fixture(t);
  const file = path.join(store.dir(id), 'run.json');
  fs.unlinkSync(file);
  const fifo = spawnSync('/usr/bin/mkfifo', [file], { encoding: 'utf8', timeout: 2000 });
  assert.equal(fifo.status, 0, fifo.stderr);
  const source = `import { Store } from ${JSON.stringify(new URL('../dist/store.js', import.meta.url).href)}; try { new Store(process.argv[1]).get(process.argv[2]); process.exitCode=4; } catch (error) { if (error.code !== 'STORE_CORRUPT' && error.code !== 'UNSAFE_STORE') process.exitCode=5; }`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source, store.root, id], { encoding: 'utf8', timeout: 2000 });
  assert.equal(child.error?.code, undefined);
  assert.equal(child.status, 0, child.stderr);
});
