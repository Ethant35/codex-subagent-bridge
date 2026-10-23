import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cli=path.resolve('dist/cli.js');
function fixture(){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-onboarding-'))),env={...process.env,CPB_HOME:path.join(root,'state')};delete env.OPENROUTER_API_KEY;delete env.ANTHROPIC_API_KEY;return{root,env,run(args){return spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:5000,killSignal:'SIGKILL'});},clean(){fs.rmSync(root,{recursive:true,force:true});}};}
test('fresh sample and validation are offline, private, noninteractive and never overwrite',()=>{const f=fixture();try{const directory=path.join(f.root,'sample');const r=f.run(['sample','--directory',directory]);assert.equal(r.status,0,r.stdout);const task=JSON.parse(fs.readFileSync(path.join(directory,'task.json'),'utf8'));assert.equal(task.maxSpendUsd,0);assert.equal(fs.statSync(directory).mode&0o777,0o700);const valid=f.run(['validate','--task-file',path.join(directory,'task.json')]);assert.equal(valid.status,0,valid.stdout);assert.equal(JSON.parse(valid.stdout).valid,true);assert.equal(fs.existsSync(f.env.CPB_HOME),false);assert.equal(f.run(['sample','--directory',directory]).status,1);assert.equal(fs.readFileSync(path.join(directory,'fact.txt'),'utf8'),'This is safe sample data.\n');const blocked=f.run(['delegate','--provider','openrouter','--model',task.model,'--task-file',path.join(directory,'task.json')]);assert.equal(JSON.parse(blocked.stdout).state,'BLOCKED');const second=f.run(['validate','--task-file',path.join(directory,'task.json')]);assert.equal(second.status,0);}finally{f.clean();}});
test('task-file FIFO is rejected promptly without hanging the CLI',()=>{const f=fixture();try{const file=path.join(f.root,'pipe');assert.equal(spawnSync('mkfifo',[file]).status,0);const r=f.run(['delegate','--provider','openrouter','--model','x','--task-file',file]);assert.equal(r.error,undefined);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).error.code,'FILE_DENIED');}finally{f.clean();}});
test('help contains actual quickstart and recovery/diagnostic commands without terminal controls',()=>{const f=fixture();try{const r=f.run(['--help']);assert.equal(r.status,0);for(const term of ['sample','validate','diagnose','recovery','maxSpendUsd'])assert.ok(r.stdout.includes(term),term);assert.ok(!r.stdout.includes('\x1b'));assert.ok(r.stdout.split('\n').every(line=>line.length<=100));}finally{f.clean();}});
test('shareable diagnostics exclude exact task instructions and output content',()=>{const f=fixture();try{const directory=path.join(f.root,'sample');assert.equal(f.run(['sample','--directory',directory]).status,0);const file=path.join(directory,'task.json'),task=JSON.parse(fs.readFileSync(file,'utf8'));task.instructions='PRIVATE_PROMPT_SENTINEL';fs.writeFileSync(file,JSON.stringify(task));f.run(['delegate','--provider','openrouter','--model',task.model,'--task-file',file]);const r=f.run(['diagnose',task.taskId]);assert.equal(r.status,0,r.stdout);const d=JSON.parse(r.stdout);assert.equal(d.run.state,'BLOCKED');assert.ok(!r.stdout.includes('PRIVATE_PROMPT_SENTINEL'));assert.ok(!r.stdout.includes('This is safe sample data.'));assert.ok(!r.stdout.includes(f.root));assert.ok(!('task' in d.run));}finally{f.clean();}});
test('invalid pagination options fail explicitly, including null and empty values',()=>{
  const f=fixture();try{
    for(const args of [['runs','--before','null'],['runs','--before',''],['runs','--limit','']]){
      const r=f.run(args);assert.equal(r.status,1,JSON.stringify(args)+r.stdout);
      assert.ok(['INVALID_CURSOR','INVALID_LIMIT'].includes(JSON.parse(r.stdout).error.code));
    }
  }finally{f.clean();}
});
test('offline validation leaves subscription login unknown and reports API-key presence separately',()=>{
  const f=fixture();try{
    const directory=path.join(f.root,'sample');
    assert.equal(f.run(['sample','--directory',directory]).status,0);
    const file=path.join(directory,'task.json'),task=JSON.parse(fs.readFileSync(file,'utf8'));
    for(const [provider,backend,credentialMode,key] of [
      ['openrouter','api',undefined,'OPENROUTER_API_KEY'],
      ['claude','sdk','api-key','ANTHROPIC_API_KEY'],
      ['claude','cli','api-key','ANTHROPIC_API_KEY'],
      ['claude','cli','subscription','ANTHROPIC_API_KEY'],
    ]){
      fs.writeFileSync(file,JSON.stringify({...task,provider,backend,credentialMode}));
      for(const present of [false,true]){
        if(present)f.env[key]='synthetic-offline-validation';else delete f.env[key];
        const r=f.run(['validate','--task-file',file]);assert.equal(r.status,0,r.stdout);
        const result=JSON.parse(r.stdout),subscription=credentialMode==='subscription';
        assert.equal(result.credentialPresent,subscription?null:present);
        assert.equal(result.credentialSource,subscription?'subscription-login':key);
        assert.equal(result.credentialStatus,subscription?'unverified':present?'present':'missing');
        assert.equal(result.networkRequests,0);
        assert.equal(fs.existsSync(f.env.CPB_HOME),false);
        assert.ok(!r.stdout.includes('synthetic-offline-validation'));
      }
      delete f.env[key];
    }
  }finally{f.clean();}
});
