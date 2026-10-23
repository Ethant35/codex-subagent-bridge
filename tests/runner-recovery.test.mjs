import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { delegate } from '../dist/runner.js';

function fixture(t, behavior = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cpb-runner-recovery-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const state = path.join(root, 'state');
  const id = randomUUID();
  const runDir = path.join(state, 'runs', id);
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(source, 'README.md'), 'original local bytes\n');
  const external = new AbortController();
  let saves = 0;
  let events = 0;
  let acquired = 0;
  let releases = 0;
  let storedRun;
  const store = {
    create(run) { storedRun = run; },
    dir() { return runDir; },
    acquire() {
      if (behavior.queued) return undefined;
      acquired++;
      return () => { releases++; };
    },
    cancelled() {
      if (behavior.pollFault) throw new Error('private store failure detail');
      return false;
    },
    save(run) {
      saves++;
      storedRun = structuredClone(run);
      if (behavior.abortAfterSecondSave && saves === 2) external.abort();
      if (behavior.finalSaveFault && saves === 3) throw new Error('private save path detail');
    },
    event(_id, type, detail) {
      events++;
      if (behavior.finalEventFault && type === 'state' && events === 2) throw new Error('private event path detail');
      if (behavior.abortOnRunningEvent && type === 'state' && detail.state === 'RUNNING') external.abort();
    },
  };
  const task = {
    version: 1, taskId: id, correlationId: randomUUID(), provider: 'openrouter', backend: 'api', model: 'openai/gpt-4.1-mini',
    instructions: 'Do not call a provider during this recovery test.', workspaceRoot: source,
    allowedOperations: ['write_file'], readablePaths: [], writablePaths: ['README.md'], maxRuntimeMs: 5000,
    maxToolSteps: 2, maxSpendUsd: 0.1, expectedOutput: 'Test result', resultFormat: 'text', networkPolicy: 'provider-only',
  };
  return {
    root, source, runDir, id, task, store, external,
    counts: () => ({ saves, events, acquired, releases, storedRun }),
  };
}

test('cancellation polling faults while queued abort safely and release process listeners', async (t) => {
  const f = fixture(t, { queued: true, pollFault: true });
  const beforeTerm = process.listenerCount('SIGTERM');
  const beforeInt = process.listenerCount('SIGINT');
  const run = await delegate(f.task, f.store);
  assert.equal(run.state, 'FAILED');
  assert.equal(run.error.code, 'STORE_CANCEL_CHECK_FAILED');
  assert.equal(f.counts().acquired, 0);
  assert.equal(f.counts().releases, 0);
  assert.equal(f.counts().events, 1);
  assert.equal(process.listenerCount('SIGTERM'), beforeTerm);
  assert.equal(process.listenerCount('SIGINT'), beforeInt);
});

test('final run save failure rejects without success, releases the slot, and retains recovery data', async (t) => {
  const f = fixture(t, { abortAfterSecondSave: true, finalSaveFault: true });
  const beforeTerm = process.listenerCount('SIGTERM');
  const beforeInt = process.listenerCount('SIGINT');
  let error;
  try { await delegate(f.task, f.store, f.external.signal); } catch (caught) { error = caught; }
  assert.equal(error?.code, 'STORE_FINALIZE_FAILED', JSON.stringify(f.counts()));
  assert.equal(f.counts().acquired, 1);
  assert.equal(f.counts().releases, 1);
  assert.equal(fs.existsSync(path.join(f.runDir, 'capability.json')), false);
  assert.equal(fs.readFileSync(path.join(f.runDir, 'workspace', 'README.md'), 'utf8'), 'original local bytes\n');
  assert.equal(fs.readFileSync(path.join(f.runDir, 'originals', 'README.md'), 'utf8'), 'original local bytes\n');
  assert.equal(f.counts().storedRun.state, 'FAILED');
  assert.equal(f.counts().saves, 4); // failure on final save plus the best-effort FAILED-state replacement
  assert.equal(f.counts().events, 1); // provider was not called; no provider events were emitted
  assert.equal(process.listenerCount('SIGTERM'), beforeTerm);
  assert.equal(process.listenerCount('SIGINT'), beforeInt);
});

test('final event failure rejects and records FAILED after the cancelled run save', async (t) => {
  const f = fixture(t, { abortAfterSecondSave: true, finalEventFault: true });
  let error;
  try { await delegate(f.task, f.store, f.external.signal); } catch (caught) { error = caught; }
  assert.equal(error?.code, 'STORE_FINALIZE_FAILED', JSON.stringify(f.counts()));
  assert.equal(f.counts().releases, 1);
  assert.equal(f.counts().storedRun.state, 'FAILED');
  assert.equal(f.counts().saves, 4); // terminal cancellation save, then best-effort FAILED-state replacement
  assert.equal(f.counts().events, 2); // RUNNING event, then the injected final-event fault
  assert.equal(fs.existsSync(path.join(f.runDir, 'capability.json')), false);
  assert.equal(fs.existsSync(path.join(f.runDir, 'workspace', 'README.md')), true);
  assert.equal(fs.existsSync(path.join(f.runDir, 'originals', 'README.md')), true);
});

test('non-ENOENT capability cleanup failure is classified and never returned as success', async (t) => {
  const f = fixture(t, { abortAfterSecondSave: true });
  const originalUnlink = fs.unlinkSync;
  t.after(() => { fs.unlinkSync = originalUnlink; });
  fs.unlinkSync = function (file, ...args) {
    if (String(file).endsWith(`${path.sep}capability.json`)) {
      const error = new Error('private path detail');
      error.code = 'EACCES';
      throw error;
    }
    return originalUnlink.call(this, file, ...args);
  };
  let error;
  try { await delegate(f.task, f.store, f.external.signal); } catch (caught) { error = caught; }
  assert.equal(error?.code, 'CAPABILITY_CLEANUP_FAILED', JSON.stringify(f.counts()));
  assert.equal(f.counts().releases, 1);
  assert.equal(f.counts().storedRun.state, 'FAILED');
  assert.equal(fs.existsSync(path.join(f.runDir, 'workspace', 'README.md')), true);
});
