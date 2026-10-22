import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const cli=path.resolve('dist/cli.js');
function fixture(overrides={}) {
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-capability-'))),workspace=path.join(root,'workspace');fs.mkdirSync(workspace,{mode:0o700});fs.writeFileSync(path.join(workspace,'fact.txt'),'actual fact\n');
 const task={version:1,taskId:randomUUID(),correlationId:randomUUID(),provider:'openrouter',backend:'api',model:'openai/gpt-4.1-mini',instructions:'Read fact.txt.',workspaceRoot:workspace,allowedOperations:['read_file','write_file','list_files'],readablePaths:['fact.txt'],writablePaths:['out.txt'],maxRuntimeMs:10000,maxToolSteps:10,maxSpendUsd:0.1,expectedOutput:'File contents',resultFormat:'text',networkPolicy:'provider-only',...overrides};
 const config=path.join(root,'capability.json'),events=path.join(root,'events.jsonl');fs.writeFileSync(config,JSON.stringify({task,workspace,eventPath:events,deadline:Date.now()+10000}),{mode:0o600});
 const clients=[];return {root,workspace,task,config,events,async connect(){const c=new Client({name:'capability-e2e',version:'1'});await c.connect(new StdioClientTransport({command:process.execPath,args:[cli,'tool-server',config],stderr:'pipe'}));clients.push(c);return c;},log(){return fs.existsSync(events)?fs.readFileSync(events,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];},async clean(){for(const c of clients)await c.close();fs.rmSync(root,{recursive:true,force:true});}};
}
test('CB-08/09 named pipe in source cannot block the production task deadline',async()=>{
 const f=fixture({readablePaths:['pipe'],writablePaths:[],allowedOperations:['read_file'],maxRuntimeMs:300});
 try{
  assert.equal(spawnSync('mkfifo',[path.join(f.workspace,'pipe')]).status,0);
  const file=path.join(f.root,'task.json');fs.writeFileSync(file,JSON.stringify(f.task));const env={...process.env,CPB_HOME:path.join(f.root,'state')};delete env.OPENROUTER_API_KEY;
  const r=spawnSync(process.execPath,[cli,'delegate','--provider','openrouter','--model',f.task.model,'--task-file',file],{env,encoding:'utf8',timeout:2000,killSignal:'SIGKILL'});
  assert.equal(r.error,undefined,'Unsupported source blocked until the external watchdog killed the CLI');assert.equal(r.status,1);const run=JSON.parse(r.stdout);assert.equal(run.state,'FAILED');assert.equal(run.error.code,'FILE_DENIED');
 }finally{await f.clean();}
});
for(const name of ['read_file','write_file'])test(`CB-08 MCP ${name} malformed arguments are durably audited`,async()=>{
 const f=fixture();try{const c=await f.connect();const result=await c.callTool({name,arguments:{}});assert.equal(result.isError,true);assert.ok(f.log().some(e=>e.type==='tool_denied'&&e.detail.name===name));assert.ok(fs.existsSync(path.join(f.root,'tool-failure')));assert.equal(fs.existsSync(path.join(f.workspace,'out.txt')),false);}finally{await f.clean();}
});
test('CB-08 unknown MCP tool is denied and durably audited',async()=>{
 const f=fixture();try{const c=await f.connect();let rejected=false;try{rejected=(await c.callTool({name:'shell',arguments:{command:'do not execute'}})).isError===true;}catch{rejected=true;}assert.equal(rejected,true);assert.ok(f.log().some(e=>e.type==='tool_denied'&&e.detail.name==='shell'));assert.ok(fs.existsSync(path.join(f.root,'tool-failure')));}finally{await f.clean();}
});
test('CB-08 a durable denial prevents later writes, including after server restart',async()=>{
 const f=fixture();try{const c=await f.connect();assert.equal((await c.callTool({name:'read_file',arguments:{path:'forbidden.txt'}})).isError,true);await c.close();const restarted=await f.connect();const write=await restarted.callTool({name:'write_file',arguments:{path:'out.txt',content:'should not be written'}});assert.equal(write.isError,true);assert.equal(fs.existsSync(path.join(f.workspace,'out.txt')),false);assert.ok(fs.existsSync(path.join(f.root,'tool-failure')));}finally{await f.clean();}
});
test('CB-08/11 overlapping MCP processes share one task step budget',async()=>{
 const f=fixture({maxToolSteps:2});try{const first=await f.connect(),second=await f.connect();assert.ok(!(await first.callTool({name:'read_file',arguments:{path:'fact.txt'}})).isError);assert.ok(!(await second.callTool({name:'read_file',arguments:{path:'fact.txt'}})).isError);const third=await first.callTool({name:'write_file',arguments:{path:'out.txt',content:'over budget'}});assert.equal(third.isError,true);assert.equal(fs.existsSync(path.join(f.workspace,'out.txt')),false);assert.equal(f.log().filter(e=>e.type==='tool_allowed').length,2);}finally{await f.clean();}
});
test('CB-08 concurrent calls cannot overspend a shared tool budget',async()=>{
 const f=fixture({maxToolSteps:2});try{const a=await f.connect(),b=await f.connect();const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).callTool({name:'read_file',arguments:{path:'fact.txt'}})));assert.equal(results.filter(r=>!r.isError).length,2);assert.equal(f.log().filter(e=>e.type==='tool_allowed').length,2);assert.equal(f.log().filter(e=>e.type==='tool_denied').length,10);assert.equal(new Set(f.log().map(e=>e.detail.step)).size,12);}finally{await f.clean();}
});
for(const kind of ['fifo','hardlink'])test(`CB-08 write rejects a ${kind} without modifying its target`,async()=>{
 const f=fixture();try{const target=path.join(f.workspace,'out.txt');if(kind==='fifo')assert.equal(spawnSync('mkfifo',[target]).status,0);else fs.linkSync(path.join(f.workspace,'fact.txt'),target);const c=await f.connect();assert.equal((await c.callTool({name:'write_file',arguments:{path:'out.txt',content:'forbidden'}})).isError,true);assert.equal(fs.readFileSync(path.join(f.workspace,'fact.txt'),'utf8'),'actual fact\n');assert.ok(f.log().some(e=>e.type==='tool_denied'));}finally{await f.clean();}
});
