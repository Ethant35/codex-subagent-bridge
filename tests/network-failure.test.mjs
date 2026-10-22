import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
test('CB-12/14 real OpenRouter rejects synthetic credential without disclosure',{skip:process.env.CPB_NETWORK_E2E==='1'?false:'Network E2E opt-in required; no real credentials needed'},()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-auth-failure-')));
 try{
  const synthetic='sk-or-v1-invalid-cpb-e2e-'+randomUUID(),task={version:1,taskId:randomUUID(),correlationId:randomUUID(),provider:'openrouter',backend:'api',model:'openai/gpt-4.1-mini',instructions:'Return a single word.',workspaceRoot:root,allowedOperations:[],readablePaths:[],writablePaths:[],maxRuntimeMs:20000,maxToolSteps:1,maxSpendUsd:0.05,expectedOutput:'No result because authentication is invalid',resultFormat:'text',networkPolicy:'provider-only'};
  const file=path.join(root,'task.json');fs.writeFileSync(file,JSON.stringify(task));
  const result=spawnSync(process.execPath,[path.resolve('dist/cli.js'),'delegate','--provider','openrouter','--model',task.model,'--task-file',file,'--json'],{env:{...process.env,CPB_HOME:path.join(root,'state'),OPENROUTER_API_KEY:synthetic},encoding:'utf8',timeout:25000});
  assert.equal(result.status,1,result.stdout+result.stderr);const run=JSON.parse(result.stdout);assert.equal(run.state,'FAILED');assert.equal(run.error.code,'AUTH_FAILED');assert.equal(run.result,undefined);assert.ok(!result.stdout.includes(synthetic));assert.ok(!result.stderr.includes(synthetic));
  for(const name of ['events.jsonl','run.json'])assert.ok(!fs.readFileSync(path.join(root,'state','runs',task.taskId,name),'utf8').includes(synthetic));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
