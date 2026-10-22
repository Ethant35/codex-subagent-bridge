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
export async function delegate(value:unknown,store=new Store(),externalSignal?:AbortSignal):Promise<Run> {
  const task=parseTask(value); // Validation precedes run creation and all provider calls.
  const createdAt=new Date().toISOString();
  const run:Run={id:task.taskId,correlationId:task.correlationId,state:'QUEUED',task,instructionHash:createHash('sha256').update(task.instructions).digest('hex'),pid:process.pid,createdAt,updatedAt:createdAt};
  try{store.create(run);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new BridgeError('DUPLICATE_TASK','Task ID already exists; use a new UUID');throw e;}
  const controller=new AbortController(),deadline=Date.now()+task.maxRuntimeMs;
  const cancel=()=>controller.abort(new BridgeError('CANCELLED','Execution cancelled','CANCELLED'));
  externalSignal?.addEventListener('abort',cancel,{once:true}); if(externalSignal?.aborted)cancel();
  const timeout=setTimeout(()=>controller.abort(new BridgeError('TIMEOUT','Task exceeded its maximum runtime','TIMED_OUT')),task.maxRuntimeMs);
  const polling=setInterval(()=>{if(store.cancelled(run.id))cancel();},50);
  process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
  const checkpoint=()=>{
    if(store.cancelled(run.id))cancel();
    if(Date.now()>=deadline && !controller.signal.aborted)controller.abort(new BridgeError('TIMEOUT','Task deadline reached','TIMED_OUT'));
    controller.signal.throwIfAborted();
  };
  let release:(()=>void)|undefined;
  try {
    while(!(release=store.acquire(run.id)))await delay(50,undefined,{signal:controller.signal});
    checkpoint();run.state='RUNNING';store.save(run);store.event(run.id,'state',{state:'RUNNING'});
    const workspace=path.join(store.dir(run.id),'workspace');run.workspace=workspace;
    const ws=new Workspace(task,workspace);ws.prepare();store.save(run);
    const config:ToolConfig={task,workspace,eventPath:path.join(store.dir(run.id),'events.jsonl'),deadline};
    const configPath=path.join(store.dir(run.id),'capability.json');
    // Capability lives in a private directory; exact instructions are preserved for the subprocess.
    fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600,flag:'wx'});
    const tools=new FileTools(config),ctx={task,workspace,signal:controller.signal,configPath,tools,event:(type:string,detail:unknown)=>store.event(run.id,type,detail)};
    checkpoint();
    const result:ProviderResult=await(task.provider==='openrouter'?runOpenRouter(ctx):runClaude(ctx));
    checkpoint();
    if(fs.existsSync(path.join(store.dir(run.id),'tool-failure')))throw new BridgeError('TOOL_FAILED','A tool operation failed; model output cannot certify completion');
    if(!result.output.trim())throw new BridgeError('EMPTY_RESULT','Child returned no result');
    if(task.resultFormat==='json'){try{JSON.parse(result.output);}catch{throw new BridgeError('INVALID_RESULT','Child result is not valid JSON');}}
    checkpoint();
    run.changedPaths=ws.publish();run.result=result;run.state='COMPLETED';
  } catch(e) {
    const err=controller.signal.aborted?controller.signal.reason:e;
    run.state=err instanceof BridgeError?err.state:'FAILED';
    run.error={code:err instanceof BridgeError?err.code:'EXECUTION_ERROR',message:safeText(err instanceof BridgeError?err.message:'Execution failed; inspect local environment and diagnostics')};
  } finally {
    clearTimeout(timeout);clearInterval(polling);externalSignal?.removeEventListener('abort',cancel);process.removeListener('SIGTERM',cancel);process.removeListener('SIGINT',cancel);
    try{store.save(run);store.event(run.id,'state',{state:run.state,error:run.error});}finally{release?.();}
    // Remove raw instructions/config and plaintext workspace copies after successful work. Failed runs retain staged files for recovery.
    try{fs.unlinkSync(path.join(store.dir(run.id),'capability.json'));}catch{}
    if(run.state==='COMPLETED')fs.rmSync(path.join(store.dir(run.id),'workspace'),{recursive:true,force:true});
  }
  return run;
}
