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
  reviewBeforeApply:z.boolean().optional(),
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
    ...(value.reviewBeforeApply!==undefined?{reviewBeforeApply:value.reviewBeforeApply}:{}),
    expectedOutput:'Complete the requested task using only authorized files.',resultFormat:'text',networkPolicy:'provider-only',
  });
  const validation=validateLocalTask(task);
  const next=validation.credentialStatus==='missing'
    ? `Credential ${validation.credentialSource} is missing. Make it available in the process environment that launches Codex, then run cpb doctor --provider ${task.provider} --human and prepare the task again. No inference has run.`
    : 'Review the exact paths and instructions. Obtain explicit user consent to a finite maxSpendUsd before calling cpb_delegate. No inference has run.';
  return {task,validation,next};
}
export const shellQuote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
function credentialSetup(source:string):string {
  return `In zsh: read -rs '${source}?API key: '; echo; export ${source}`;
}
function nextSteps(task:Task,taskFile:string,validation:ReturnType<typeof validateLocalTask>,extra:string[]=[]):string {
  const validate=`cpb validate --task-file ${shellQuote(taskFile)} --human`;
  const doctor=`cpb doctor --provider ${task.provider} --human`;
  const run=`cpb run --task-file ${shellQuote(taskFile)} --max-spend 0.02 --consent-spend`;
  const lines:string[]=[];
  if(validation.credentialStatus==='missing'){
    lines.push(`Credential ${validation.credentialSource} is missing. Make it available in the shell that runs cpb. For MCP, launch Codex from that shell.`,credentialSetup(validation.credentialSource),doctor,validate,...extra);
    return lines.join('\n');
  }
  if(task.provider==='claude'&&task.credentialMode==='subscription')return `Claude subscription delegation is blocked. Use an explicit API-key task (experimental) and ${doctor}.`;
  if(validation.credentialStatus==='unverified')lines.push(`Credential source ${validation.credentialSource} is not verified by offline validation. Check it before running a task:`,doctor);
  lines.push(...extra,validate,run);
  return lines.join('\n');
}
export function saveTask(input:z.input<typeof prepareSchema>,file:string) {
  const prepared=prepareTask(input),taskFile=path.resolve(file);
  const relative=path.relative(prepared.task.workspaceRoot,taskFile);
  if([...prepared.task.readablePaths,...prepared.task.writablePaths].includes(relative))throw new BridgeError('TASK_PATH_CONFLICT','Task output must not replace an authorized source file');
  fs.writeFileSync(taskFile,JSON.stringify(prepared.task,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {taskFile,...prepared,next:nextSteps(prepared.task,taskFile,prepared.validation)};
}
export function start(directory:string,model?:string) {
  const absolute=path.resolve(directory),taskFile=path.join(absolute,'task.json');
  if(!fs.existsSync(absolute))createSample(absolute,model);
  else if(!fs.existsSync(taskFile))throw new BridgeError('START_DIRECTORY_NOT_READY','This directory has no task.json. Use cpb task for an existing project, or cpb start with a new directory. Existing files were preserved.');
  const task=readTaskFile(taskFile),validation=validateLocalTask(task);
  return {
    directory:absolute,taskFile,validation,
    prerequisites:{node:process.version,platform:process.platform,architecture:process.arch,qualified:process.platform==='darwin'&&process.arch==='arm64'&&process.version==='v22.13.1'},
    next:nextSteps(task,taskFile,validation),
    optionalConnect:`cpb connect --directory ${shellQuote(absolute)}`,
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
  if(typeof v.node==='string'&&typeof v.platform==='string'&&typeof v.integration==='string'){
    lines.push('Codex Subagent Bridge checks',`Runtime: Node ${v.node} on ${v.platform}`,`Supported runtime: ${v.supported?'yes':'no'}`,`Qualified environment: ${v.qualifiedEnvironment?'yes':'no'}`,`Integration: ${v.integration}`);
    if(v.openrouter){
      const present=v.openrouter.apiKeyPresent===true;
      lines.push(`OpenRouter API key: ${present?'present':'missing'} (${v.openrouter.status??'unknown'})`);
      lines.push('Key presence does not verify that it is valid.');
      if(!present)lines.push(credentialSetup('OPENROUTER_API_KEY'),'Next: rerun cpb doctor --provider openrouter --human. For MCP, launch Codex from this shell.');
    }
    if(v.claude){
      lines.push(`Claude API key: ${v.claude.configuredCredentialNames?.includes('ANTHROPIC_API_KEY')?'present':'missing'}. Presence does not verify access; subscription login is separate.`);
      lines.push(`Claude SDK: ${v.claude.sdk?.available?'available':'unavailable'}; setup validated: ${v.claude.sdkSetup?.validated?'yes':'no'}`,
        `Claude CLI: ${v.claude.cli?.available?'available':'not found'}`,
        `Claude CLI login: ${v.claude.auth?.loggedIn===true?'logged in':v.claude.auth?.loggedIn===false?'not logged in':'unverified'}`);
      if(v.claude.configuredCredentialNames?.length)lines.push(`Configured credential names: ${v.claude.configuredCredentialNames.join(', ')}`);
      for(const warning of v.claude.warnings??[])lines.push(`Warning: ${warning}`);
    }
    if(v.claude)lines.push('Claude API-key adapters: experimental; live inference unverified. Subscription delegation: blocked.');
    lines.push('No model inference was performed.');
    return lines.map(printable).join('\n')+'\n';
  }
  if(Array.isArray(v.changes)&&typeof v.reviewToken==='string'){
    lines.push(`Review ${v.id}: ${v.changes.length} changed file(s). No proposal has been applied.`,
      'Private file contents follow. Text is shown as JSON strings to expose whitespace and control characters.');
    for(const change of v.changes){
      lines.push(`File: ${JSON.stringify(change.path)}${change.conflict?' [CONFLICT]':''}`,`Encoding: ${change.encoding}`,
        `Before: ${JSON.stringify(change.before)}`,`After: ${JSON.stringify(change.after)}`);
    }
    if(v.changes.some((change:any)=>change.conflict))lines.push('Project files changed. Apply will refuse; discard and prepare a new task.');
    lines.push(`Apply: cpb apply ${v.id} --review-token ${v.reviewToken}`,`Discard: cpb discard ${v.id}`);
    return lines.map(printable).join('\n')+'\n';
  }
  if(v.review){const t=v.review;lines.push(`Provider: ${t.provider}; model: ${t.model}`,`Workspace: ${t.workspaceRoot}`,`Read: ${t.readablePaths.join(', ')||'(none)'}`,`Write: ${t.writablePaths.join(', ')||'(none)'}`,`Application cap: ${t.maxSpendUsd??'unbounded'} USD`,`Instructions: ${t.instructions}`,`File changes: ${t.reviewBeforeApply?'review before apply':'automatic publication after success'}`);}
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
    if(v.state==='AWAITING_REVIEW'){
      if(Array.isArray(v.proposedPaths))lines.push(`Proposed files: ${v.proposedPaths.join(', ')||'(none)'}`);
      lines.push('No project files changed.',`Review: cpb review ${v.id}`,`Discard: cpb discard ${v.id}`);
    }
    else if(!['COMPLETED','DISCARDED'].includes(v.state))lines.push(`Recovery: cpb recovery ${v.id} --human`,'Do not repeat a failed request until you inspect its state and possible charges.');
  } else if(v.configPath){
    lines.push(v.applied?'Project MCP configuration saved.':v.alreadyConfigured?'Project MCP configuration is current.':'Project MCP configuration preview:',v.configPath);
    if(!v.applied&&!v.alreadyConfigured)lines.push(v.config);
    if(v.next)lines.push(v.next);
  } else if(v.validation){
    const check=v.validation;
    lines.push(`Task ready: ${v.taskFile??v.task?.taskId}`,'Local validation passed. No network requests or charges.',
      `Files: ${check.readableFiles} readable, ${check.writableFiles} writable.`,
      `Credentials: ${check.credentialSource} ${check.credentialStatus}. Presence does not verify access.`);
    if(v.prerequisites)lines.push(`Runtime: ${v.prerequisites.node} ${v.prerequisites.platform}/${v.prerequisites.architecture}. ${v.prerequisites.qualified?'Qualified platform.':'This runtime is not release-qualified.'}`);
    lines.push('Next:',v.next);
    if(v.optionalConnect)lines.push(`Optional Codex connection: ${v.optionalConnect}`);
  } else if(v.valid){lines.push('Local validation passed. No network requests or charges.',`Credentials: ${v.credentialSource} ${v.credentialStatus}.`,`Spending in envelope: ${v.spendingEnabled?'enabled':'disabled'}.`);}
  else if(!v.error&&!v.review)lines.push(JSON.stringify(v,null,2));
  if(v.action)lines.push(v.action);
  return lines.map(printable).join('\n')+'\n';
}
