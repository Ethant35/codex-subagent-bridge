// Author: Ethan. Offline upgrade, backup, restore and package rollback drill.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {Store} from '../dist/store.js';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-operations-')));
const current=process.cwd(),old=path.join(root,'v1'),home=path.join(root,'state');
const env={...process.env,CPB_HOME:home};delete env.OPENROUTER_API_KEY;delete env.ANTHROPIC_API_KEY;
function cli(args,file=path.join(current,'dist/cli.js'),state=home){
  const r=spawnSync(process.execPath,[file,...args],{env:{...env,CPB_HOME:state},encoding:'utf8',timeout:10000});
  if(r.error)throw r.error;return{status:r.status,value:JSON.parse(r.stdout)};
}
function inventory(dir){const rows=[];function walk(p){for(const name of fs.readdirSync(p).sort()){const f=path.join(p,name),s=fs.lstatSync(f);assert.equal(s.isSymbolicLink(),false);assert.equal(s.mode&0o077,0);if(s.isDirectory())walk(f);else rows.push({file:path.relative(dir,f),mode:s.mode&0o777,sha256:createHash('sha256').update(fs.readFileSync(f)).digest('hex')});}}walk(dir);return rows;}
try{
  fs.mkdirSync(old);const archive=path.join(root,'v1.tar');fs.writeFileSync(archive,execFileSync('git',['archive','v1.0.0']));execFileSync('tar',['-xf',archive,'-C',old]);
  // Same dependency lock at both revisions; use installed types/build tools, not a different resolution.
  const oldLock=JSON.parse(fs.readFileSync(path.join(old,'package-lock.json'),'utf8'));
  const newLock=JSON.parse(fs.readFileSync(path.join(current,'package-lock.json'),'utf8'));
  delete oldLock.version;delete newLock.version;delete oldLock.packages[''].version;delete newLock.packages[''].version;
  assert.deepEqual(newLock,oldLock);
  fs.symlinkSync(path.join(current,'node_modules'),path.join(old,'node_modules'),'dir');
  execFileSync(process.execPath,[path.join(current,'node_modules/typescript/bin/tsc')],{cwd:old});
  const oldCli=path.join(old,'dist/cli.js'),sample=path.join(root,'sample');
  assert.equal(cli(['sample','--directory',sample]).status,0);
  const taskFile=path.join(sample,'task.json'),task=JSON.parse(fs.readFileSync(taskFile,'utf8'));
  task.writablePaths=['fact.txt'];task.allowedOperations=['read_file','write_file'];fs.writeFileSync(taskFile,JSON.stringify(task));
  const run=cli(['delegate','--provider','openrouter','--model',task.model,'--task-file',taskFile],oldCli);
  assert.equal(run.value.state,'BLOCKED');assert.equal(cli(['inspect',task.taskId],oldCli).status,0);
  const originalRecord=fs.readFileSync(path.join(home,'runs',task.taskId,'run.json'));
  const upgraded=cli(['inspect',task.taskId]);assert.equal(upgraded.value.id,task.taskId);
  const store=new Store(home),release=store.acquire(randomUUID());assert.equal(typeof release,'function');release();
  assert.deepEqual(fs.readFileSync(path.join(home,'runs',task.taskId,'run.json')),originalRecord);
  // Add a current-format failed run with a real original backup before copying the entire stopped store.
  task.taskId=randomUUID();fs.writeFileSync(taskFile,JSON.stringify(task));
  assert.equal(cli(['delegate','--provider','openrouter','--model',task.model,'--task-file',taskFile]).value.state,'BLOCKED');
  assert.equal(fs.readFileSync(path.join(home,'runs',task.taskId,'originals','fact.txt'),'utf8'),'This is safe sample data.\n');
  const before=inventory(home),backup=path.join(root,'backup'),restored=path.join(root,'restored');
  fs.cpSync(home,backup,{recursive:true,preserveTimestamps:true});assert.deepEqual(inventory(backup),before);
  fs.writeFileSync(path.join(home,'runs',task.taskId,'run.json'),'invalid json');
  assert.equal(cli(['inspect',task.taskId]).value.error.code,'STORE_CORRUPT');
  fs.cpSync(backup,restored,{recursive:true,preserveTimestamps:true});assert.deepEqual(inventory(restored),before);
  assert.equal(cli(['inspect',task.taskId],undefined,restored).value.state,'BLOCKED');
  // Roll back the application code while retaining the additive migrated store.
  assert.equal(cli(['inspect',task.taskId],oldCli,restored).value.state,'BLOCKED');
  assert.equal(cli(['runs'],oldCli,restored).value.length,2);assert.deepEqual(inventory(restored),before);
  const restoredStore=new Store(restored),again=restoredStore.acquire(randomUUID());assert.equal(typeof again,'function');again();
  fs.writeFileSync('evidence/readiness/operations.json',JSON.stringify({author:'Ethan',date:new Date().toISOString(),sourceTag:'v1.0.0',sourceCommit:execFileSync('git',['rev-parse','v1.0.0^{}'],{encoding:'utf8'}).trim(),node:process.version,platform:process.platform,arch:process.arch,providerCalls:0,dependencyReuse:'identical lockfile; archived old source rebuilt against installed lock',upgrade:'PASS',wholeStoreBackup:'PASS',corruptionDetected:'PASS',restoredInspection:'PASS',oldCodeRollbackInspection:'PASS',restoredScheduler:'PASS',hashes:before},null,2)+'\n');
  console.log('Offline upgrade, complete-store backup, corruption detection, restore, rollback inspection and slot reuse PASS');
}finally{fs.rmSync(root,{recursive:true,force:true});}
