import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {parseTask} from './schema.js';
import type {Store} from './store.js';
import {readPrivateFile} from './private-files.js';
import {readFileSafe,checkedPath} from './workspace.js';
import {BridgeError,type Task} from './types.js';

export function readTaskFile(file:string):Task {
  const absolute=path.resolve(file),root=fs.realpathSync(path.dirname(absolute));
  const data=readFileSafe(root,path.basename(absolute));
  if(data.length>200_000)throw new BridgeError('TASK_LIMIT','Task file exceeds 200 KB');
  let value:unknown;try{value=JSON.parse(data.toString('utf8'));}catch{throw new BridgeError('INVALID_TASK','Task file must contain valid JSON');}
  return parseTask(value);
}
export function validateLocalTask(task:Task) {
  if(fs.realpathSync(task.workspaceRoot)!==task.workspaceRoot||!fs.statSync(task.workspaceRoot).isDirectory())throw new BridgeError('INVALID_WORKSPACE','Use a canonical existing workspace directory');
  let bytes=0;
  for(const p of new Set([...task.readablePaths,...task.writablePaths])){
    try{bytes+=readFileSafe(task.workspaceRoot,p).length;}catch(e){
      if((e as NodeJS.ErrnoException).code==='ENOENT'){
        if(task.writablePaths.includes(p)){checkedPath(task.workspaceRoot,p,true);continue;}
        if(task.readablePaths.includes(p))throw new BridgeError('NOT_FOUND',`Authorized input "${p}" was not found. Check that relative path or create the file before retrying.`);
      }
      throw e;
    }
  }
  if(bytes>8_000_000)throw new BridgeError('WORKSPACE_LIMIT','Authorized snapshot exceeds 8 MB');
  const subscription=task.provider==='claude'&&task.credentialMode==='subscription';
  const credentialSource=subscription?'subscription-login':task.provider==='openrouter'?'OPENROUTER_API_KEY':'ANTHROPIC_API_KEY';
  const credentialPresent=subscription?null:!!process.env[credentialSource];
  return {
    valid:true,taskId:task.taskId,provider:task.provider,backend:task.backend,
    authorizedBytes:bytes,readableFiles:task.readablePaths.length,writableFiles:task.writablePaths.length,
    spendingEnabled:task.maxSpendUsd!==0,credentialSource,credentialPresent,
    credentialStatus:subscription?'unverified':credentialPresent?'present':'missing',networkRequests:0,
    ...(subscription?{delegationStatus:'blocked',action:'Claude subscription delegation is blocked pending provider approval. Use an explicit API-key task (experimental).'}:{}),
  };
}
export function createSample(directory:string,model='deepseek/deepseek-v4.1-flash-1017') {
  const target=path.resolve(directory);let workspace=target;
  const task:Task={
    version:1,taskId:randomUUID(),correlationId:randomUUID(),provider:'openrouter',backend:'api',model,
    instructions:'Use read_file to read fact.txt. Return its exact contents.',workspaceRoot:workspace,
    allowedOperations:['read_file'],readablePaths:['fact.txt'],writablePaths:[],
    maxRuntimeMs:60_000,maxToolSteps:4,maxSpendUsd:0,
    expectedOutput:'Exact fact.txt contents',resultFormat:'text',networkPolicy:'provider-only',
  };
  parseTask(task);fs.mkdirSync(target,{mode:0o700});workspace=fs.realpathSync(target);task.workspaceRoot=workspace;
  fs.writeFileSync(path.join(workspace,'fact.txt'),'This is safe sample data.\n',{mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(workspace,'task.json'),JSON.stringify(task,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {directory:workspace,taskFile:path.join(workspace,'task.json'),maxSpendUsd:0,next:'Run cpb validate --task-file <taskFile>. Set an explicit spending cap and provide credentials before delegate.'};
}
const safeCode=(value:unknown)=>typeof value==='string'&&/^[A-Z_]{1,64}$/.test(value)?value:'UNKNOWN';
export function diagnostics(store:Store|undefined,id?:string) {
  const environment={node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),formatVersion:1};
  if(!id)return {environment,privacy:'No prompts, file contents, paths, outputs, or credentials are included.'};
  if(!store)throw new BridgeError('STORE_IO','A run store is required to diagnose a specific run.');
  const run=store.get(id);
  const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
  const usage=run.result?.usage?{inputTokens:number(run.result.usage.inputTokens),outputTokens:number(run.result.usage.outputTokens),costUsd:number(run.result.usage.costUsd)}:null;
  return {
    environment,
    run:{
      id:run.id,state:run.state,
      provider:['openrouter','claude'].includes(run.task.provider)?run.task.provider:'unknown',
      backend:['api','sdk','cli'].includes(run.task.backend)?run.task.backend:'unknown',
      createdAt:run.createdAt,updatedAt:run.updatedAt,errorCode:run.error?safeCode(run.error.code):null,
      changedFileCount:Array.isArray(run.changedPaths)?run.changedPaths.length:0,usage,
    },
    privacy:'No prompts, file contents, paths, outputs, or credentials are included.',
  };
}
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const journalSchema=z.object({version:z.literal(1),taskId:z.string().uuid(),state:z.enum(['PREPARED','PUBLISHING','COMPLETED','INTERRUPTED']),files:z.array(z.object({path:z.string(),beforeHash:hex.nullable(),afterHash:hex,status:z.enum(['pending','published'])}).strict()).max(1000)}).strict();
export function recovery(store:Store,id:string) {
  const run=store.get(id);
  if(['QUEUED','RUNNING'].includes(run.state))throw new BridgeError('RUN_ACTIVE','Wait for the run to stop before inspecting recovery');
  if(run.state==='AWAITING_REVIEW')return {id,state:run.state,recovery:'PENDING_REVIEW',modified:false,message:`No proposal has been applied. Use cpb review ${id}, then apply with its token or discard.`};
  const dir=store.dir(id),file=path.join(dir,'publication.json');
  if(!fs.existsSync(file))return {id,state:run.state,recovery:'NO_JOURNAL',message:'No publication journal exists. Legacy runs may have unknown partial changes. Inspect source and retained workspace manually.'};
  let journal:z.infer<typeof journalSchema>;
  try{journal=journalSchema.parse(JSON.parse(readPrivateFile(file,2_000_000)));}catch{throw new BridgeError('RECOVERY_CORRUPT','Publication journal is unreadable or invalid; preserve the store for investigation');}
  if(journal.taskId!==id)throw new BridgeError('RECOVERY_CORRUPT','Publication journal does not match the run');
  const files=journal.files.map(item=>{
    if(!run.task.writablePaths.includes(item.path))throw new BridgeError('RECOVERY_CORRUPT','Journal contains a file outside the write capability');
    let current:string|null=null,observed='unreadable';
    try{try{current=hash(readFileSafe(run.task.workspaceRoot,item.path));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      observed=current===item.beforeHash?'original':current===item.afterHash?'published':'diverged';
    }catch{observed='unreadable';}
    const originals=path.join(dir,'originals');let backupValid=false;
    if(item.beforeHash!==null){try{backupValid=hash(readFileSafe(originals,item.path))===item.beforeHash;}catch{backupValid=false;}}
    return {path:item.path,recorded:item.status,observed,originallyExisted:item.beforeHash!==null,backupValid,backup:backupValid?path.join(originals,item.path):null};
  });
  return {id,state:run.state,publicationState:journal.state,files,modified:false,message:'Inspection only. Preserve the store, compare current files, then restore valid originals explicitly. Never overwrite diverged files automatically.'};
}
