import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runProcess } from '../dist/process.js';
import { BridgeError } from '../dist/types.js';

const node = process.execPath;

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'cpb-process-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('captures stdout, stderr, exit code, and bounded streaming lines', async () => {
  const lines = [];
  const result = await runProcess(node, ['-e', "console.log('first'); console.error('warning'); console.log('second'); process.exitCode=7"], { onLine: (line) => lines.push(line) });
  assert.equal(result.stdout, 'first\nsecond\n');
  assert.equal(result.stderr, 'warning\n');
  assert.equal(result.exitCode, 7);
  assert.equal(result.signal, null);
  assert.deepEqual(lines, ['first', 'second']);
});

test('passes stdin byte-for-byte', async () => {
  const input = 'task instructions\nwith exact whitespace  \n';
  const result = await runProcess(node, ['-e', "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(s))"], { input });
  assert.equal(result.stdout, input);
});

test('returns a clear error for a missing executable', async () => {
  await assert.rejects(runProcess('/definitely/not/a/cpb-executable', []), (error) => {
    assert.ok(error instanceof BridgeError);
    assert.equal(error.code, 'MISSING_EXECUTABLE');
    return true;
  });
});

test('terminates the process group when output exceeds its limit', async () => {
  await assert.rejects(runProcess(node, ['-e', "process.stdout.write('x'.repeat(1000000));setInterval(()=>{},1000)"], { maxOutputBytes: 1024 }), (error) => {
    assert.ok(error instanceof BridgeError);
    assert.equal(error.code, 'OUTPUT_LIMIT');
    assert.equal(error.state, 'FAILED');
    return true;
  });
});

test('times out a real process and reaps it', async (t) => {
  const dir = await tempDir(t);
  const pidFile = join(dir, 'pid');
  await assert.rejects(runProcess(node, ['-e', `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`], { timeoutMs: 80 }), (error) => {
    assert.ok(error instanceof BridgeError);
    assert.equal(error.code, 'TIMED_OUT');
    assert.equal(error.state, 'TIMED_OUT');
    return true;
  });
  await assertProcessGone(Number(await readFile(pidFile, 'utf8')));
});

test('cancels a real process and reaps it', async (t) => {
  const dir = await tempDir(t);
  const pidFile = join(dir, 'pid');
  const controller = new AbortController();
  const promise = runProcess(node, ['-e', `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`], { signal: controller.signal });
  await waitForFile(pidFile);
  controller.abort();
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof BridgeError);
    assert.equal(error.code, 'CANCELLED');
    assert.equal(error.state, 'CANCELLED');
    return true;
  });
  await assertProcessGone(Number(await readFile(pidFile, 'utf8')));
});

test('bounds progress callback lines from a real child', async () => {
  const lines = [];
  await runProcess(node, ['-e', "process.stdout.write('x'.repeat(200000)+'\\n')"], { onLine: (line) => lines.push(line) });
  assert.equal(lines.length, 1);
  assert.ok(Buffer.byteLength(lines[0], 'utf8') <= 64 * 1024);
});

test('kills descendants that keep inherited pipes open after leader exit', async (t) => {
  const dir = await tempDir(t);
  const pidFile = join(dir, 'descendant-pid');
  const source = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',\"setInterval(()=>{},1000)\"],{stdio:'inherit'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(c.pid));process.exit(0);`;
  const result = await runProcess(node, ['-e', source], { timeoutMs: 3000 });
  assert.equal(result.exitCode, 0);
  await assertProcessGone(Number(await readFile(pidFile, 'utf8')));
});

test('kills same-group descendants that ignore SIGTERM and close their pipes', async (t) => {
  const dir = await tempDir(t);
  const pidFile = join(dir, 'ignored-term-pid');
  const source = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(c.pid));process.exit(0);`;
  const result = await runProcess(node, ['-e', source], { timeoutMs: 3000 });
  assert.equal(result.exitCode, 0);
  await assertProcessGone(Number(await readFile(pidFile, 'utf8')));
});

async function waitForFile(path) {
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    try { await readFile(path); return; } catch {}
    await delay(10);
  }
  throw new Error(`Child did not create ${path}`);
}

async function assertProcessGone(pid) {
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    try { process.kill(pid, 0); } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    await delay(20);
  }
  assert.fail(`Process ${pid} is still alive`);
}
