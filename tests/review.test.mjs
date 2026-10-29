// Synthetic offline tests. No provider request leaves this process.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Store} from '../dist/store.js';
import {Workspace} from '../dist/workspace.js';
import {delegate} from '../dist/runner.js';
import {saveProposal,reviewChanges,applyChanges,discardChanges} from '../dist/review.js';
import {recovery} from '../dist/local-commands.js';
import {humanOutput,prepareTask} from '../dist/guided.js';
import {parseTask} from '../dist/schema.js';
import {validateClaudeCredentials} from '../dist/providers/claude.js';

const cli=path.resolve('dist/cli.js');
const sha=data=>createHash('sha256').update(data).digest('hex');
function fixture(t,{seed=true,review=true}={}){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-review-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'source');fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,'a.txt'),'original\n',{mode:0o640});
  fs.writeFileSync(path.join(source,'untouched.txt'),'not authorized\n');
  const store=new Store(path.join(root,'state'));
  const task=parseTask({version:1,taskId:randomUUID(),correlationId:randomUUID(),provider:'openrouter',backend:'api',model:'test/review-model',instructions:'Write approved files only.',workspaceRoot:source,allowedOperations:['write_file'],readablePaths:[],writablePaths:['a.txt','new.txt'],maxRuntimeMs:10000,maxToolSteps:4,maxSpendUsd:0.02,expectedOutput:'Done',resultFormat:'text',networkPolicy:'provider-only',...(review?{reviewBeforeApply:true}:{})});
  const id=task.taskId,dir=store.dir(id);
  if(seed){
    const now=new Date().toISOString();
    const run={id,correlationId:task.correlationId,state:'AWAITING_REVIEW',task,instructionHash:sha(task.instructions),pid:process.pid,createdAt:now,updatedAt:now,result:{output:'Proposed',usage:{inputTokens:1,outputTokens:1,costUsd:0}},changedPaths:[]};
    store.create(run);
    const ws=new Workspace(task,path.join(dir,'workspace'));ws.prepare();
    fs.writeFileSync(path.join(ws.root,'a.txt'),'proposed\n');fs.writeFileSync(path.join(ws.root,'new.txt'),'new\n');saveProposal(ws);
  }
  const env={...process.env,CPB_HOME:store.root};
  for(const key of Object.keys(env))if(/OPENROUTER|ANTHROPIC|CLAUDE|CPB_LIVE/.test(key))delete env[key];
  return {root,source,store,task,id,dir,run:args=>spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:10000})};
}
const unchanged=f=>{assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'original\n');assert.equal(fs.existsSync(path.join(f.source,'new.txt')),false);assert.equal(fs.readFileSync(path.join(f.source,'untouched.txt'),'utf8'),'not authorized\n');};

test('review survives restart, shows exact bytes, and does not write project or store',t=>{
  const f=fixture(t),before=fs.readFileSync(path.join(f.dir,'run.json'));
  const result=f.run(['review',f.id,'--json']);assert.equal(result.status,0,result.stdout);
  const view=JSON.parse(result.stdout);assert.equal(view.changes.length,2);assert.equal(view.changes[0].before,'original\n');assert.equal(view.changes[0].after,'proposed\n');assert.equal(view.changes[1].before,null);assert.equal(view.modified,false);
  assert.deepEqual(fs.readFileSync(path.join(f.dir,'run.json')),before);unchanged(f);
  assert.equal(fs.statSync(path.join(f.dir,'proposal.json')).mode&0o777,0o600);
  assert.equal(fs.existsSync(path.join(f.dir,'capability.json')),false);
});
test('apply requires the reviewed token and writes only authorized files once',t=>{
  const f=fixture(t),view=reviewChanges(f.store,f.id);
  assert.throws(()=>applyChanges(f.store,f.id),{code:'REVIEW_REQUIRED'});
  assert.throws(()=>applyChanges(f.store,f.id,'0'.repeat(64)),{code:'REVIEW_CHANGED'});unchanged(f);
  const result=f.run(['apply',f.id,'--review-token',view.reviewToken,'--json']);assert.equal(result.status,0,result.stdout);
  assert.equal(JSON.parse(result.stdout).state,'COMPLETED');
  assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'proposed\n');assert.equal(fs.readFileSync(path.join(f.source,'new.txt'),'utf8'),'new\n');
  assert.equal(fs.statSync(path.join(f.source,'a.txt')).mode&0o777,0o640);assert.equal(fs.statSync(path.join(f.source,'new.txt')).mode&0o777,0o600);
  assert.equal(fs.readFileSync(path.join(f.source,'untouched.txt'),'utf8'),'not authorized\n');
  assert.equal(fs.existsSync(path.join(f.dir,'workspace')),false);assert.equal(fs.existsSync(path.join(f.dir,'originals')),false);
  assert.throws(()=>applyChanges(f.store,f.id,view.reviewToken),{code:'REVIEW_NOT_PENDING'});
});
test('discard removes the staged copy and keeps project bytes unchanged',t=>{
  const f=fixture(t),r=f.run(['discard',f.id,'--json']);assert.equal(r.status,0,r.stdout);assert.equal(JSON.parse(r.stdout).state,'DISCARDED');unchanged(f);
  assert.equal(fs.existsSync(path.join(f.dir,'workspace')),false);assert.equal(fs.existsSync(path.join(f.dir,'originals')),false);
  assert.throws(()=>applyChanges(f.store,f.id,'0'.repeat(64)),{code:'REVIEW_NOT_PENDING'});
});
for(const name of ['a.txt','new.txt'])test(`conflicting ${name} refuses all writes and remains reviewable`,t=>{
  const f=fixture(t),view=reviewChanges(f.store,f.id);fs.writeFileSync(path.join(f.source,name),'user edit\n');
  assert.equal(reviewChanges(f.store,f.id).changes.find(c=>c.path===name).conflict,true);
  assert.throws(()=>applyChanges(f.store,f.id,view.reviewToken),{code:'WRITE_CONFLICT'});
  assert.equal(fs.readFileSync(path.join(f.source,name),'utf8'),'user edit\n');assert.equal(f.store.get(f.id).state,'AWAITING_REVIEW');assert.equal(fs.existsSync(path.join(f.dir,'publication.json')),false);
  if(name==='new.txt')assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'original\n');else assert.equal(fs.existsSync(path.join(f.source,'new.txt')),false);
});
for(const location of ['workspace','originals'])test(`changed ${location} bytes cannot be approved with old token`,t=>{
  const f=fixture(t),view=reviewChanges(f.store,f.id);fs.writeFileSync(path.join(f.dir,location,'a.txt'),'tampered');
  assert.throws(()=>applyChanges(f.store,f.id,view.reviewToken),{code:'PROPOSAL_CHANGED'});unchanged(f);
});
test('proposal path injection and changed task permissions are refused',t=>{
  const f=fixture(t),file=path.join(f.dir,'proposal.json'),original=fs.readFileSync(file),p=JSON.parse(original);
  p.files[0].path='../outside';fs.writeFileSync(file,JSON.stringify(p));assert.throws(()=>reviewChanges(f.store,f.id),{code:'PROPOSAL_INVALID'});
  fs.writeFileSync(file,original);const run=f.store.get(f.id);run.task.workspaceRoot=f.root;f.store.save(run);
  assert.throws(()=>reviewChanges(f.store,f.id),{code:'PROPOSAL_INVALID'});unchanged(f);
});
for(const where of ['source','workspace'])test(`${where} symlink swap cannot escape authorized paths`,t=>{
  const f=fixture(t),view=reviewChanges(f.store,f.id),file=path.join(where==='source'?f.source:path.join(f.dir,'workspace'),'a.txt');
  fs.unlinkSync(file);fs.symlinkSync(path.join(f.source,'untouched.txt'),file);
  assert.throws(()=>applyChanges(f.store,f.id,view.reviewToken),{code:'PATH_DENIED'});assert.equal(fs.readFileSync(path.join(f.source,'untouched.txt'),'utf8'),'not authorized\n');assert.equal(fs.existsSync(path.join(f.source,'new.txt')),false);
});
test('a simultaneous or interrupted decision lock prevents apply and discard',t=>{
  const f=fixture(t),view=reviewChanges(f.store,f.id);fs.writeFileSync(path.join(f.dir,'review.lock'),'other process',{mode:0o600});
  assert.throws(()=>applyChanges(f.store,f.id,view.reviewToken),{code:'REVIEW_LOCKED'});assert.throws(()=>discardChanges(f.store,f.id),{code:'REVIEW_LOCKED'});unchanged(f);
});
test('interrupted apply records partial progress and keeps original backups',t=>{
  const f=fixture(t),view=reviewChanges(f.store,f.id),write=fs.writeFileSync;
  fs.writeFileSync=function(file,data,...args){if(Buffer.isBuffer(data)&&data.toString()==='new\n')throw Object.assign(new Error('disk full'),{code:'ENOSPC'});return write.call(this,file,data,...args);};
  try{assert.throws(()=>applyChanges(f.store,f.id,view.reviewToken),{code:'APPLY_FAILED'});}finally{fs.writeFileSync=write;}
  assert.equal(f.store.get(f.id).state,'FAILED');assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'proposed\n');assert.equal(fs.existsSync(path.join(f.source,'new.txt')),false);
  const report=recovery(f.store,f.id);assert.equal(report.publicationState,'INTERRUPTED');assert.equal(report.files[0].observed,'published');assert.equal(report.files[0].backupValid,true);
  assert.throws(()=>applyChanges(f.store,f.id,view.reviewToken),{code:'REVIEW_NOT_PENDING'});
});
test('review renders binary bytes losslessly and escapes terminal content',t=>{
  const f=fixture(t),file=path.join(f.dir,'workspace','a.txt');fs.writeFileSync(file,Buffer.from([0,255,27,10]));
  const proposalFile=path.join(f.dir,'proposal.json'),p=JSON.parse(fs.readFileSync(proposalFile));p.files[0].afterHash=sha(fs.readFileSync(file));fs.writeFileSync(proposalFile,JSON.stringify(p));
  const view=reviewChanges(f.store,f.id);assert.equal(view.changes[0].encoding,'base64');assert.deepEqual(Buffer.from(view.changes[0].after,'base64'),Buffer.from([0,255,27,10]));
  const text=humanOutput({...view,changes:[{...view.changes[0],path:'bad\x1b[2J\nname',before:'a\r\t',after:'b\x1b[2J'}]});assert.ok(!text.includes('\x1b'));assert.ok(text.includes('\\u001b'));assert.ok(text.includes('\\r\\t'));
});
async function syntheticRun(f){
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENROUTER_API_KEY;let requests=0;
  process.env.OPENROUTER_API_KEY='synthetic-review-key';
  globalThis.fetch=async(input,init)=>{
    requests++;
    if(!init?.body)return Response.json({data:[{id:f.task.model,supported_parameters:['tools'],pricing:{prompt:'0.000001',completion:'0.000001',request:'0'}}]});
    const body=JSON.parse(init.body),done=body.messages.some(m=>m.role==='tool');
    return Response.json({id:'synthetic',model:f.task.model,usage:{prompt_tokens:1,completion_tokens:1,cost:0.000001},choices:[{finish_reason:done?'stop':'tool_calls',message:done?{role:'assistant',content:'Done'}:{role:'assistant',content:null,tool_calls:[{id:'write-1',type:'function',function:{name:'write_file',arguments:JSON.stringify({path:'a.txt',content:'proposed\n'})}}]}}]});
  };
  try{return {run:await delegate(f.task,f.store),requests};}
  finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=oldKey;}
}
for(const review of [true,false])test(`real runner with synthetic provider ${review?'retains proposal':'preserves automatic publication'}`,async t=>{
  const f=fixture(t,{seed:false,review}),{run,requests}=await syntheticRun(f);assert.equal(requests,3);assert.equal(run.state,review?'AWAITING_REVIEW':'COMPLETED',JSON.stringify(run.error));assert.equal(run.result.output,'Done');
  assert.equal(fs.existsSync(path.join(f.dir,'capability.json')),false);
  if(review){unchanged(f);assert.equal(fs.existsSync(path.join(f.dir,'workspace')),true);const view=reviewChanges(f.store,f.id);assert.equal(view.changes.length,1);assert.equal(applyChanges(f.store,f.id,view.reviewToken).state,'COMPLETED');}
  else assert.equal(fs.existsSync(path.join(f.dir,'workspace')),false);
  assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'proposed\n');
});
test('guided task CLI and prepare preserve review mode with zero budget',t=>{
  const f=fixture(t,{seed:false}),taskFile=path.join(f.root,'task.json');
  const r=f.run(['task','--directory',f.source,'--write','a.txt','--instructions','Propose edit','--output',taskFile,'--review-before-apply','--json']);assert.equal(r.status,0,r.stdout);const task=JSON.parse(fs.readFileSync(taskFile));assert.equal(task.reviewBeforeApply,true);assert.equal(task.maxSpendUsd,0);assert.equal(prepareTask({directory:f.source,instructions:'Edit',writablePaths:['a.txt'],reviewBeforeApply:true}).task.reviewBeforeApply,true);
});
test('Claude subscription adapters block before any runtime or provider call; API-key remains explicit',()=>{
  const saved={...process.env};try{
    for(const key of Object.keys(process.env))if(/ANTHROPIC|CLAUDE/.test(key))delete process.env[key];
    for(const backend of ['sdk','cli'])assert.throws(()=>validateClaudeCredentials({provider:'claude',backend,credentialMode:'subscription'}),{code:`SUBSCRIPTION_${backend.toUpperCase()}_UNSUPPORTED`,state:'BLOCKED'});
    process.env.ANTHROPIC_API_KEY='synthetic-api-key';assert.equal(validateClaudeCredentials({provider:'claude',backend:'cli',credentialMode:'api-key'}).env.ANTHROPIC_API_KEY,'synthetic-api-key');
  }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});

test('review flags on other commands fail instead of silently publishing',t=>{
  const f=fixture(t,{seed:false});
  for(const args of [['delegate','--review-before-apply'],['discard',f.id,'--review-token','0'.repeat(64)]]){
    const r=f.run([...args,'--json']);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).error.code,'INVALID_OPTION');
  }
});
test('redacted instructions remain compatible with the proposal task binding',t=>{
  const f=fixture(t,{seed:false});
  f.task.instructions='Do not reveal sk-ant-synthetic-private-test-key';
  const now=new Date().toISOString();f.store.create({id:f.id,correlationId:f.task.correlationId,state:'AWAITING_REVIEW',task:f.task,instructionHash:sha(f.task.instructions),pid:process.pid,createdAt:now,updatedAt:now});
  const ws=new Workspace(f.task,path.join(f.dir,'workspace'));ws.prepare();fs.writeFileSync(path.join(ws.root,'a.txt'),'proposed\n');saveProposal(ws);
  const view=reviewChanges(f.store,f.id);assert.equal(view.changes.length,1);assert.equal(applyChanges(f.store,f.id,view.reviewToken).state,'COMPLETED');
});
test('no-change proposals can be applied without publishing a file',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.dir,'workspace','a.txt'),'original\n');fs.unlinkSync(path.join(f.dir,'workspace','new.txt'));
  const file=path.join(f.dir,'proposal.json'),p=JSON.parse(fs.readFileSync(file));for(const item of p.files)item.afterHash=item.beforeHash;fs.writeFileSync(file,JSON.stringify(p));
  const view=reviewChanges(f.store,f.id);assert.deepEqual(view.changes,[]);assert.deepEqual(applyChanges(f.store,f.id,view.reviewToken).changedPaths,[]);unchanged(f);
});
test('start keeps MCP optional and reports blocked Claude subscription separately from login',t=>{
  const f=fixture(t,{seed:false}),project=path.join(f.root,'example');
  const first=JSON.parse(f.run(['start','--directory',project,'--json']).stdout);assert.doesNotMatch(first.next,/cpb connect/);assert.match(first.optionalConnect,/cpb connect/);
  const file=path.join(project,'task.json'),task=JSON.parse(fs.readFileSync(file));Object.assign(task,{provider:'claude',backend:'cli',credentialMode:'subscription'});fs.writeFileSync(file,JSON.stringify(task));
  const result=JSON.parse(f.run(['start','--directory',project,'--json']).stdout);assert.equal(result.validation.delegationStatus,'blocked');assert.match(result.next,/blocked/);assert.doesNotMatch(result.next,/cpb run/);
  assert.match(f.run(['validate','--task-file',file,'--human']).stdout,/subscription delegation is blocked/);
});

function syntheticPreload(f){
  const file=path.join(f.root,'synthetic-provider.cjs');
  fs.writeFileSync(file,`process.env.OPENROUTER_API_KEY='synthetic-review-key';
globalThis.fetch=async(input,init)=>{
 const url=String(input);
 if(url==='https://openrouter.ai/api/v1/models')return Response.json({data:[{id:'test/review-model',supported_parameters:['tools'],pricing:{prompt:'0.000001',completion:'0.000001',request:'0'}}]});
 if(url!=='https://openrouter.ai/api/v1/chat/completions')throw new Error('Unexpected request blocked');
 const done=JSON.parse(init.body).messages.some(m=>m.role==='tool');
 return Response.json({id:'synthetic',model:'test/review-model',usage:{prompt_tokens:1,completion_tokens:1,cost:0.000001},choices:[{finish_reason:done?'stop':'tool_calls',message:done?{role:'assistant',content:'Done'}:{role:'assistant',content:null,tool_calls:[{id:'write-1',type:'function',function:{name:'write_file',arguments:JSON.stringify({path:'a.txt',content:'proposed\\n'})}}]}}]});
};`);
  return file;
}
test('CLI run enables review without mutating the task template and returns success pending review',t=>{
  const f=fixture(t,{seed:false,review:false}),preload=syntheticPreload(f),file=path.join(f.root,'task.json');fs.writeFileSync(file,JSON.stringify(f.task));const before=fs.readFileSync(file);
  const r=spawnSync(process.execPath,['--require',preload,cli,'run','--task-file',file,'--max-spend','0.02','--consent-spend','--review-before-apply','--json'],{env:{PATH:process.env.PATH,CPB_HOME:f.store.root},encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stdout+r.stderr);const run=JSON.parse(r.stdout);assert.equal(run.state,'AWAITING_REVIEW');assert.equal(run.task.reviewBeforeApply,true);assert.notEqual(run.id,f.task.taskId);assert.deepEqual(fs.readFileSync(file),before);unchanged(f);assert.equal(reviewChanges(f.store,run.id).changes.length,1);
});
test('MCP preparation and delegation retain review mode; no apply or discard tool is exposed',async t=>{
  const f=fixture(t,{seed:false}),preload=syntheticPreload(f);
  const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
  const client=new Client({name:'review-test',version:'1'});
  try{
    await client.connect(new StdioClientTransport({command:process.execPath,args:['--require',preload,cli,'mcp'],env:{PATH:process.env.PATH,CPB_HOME:f.store.root},stderr:'pipe'}));
    const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['cpb_prepare','cpb_delegate']);
    const prepared=await client.callTool({name:'cpb_prepare',arguments:{directory:f.source,instructions:'Propose a change',writablePaths:['a.txt'],model:f.task.model,reviewBeforeApply:true}});assert.ok(!prepared.isError,JSON.stringify(prepared));
    assert.deepEqual(prepared.structuredContent,JSON.parse(prepared.content[0].text));
    const task=JSON.parse(prepared.content[0].text).task;assert.equal(task.reviewBeforeApply,true);assert.equal(task.maxSpendUsd,0);task.maxSpendUsd=0.02;
    const result=await client.callTool({name:'cpb_delegate',arguments:task});assert.equal(result.isError,false,JSON.stringify(result));
    assert.deepEqual(result.structuredContent,JSON.parse(result.content[0].text));
    const run=JSON.parse(result.content[0].text);assert.equal(run.state,'AWAITING_REVIEW');assert.equal(run.result.output,'Done');unchanged(f);
    assert.deepEqual(run.proposedPaths,['a.txt']);assert.deepEqual(run.changedPaths,[]);
    assert.equal(reviewChanges(f.store,run.id).changes.length,1);
  }finally{await client.close();}
});

test('setup gives a hidden-input credential command and a specific existing-directory action',t=>{
  const f=fixture(t,{seed:false});
  const doctor=f.run(['doctor','--provider','openrouter','--human']);assert.match(doctor.stdout,/read -rs 'OPENROUTER_API_KEY/);assert.doesNotMatch(doctor.stdout,/cpb run/);
  const start=f.run(['start','--directory',f.source,'--json']);assert.equal(start.status,1);assert.equal(JSON.parse(start.stdout).error.code,'START_DIRECTORY_NOT_READY');unchanged(f);assert.equal(fs.existsSync(path.join(f.source,'task.json')),false);
});
test('publication detects a source edit made after preflight and preserves the conflicting file',t=>{
  const f=fixture(t),view=reviewChanges(f.store,f.id),write=fs.writeFileSync;
  let injected=false;
  fs.writeFileSync=function(file,data,...args){const result=write.call(this,file,data,...args);if(Buffer.isBuffer(data)&&data.toString()==='proposed\n'&&!injected){injected=true;write.call(this,path.join(f.source,'new.txt'),'concurrent edit');}return result;};
  try{assert.throws(()=>applyChanges(f.store,f.id,view.reviewToken),{code:'WRITE_CONFLICT'});}finally{fs.writeFileSync=write;}
  assert.equal(fs.readFileSync(path.join(f.source,'new.txt'),'utf8'),'concurrent edit');assert.equal(recovery(f.store,f.id).publicationState,'INTERRUPTED');assert.equal(f.store.get(f.id).state,'FAILED');
});

test('duplicate authorized paths publish once and pending recovery names the review action',t=>{
  const f=fixture(t,{seed:false});f.task.writablePaths=['a.txt','a.txt'];
  const now=new Date().toISOString();f.store.create({id:f.id,correlationId:f.task.correlationId,state:'AWAITING_REVIEW',task:f.task,instructionHash:sha(f.task.instructions),pid:process.pid,createdAt:now,updatedAt:now});
  const ws=new Workspace(f.task,path.join(f.dir,'workspace'));ws.prepare();fs.writeFileSync(path.join(ws.root,'a.txt'),'proposed\n');saveProposal(ws);
  const report=recovery(f.store,f.id);assert.equal(report.recovery,'PENDING_REVIEW');assert.equal(report.modified,false);assert.match(report.message,/cpb review/);
  const view=reviewChanges(f.store,f.id);assert.equal(view.changes.length,1);assert.deepEqual(applyChanges(f.store,f.id,view.reviewToken).changedPaths,['a.txt']);
});

test('apply publishes verified bytes even if staging changes after token validation',t=>{
  const f=fixture(t),view=reviewChanges(f.store,f.id),save=f.store.save.bind(f.store);
  f.store.save=run=>{save(run);if(run.state==='RUNNING')fs.writeFileSync(path.join(f.dir,'workspace','a.txt'),'unreviewed late change\n');};
  assert.equal(applyChanges(f.store,f.id,view.reviewToken).state,'COMPLETED');
  assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'proposed\n');
});


test('parent-aliased CPB_HOME runs through review, apply, and empty discard with distinct path fields',t=>{
  const f=fixture(t,{seed:false}),preload=syntheticPreload(f);
  const alias=path.join(f.root,'parent-alias');fs.symlinkSync(f.root,alias);
  const file=path.join(f.root,'task.json');fs.writeFileSync(file,JSON.stringify(f.task));
  const run=()=>{
    const r=spawnSync(process.execPath,['--require',preload,cli,'run','--task-file',file,'--max-spend','0.02','--consent-spend','--json'],{env:{PATH:process.env.PATH,CPB_HOME:path.join(alias,'state')},encoding:'utf8',timeout:10000});
    assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);
  };
  const pending=run();assert.equal(pending.state,'AWAITING_REVIEW');
  assert.equal(pending.workspace,fs.realpathSync(pending.workspace));
  assert.deepEqual(pending.proposedPaths,['a.txt']);assert.deepEqual(pending.changedPaths,[]);unchanged(f);
  assert.match(f.run(['inspect',pending.id,'--human']).stdout,/Proposed files: a.txt/);
  assert.deepEqual(f.store.get(pending.id).proposedPaths,['a.txt']);
  const applied=applyChanges(f.store,pending.id,reviewChanges(f.store,pending.id).reviewToken);
  assert.deepEqual(applied.changedPaths,['a.txt']);assert.deepEqual(applied.proposedPaths,['a.txt']);
  assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'proposed\n');
  const empty=run();assert.deepEqual(empty.proposedPaths,[]);assert.deepEqual(empty.changedPaths,[]);
  assert.match(f.run(['inspect',empty.id,'--human']).stdout,/Proposed files: \(none\)/);
  assert.deepEqual(discardChanges(f.store,empty.id).proposedPaths,[]);
  fs.writeFileSync(path.join(f.source,'a.txt'),'original\n');
  const rejected=run();const discarded=discardChanges(f.store,rejected.id);
  assert.deepEqual(discarded.proposedPaths,['a.txt']);assert.deepEqual(discarded.changedPaths,[]);unchanged(f);
});
