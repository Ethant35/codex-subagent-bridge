import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const cli=path.resolve('dist/cli.js');
function fixture(){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-setup-')));
  const env={...process.env,CPB_HOME:path.join(root,'state')};
  for(const key of Object.keys(env))if(/OPENROUTER|ANTHROPIC|CLAUDE/.test(key))delete env[key];
  return {root,env,run(args){return spawnSync(process.execPath,[cli,...args],{cwd:root,env,encoding:'utf8',timeout:10000});},clean(){fs.rmSync(root,{recursive:true,force:true});}};
}
function assertSQLiteWarningAbsent(result,label){assert.doesNotMatch(result.stderr,/ExperimentalWarning: SQLite/,`${label}: ${result.stderr}`);}

test('setup and read-only onboarding commands do not load SQLite or create run state',()=>{
  const f=fixture();try{
    const commands=[
      ['help',['--help']],['doctor default',['doctor']],['doctor human',['doctor','--human']],['doctor JSON',['doctor','--json']],
      ['empty diagnostics',['diagnose']],
    ];
    for(const [label,args] of commands){const r=f.run(args);assert.equal(r.status,0,`${label}: ${r.stdout}\n${r.stderr}`);assertSQLiteWarningAbsent(r,label);}
    for(const args of [['doctor'],['doctor','--json']])assert.doesNotThrow(()=>JSON.parse(f.run(args).stdout));
    assert.equal(fs.existsSync(f.env.CPB_HOME),false);
  }finally{f.clean();}
});

test('start replay, task creation, connect preview, validation, and no-consent refusal stay SQLite-free',()=>{
  const f=fixture();try{
    const project=path.join(f.root,'example');
    for(const [label,args] of [
      ['start',['start','--directory',project]],['start replay',['start','--directory',project]],
      ['connect preview',['connect','--directory',project,'--json']],
      ['task creation',['task','--directory',project,'--read','fact.txt','--instructions','Read fact.txt.','--output',path.join(project,'prepared.json'),'--json']],
      ['validation',['validate','--task-file',path.join(project,'task.json'),'--json']],
      ['run refusal',['run','--task-file',path.join(project,'task.json'),'--max-spend','0.02']],
    ]){
      const r=f.run(args);assertSQLiteWarningAbsent(r,label);
      if(label==='run refusal'){assert.equal(r.status,1,r.stdout);assert.match(r.stdout,/SPEND_CONSENT_REQUIRED/);}
      else assert.equal(r.status,0,`${label}: ${r.stdout}\n${r.stderr}`);
    }
    const preview=JSON.parse(f.run(['connect','--directory',project,'--json']).stdout);
    assert.equal(preview.applied,false);assert.equal(preview.alreadyConfigured,false);
    assert.equal(fs.existsSync(path.join(project,'.codex','config.toml')),false);
    assert.equal(fs.existsSync(f.env.CPB_HOME),false);
  }finally{f.clean();}
});

test('missing authorized input names only its relative path and suggests a safe correction',()=>{
  const f=fixture();try{
    const project=path.join(f.root,'example');assert.equal(f.run(['start','--directory',project]).status,0);
    const common=['task','--directory',project,'--read','missing.txt','--instructions','Read the requested file.','--output',path.join(project,'missing-task.json')];
    const human=f.run(common);assert.equal(human.status,1,human.stdout);assert.match(human.stdout,/NOT_FOUND/);assert.match(human.stdout,/missing\.txt/);assert.match(human.stdout,/Check that relative path or create the file/);assert.ok(!human.stdout.includes(f.root));assert.equal(fs.existsSync(path.join(project,'missing-task.json')),false);assertSQLiteWarningAbsent(human,'missing input human');
    const machine=f.run([...common,'--json']);assert.equal(machine.status,1,machine.stdout);const error=JSON.parse(machine.stdout).error;assert.equal(error.code,'NOT_FOUND');assert.match(error.message,/missing\.txt/);assert.match(error.message,/create the file/);assert.ok(!machine.stdout.includes(f.root));assert.equal(fs.existsSync(path.join(project,'missing-task.json')),false);assertSQLiteWarningAbsent(machine,'missing input JSON');
    const writable=f.run(['task','--directory',project,'--write','new-output.txt','--instructions','Create the output.','--output',path.join(project,'write-task.json'),'--json']);assert.equal(writable.status,0,writable.stdout);assert.equal(fs.existsSync(path.join(project,'new-output.txt')),false);assertSQLiteWarningAbsent(writable,'new writable path');
    const denied=f.run(['task','--directory',project,'--read','../outside.txt','--instructions','Read input.','--output',path.join(project,'denied.json'),'--json']);assert.equal(denied.status,1);assert.equal(JSON.parse(denied.stdout).error.code,'INVALID_TASK');assert.equal(fs.existsSync(path.join(project,'denied.json')),false);assertSQLiteWarningAbsent(denied,'traversal control');
  }finally{f.clean();}
});
