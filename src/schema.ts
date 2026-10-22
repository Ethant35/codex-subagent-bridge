import { z } from 'zod';
import path from 'node:path';
import { BridgeError, type Task } from './types.js';
const relativeFile = z.string().min(1).max(1024).refine(p => !path.isAbsolute(p) && !p.includes('\\') && !p.includes('\0') && p.split('/').every(s => s && s !== '.' && s !== '..' && !s.startsWith('.git') && s !== '.claude' && s !== '.codex'), 'Use explicit relative file paths without traversal or configuration directories');
export const taskSchema = z.object({
  version: z.literal(1), taskId: z.string().uuid(), correlationId: z.string().min(1).max(256),
  provider: z.enum(['openrouter', 'claude']), backend: z.enum(['api','sdk','cli']),
  model: z.string().trim().min(1).max(200).refine(v => !v.startsWith('-') && !v.startsWith('@') && !v.includes('openrouter/auto')),
  instructions: z.string().min(1).max(100_000).refine(v => v.trim().length > 0),
  workspaceRoot: z.string().refine(path.isAbsolute, 'Workspace must be absolute'),
  allowedOperations: z.array(z.enum(['read_file','write_file','list_files'])).max(3),
  readablePaths: z.array(relativeFile).max(1000), writablePaths: z.array(relativeFile).max(1000),
  maxRuntimeMs: z.number().int().min(1).max(3_600_000), maxToolSteps: z.number().int().min(1).max(1000),
  maxSpendUsd: z.number().finite().nonnegative().max(1000).nullable(),
  expectedOutput: z.string().trim().min(1).max(10_000), resultFormat: z.enum(['text','json']),
  networkPolicy: z.literal('provider-only'), credentialMode: z.enum(['api-key','subscription']).optional()
}).strict().superRefine((t,ctx) => {
  if ((t.provider === 'openrouter') !== (t.backend === 'api')) ctx.addIssue({code:'custom',message:'Provider/backend mismatch'});
  if (t.writablePaths.length && !t.allowedOperations.includes('write_file')) ctx.addIssue({code:'custom',message:'Writable paths require write_file'});
  if (new Set(t.allowedOperations).size !== t.allowedOperations.length) ctx.addIssue({code:'custom',message:'Duplicate operations'});
  if (t.provider === 'claude' && !t.credentialMode) ctx.addIssue({code:'custom',message:'Claude requires explicit credentialMode'});
});
export function parseTask(value: unknown): Task {
  const result = taskSchema.safeParse(value);
  if (!result.success) throw new BridgeError('INVALID_TASK', 'Invalid task envelope: ' + result.error.issues.map(i => `${i.path.join('.') || 'task'}: ${i.message}`).join('; '));
  return result.data;
}
