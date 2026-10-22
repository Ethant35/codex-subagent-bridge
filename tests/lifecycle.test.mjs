import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const cli=path.resolve('dist/cli.js');
function fixture(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-lifecycle-'))),repo=path.join(root,'repo'),home=path.join(root,'state');fs.mkdirSync(repo);
 const files=[];for(let i=0;i<1000;i++){const name=`folder${i}/data.txt`;fs.mkdirSync(path.dirname(path.join(repo,name)));fs.writeFileSync(path.join(repo,name),'actual file\n');files.push(name);}
 const env={...process.env,CPB_HOME:home};delete env.OPENROUTER_API_KEY;
 const task={version:1,taskId:randomUUID(),correlationId:randomUUID(),provider:'openrouter',backend:'api',model:'openai/gpt-4.1-mini',instructions:'Read one authorized file.',workspaceRoot:repo,allowedOperations:['read_file'],readablePaths:files,writablePaths:[],maxRuntimeMs:30000,maxToolSteps:2,maxSpendUsd:0.1,expectedOutput:'A file fact',resultFormat:'text',networkPolicy:'provider-only'};
 const children=[];
 const run=(args)=>{const child=spawn(process.execPath,[cli,...args],{env,cwd:root,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);const item={child,done:new Promise((res,rej)=>{child.on('error',rej);child.on('close',code=>res({code,stdout,stderr}));})};children.push(item);return item;};
 const launch=()=>{const t={...task,taskId:randomUUID()},file=path.join(root,t.taskId+'.json');fs.writeFileSync(file,JSON.stringify(t));return {...run(['delegate','--provider',t.provider,'--model',t.model,'--task-file',file]),id:t.taskId};};
 const record=id=>{try{return JSON.parse(fs.readFileSync(path.join(home,'runs',id,'run.json'),'utf8'));}catch{return undefined;}};
 return {root,home,run,launch,record,async clean(){for(const item of children)if(item.child.exitCode===null){item.child.kill('SIGCONT');item.child.kill('SIGTERM');}await Promise.allSettled(children.map(c=>c.done));fs.rmSync(root,{recursive:true,force:true});}};
}
async function waitFor(predicate){for(let n=0;n<5000;n++){if(predicate())return;await delay(1);}assert.fail('Timed out observing actual CLI process');}
async function pauseRunning(f,item){await waitFor(()=>f.record(item.id)?.state==='RUNNING');assert.equal(item.child.kill('SIGSTOP'),true);await delay(20);assert.equal(f.record(item.id).state,'RUNNING');}
test('CB-10 production cpb cancel is honored after synchronous snapshot resumes',async()=>{
 const f=fixture();try{const item=f.launch();await pauseRunning(f,item);const request=JSON.parse((await f.run(['cancel',item.id,'--json']).done).stdout);assert.equal(request.cancelRequested,true);item.child.kill('SIGCONT');const done=JSON.parse((await item.done).stdout);assert.equal(done.state,'CANCELLED');assert.equal(f.record(item.id).state,'CANCELLED');assert.equal(fs.existsSync(path.join(f.home,'runs',item.id,'capability.json')),false);}finally{await f.clean();}
});
test('CB-11 two real running tasks hold slots; third queues and cancels independently',async()=>{
 const f=fixture();try{
  const first=f.launch();await pauseRunning(f,first);const second=f.launch();await pauseRunning(f,second);
  const third=f.launch();await waitFor(()=>f.record(third.id)?.state==='QUEUED');await delay(150);assert.equal(f.record(third.id).state,'QUEUED');
  assert.notEqual(first.id,second.id);assert.notEqual(path.join(f.home,'runs',first.id),path.join(f.home,'runs',second.id));
  assert.equal(JSON.parse((await f.run(['cancel',third.id]).done).stdout).cancelRequested,true);assert.equal(JSON.parse((await third.done).stdout).state,'CANCELLED');
  for(const item of [first,second]){assert.equal(JSON.parse((await f.run(['cancel',item.id]).done).stdout).cancelRequested,true);item.child.kill('SIGCONT');assert.equal(JSON.parse((await item.done).stdout).state,'CANCELLED');assert.match(fs.readFileSync(path.join(f.home,'runs',item.id,'events.jsonl'),'utf8'),/CANCELLED/);}
  const after=f.launch();assert.equal(JSON.parse((await after.done).stdout).state,'BLOCKED'); // Slot release works; the real missing-credential check is reached.
 }finally{await f.clean();}
});
