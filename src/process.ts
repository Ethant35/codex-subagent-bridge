import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { BridgeError } from './types.js';

const MAX_LINE_BYTES = 64 * 1024;
const KILL_GRACE_MS = 250;

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  input?: string;
  maxOutputBytes?: number;
  onLine?: (line: string) => void;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

/**
 * Run a process in its own POSIX process group and supervise its complete
 * lifetime. Output is capped across stdout and stderr. Progress lines are
 * capped at 64 KiB; an overlong line is reported as a 64 KiB prefix. The
 * process group is the enforcement boundary; a child that deliberately calls
 * setsid() to escape that group is outside this supervisor's guarantee.
 */
export function runProcess(
  command: string,
  args: string[],
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  if (process.platform === 'win32') {
    return Promise.reject(new BridgeError('UNSUPPORTED_PLATFORM', 'Process group supervision requires a POSIX platform.'));
  }
  if (options.signal?.aborted) {
    return Promise.reject(new BridgeError('CANCELLED', 'Process was cancelled before it started.', 'CANCELLED'));
  }

  const maxOutputBytes = options.maxOutputBytes ?? 8 * 1024 * 1024;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 0) {
    return Promise.reject(new BridgeError('INVALID_LIMIT', 'maxOutputBytes must be a non-negative safe integer.'));
  }
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)) {
    return Promise.reject(new BridgeError('INVALID_LIMIT', 'timeoutMs must be a non-negative finite number.'));
  }

  return new Promise<ProcessResult>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(asSpawnError(error, command));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const decoder = new StringDecoder('utf8');
    let lineBuffer = '';
    let lineBytes = 0;
    let discardingLongLine = false;
    let outputBytes = 0;
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let spawnError: Error | undefined;
    let failure: BridgeError | undefined;
    let settled = false;
    let terminationRequested = false;
    let killTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', onAbort);
    };

    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    };

    const terminateGroup = () => {
      terminationRequested = true;
      try {
        signalGroup('SIGTERM');
      } catch {
        // A process may exit between its exit event and group signaling.
      }
      if (!killTimer) {
        killTimer = setTimeout(() => {
          if (settled) return;
          try {
            signalGroup('SIGKILL');
          } catch {
            // The group has already exited.
          }
        }, KILL_GRACE_MS);
        killTimer.unref();
      }
    };

    const failAndTerminate = (error: BridgeError) => {
      if (failure || settled) return;
      failure = error;
      terminateGroup();
    };

    const emitLine = (line: string) => {
      try {
        options.onLine?.(line);
      } catch {
        failAndTerminate(new BridgeError('PROCESS_CALLBACK_FAILED', 'The process output callback failed.'));
      }
    };

    const onAbort = () => failAndTerminate(new BridgeError('CANCELLED', 'Process was cancelled.', 'CANCELLED'));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    // Abort may have raced with listener installation. EventTarget does not
    // replay an abort event to a listener added after the signal was aborted.
    if (options.signal?.aborted) onAbort();
    if (options.timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        failAndTerminate(new BridgeError('TIMED_OUT', `Process exceeded its ${options.timeoutMs} ms runtime limit.`, 'TIMED_OUT'));
      }, options.timeoutMs);
      timeoutTimer.unref();
    }

    const consumeStdoutLines = (chunk: Buffer, final = false) => {
      if (!options.onLine) return;
      const text = decoder.write(chunk) + (final ? decoder.end() : '');
      for (const char of text) {
        if (char === '\n') {
          if (!discardingLongLine) emitLine(lineBuffer.replace(/\r$/, ''));
          lineBuffer = '';
          lineBytes = 0;
          discardingLongLine = false;
          continue;
        }
        if (discardingLongLine) continue;
        lineBuffer += char;
        lineBytes += Buffer.byteLength(char, 'utf8');
        if (lineBytes > MAX_LINE_BYTES) {
          // Emit a bounded prefix and discard the rest of this line.
          const prefix = Buffer.from(lineBuffer, 'utf8').subarray(0, MAX_LINE_BYTES).toString('utf8');
          emitLine(prefix);
          lineBuffer = '';
          lineBytes = 0;
          discardingLongLine = true;
        }
      }
      if (final && lineBuffer && !discardingLongLine) emitLine(lineBuffer.replace(/\r$/, ''));
    };

    const collect = (target: Buffer[], stream: NodeJS.ReadableStream, isStdout: boolean) => {
      stream.on('data', (raw: Buffer | string) => {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        outputBytes += chunk.byteLength;
        if (outputBytes > maxOutputBytes) {
          failAndTerminate(new BridgeError('OUTPUT_LIMIT', `Process output exceeded ${maxOutputBytes} bytes.`));
          return;
        }
        target.push(chunk);
        if (isStdout) consumeStdoutLines(chunk);
      });
      stream.on('error', () => {
        // Child stream closure is handled by the child's close event.
      });
      if (isStdout) stream.on('end', () => consumeStdoutLines(Buffer.alloc(0), true));
    };

    collect(stdoutChunks, child.stdout!, true);
    collect(stderrChunks, child.stderr!, false);
    child.stdin!.on('error', () => {
      // EPIPE is expected when a child exits before consuming all input.
    });

    child.once('error', (error) => { spawnError = error; });
    child.once('exit', (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      // A descendant can inherit stdout/stderr and keep them open after the
      // leader exits. Kill any such process in our private group immediately.
      terminateGroup();
    });
    child.once('close', (code, signal) => {
      if (exitCode === null && code !== null) exitCode = code;
      if (exitSignal === null && signal !== null) exitSignal = signal;
      // close can arrive before the grace timer when descendants closed their
      // pipes, or after the timer was delayed by event-loop load. Finish group
      // cleanup synchronously now, then cancel the timer so it cannot signal a
      // process group whose numeric ID may later be reused.
      if (terminationRequested) {
        try {
          signalGroup('SIGKILL');
        } catch {
          // The group has already exited.
        }
      }
      settled = true;
      cleanup();
      if (spawnError) {
        reject(asSpawnError(spawnError, command));
      } else if (failure) {
        reject(failure);
      } else {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          exitCode,
          signal: exitSignal,
        });
      }
    });

    if (options.input !== undefined) child.stdin!.end(options.input);
    else child.stdin!.end();
  });
}

function asSpawnError(error: unknown, command: string): BridgeError {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT') return new BridgeError('MISSING_EXECUTABLE', `Executable not found: ${command}`);
  return new BridgeError('PROCESS_START_FAILED', `Could not start process: ${command}`);
}
