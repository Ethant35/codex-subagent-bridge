import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {parseTask} from './schema.js';
import {createSample,readTaskFile,validateLocalTask} from './local-commands.js';
import {BridgeError,type Task} from './types.js';

export const prepareSchema=z.object({
  directory:z.string().min(1),instructions:z.string().min(1).max(100_000),
  readablePaths:z.array(z.string()).max(1000).default([]),
  writablePaths:z.array(z.string()).max(1000).default([]),
  model:z.string().default('deepseek/deepseek-v4.1-flash-1017'),
}).strict();
export function prepareTask(input:z.input<typeof prepareSchema>) {
  const value=prepareSchema.parse(input);
  const task=parseTask({
    version:1,taskId:randomUUID(),correlationId:randomUUID(),provider:'openrouter',backend:'api',
    model:value.model,instructions:value.instructions,workspaceRoot:fs.realpathSync(value.directory),
    readablePaths:[...new Set(value.readablePaths)],writablePaths:[...new Set(value.writablePaths)],
    allowedOperations:[...(value.readablePaths.length?['read_file']:[]),...(value.writablePaths.length?['write_file']:[])],
    maxRuntimeMs:60_000,maxToolSteps:8,maxSpendUsd:0,
    expectedOutput:'Complete the requested task using only authorized files.',resultFormat:'text',networkPolicy:'provider-only',
  });
  return {task,validation:validateLocalTask(task),next:'Review the exact paths and instructions. Obtain explicit user consent to a finite maxSpendUsd before calling cpb_delegate. No inference has run.'};
}
export const shellQuote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
export function saveTask(input:z.input<typeof prepareSchema>,file:string) {
  const prepared=prepareTask(input),taskFile=path.resolve(file);
  const relative=path.relative(prepared.task.workspaceRoot,taskFile);
  if([...prepared.task.readablePaths,...prepared.task.writablePaths].includes(relative))throw new BridgeError('TASK_PATH_CONFLICT','Task output must not replace an authorized source file');
  fs.writeFileSync(taskFile,JSON.stringify(prepared.task,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {taskFile,...prepared,next:`cpb validate --task-file ${shellQuote(taskFile)}\ncpb run --task-file ${shellQuote(taskFile)} --max-spend 0.02 --consent-spend`};
}
export function start(directory:string,model?:string) {
  const absolute=path.resolve(directory),taskFile=path.join(absolute,'task.json');
  if(!fs.existsSync(absolute))createSample(absolute,model);
  const task=readTaskFile(taskFile),validation=validateLocalTask(task);
  return {
    directory:absolute,taskFile,validation,
    prerequisites:{node:process.version,platform:process.platform,architecture:process.arch,qualified:process.platform==='darwin'&&process.arch==='arm64'&&process.version==='v22.13.1'},
    next:`cpb connect --directory ${shellQuote(absolute)}\ncpb run --task-file ${shellQuote(taskFile)} --max-spend 0.02 --consent-spend`,
  };
}
export function consentedTask(task:Task,cap:string|undefined,consent:boolean):Task {
  if(!consent||cap===undefined)throw new BridgeError('SPEND_CONSENT_REQUIRED','Run requires --max-spend USD and --consent-spend. Each invocation starts a new paid task. Validate first with cpb validate --task-file FILE.');
  const value=Number(cap);
  if(!cap.trim()||!Number.isFinite(value)||value<=0||value>1000)throw new BridgeError('INVALID_SPEND','--max-spend must be a finite number greater than 0 and no more than 1000 USD');
  return parseTask({...task,taskId:randomUUID(),correlationId:randomUUID(),maxSpendUsd:value});
}
// Human output never interprets terminal controls supplied by a model, path, or error.
const printable=(value:unknown)=>String(value??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);
export function humanOutput(value:unknown):string {
  const v=value as Record<string,any>;
  const lines:string[]=[];
  if(v.review){const t=v.review;lines.push(`Provider: ${t.provider}; model: ${t.model}`,`Workspace: ${t.workspaceRoot}`,`Read: ${t.readablePaths.join(', ')||'(none)'}`,`Write: ${t.writablePaths.join(', ')||'(none)'}`,`Application cap: ${t.maxSpendUsd??'unbounded'} USD`,`Instructions: ${t.instructions}`);}
  if(Array.isArray(v)){
    if(!v.length)return 'No runs yet. Start with cpb start --directory ./cpb-example\n';
    return v.map(r=>`${r.id}  ${r.state}  ${r.task?.provider??''}`).map(printable).join('\n')+'\n';
  }
  if(v.error){lines.push(`${v.error.code}: ${v.error.message}`);}
  if(v.publicationState||v.recovery){
    lines.push(`Recovery for ${v.id}: ${v.publicationState??v.recovery}`,v.message);
    for(const f of v.files??[])lines.push(`${f.path}: ${f.observed}; valid original backup: ${f.backupValid?'yes':'no'}${f.backup?' ('+f.backup+')':''}`);
  } else if(v.state){
    lines.push(`Run ${v.id}: ${v.state}`);
    if(v.result){lines.push(v.result.output,`Reported cost: ${v.result.usage?.costUsd??'unknown'} USD`);}
    if(v.changedPaths?.length)lines.push(`Changed files: ${v.changedPaths.join(', ')}`);
    lines.push(`Inspect: cpb inspect ${v.id} --human`);
    if(v.state!=='COMPLETED')lines.push(`Recovery: cpb recovery ${v.id} --human`,'Do not repeat a failed request until you inspect its state and possible charges.');
  } else if(v.configPath){
    lines.push(v.applied?'Project MCP configuration saved.':v.alreadyConfigured?'Project MCP configuration is current.':'Project MCP configuration preview:',v.configPath);
    if(!v.applied&&!v.alreadyConfigured)lines.push(v.config);
    if(v.next)lines.push(v.next);
  } else if(v.validation){
    const check=v.validation;
    lines.push(`Task ready: ${v.taskFile??v.task?.taskId}`,'Local validation passed. No network requests or charges.',
      `Files: ${check.readableFiles} readable, ${check.writableFiles} writable.`,
      `Credentials: ${check.credentialSource} ${check.credentialStatus}. Presence does not verify access.`);
    if(check.credentialStatus==='missing')lines.push('Load the key into the launching process environment, then run validate again.');
    if(v.prerequisites)lines.push(`Runtime: ${v.prerequisites.node} ${v.prerequisites.platform}/${v.prerequisites.architecture}. ${v.prerequisites.qualified?'Qualified platform.':'This runtime is not release-qualified.'}`);
    lines.push('Next:',v.next);
  } else if(v.valid){lines.push('Local validation passed. No network requests or charges.',`Credentials: ${v.credentialSource} ${v.credentialStatus}.`,`Spending in envelope: ${v.spendingEnabled?'enabled':'disabled'}.`);}
  else if(!v.error&&!v.review)lines.push(JSON.stringify(v,null,2));
  return lines.map(printable).join('\n')+'\n';
}
