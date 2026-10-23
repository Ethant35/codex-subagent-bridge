// Controlled filesystem failures test recovery; these are not live-provider evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Workspace} from '../dist/workspace.js';
import {recovery} from '../dist/local-commands.js';
function fixture(){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-publication-')));const source=path.join(root,'source'),run=path.join(root,'run');fs.mkdirSync(source);fs.mkdirSync(run,{mode:0o700});for(const p of ['a.txt','b.txt'])fs.writeFileSync(path.join(source,p),'original '+p);const task={taskId:randomUUID(),workspaceRoot:source,readablePaths:['a.txt','b.txt'],writablePaths:['a.txt','b.txt']};const ws=new Workspace(task,path.join(run,'workspace'));ws.prepare();for(const p of task.writablePaths)fs.writeFileSync(path.join(ws.root,p),'replacement '+p);return {root,source,run,ws,clean(){fs.rmSync(root,{recursive:true,force:true});}};}
function failWrite(contents,fn){const original=fs.writeFileSync;fs.writeFileSync=function(file,data,...args){if(String(data)===contents)throw Object.assign(new Error('injected disk full'),{code:'ENOSPC'});return original.call(this,file,data,...args);};try{return fn();}finally{fs.writeFileSync=original;}}
test('publication disk-full failure preserves the original destination bytes',()=>{const f=fixture();try{assert.throws(()=>failWrite('replacement a.txt',()=>f.ws.publish()));assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'original a.txt');assert.deepEqual(f.ws.publish(),['a.txt','b.txt']);assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'replacement a.txt');}finally{f.clean();}});
test('partial publication retains originals and a durable per-file recovery journal',()=>{const f=fixture();try{assert.throws(()=>failWrite('replacement b.txt',()=>f.ws.publish()));assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'replacement a.txt');assert.equal(fs.readFileSync(path.join(f.source,'b.txt'),'utf8'),'original b.txt');assert.equal(fs.readFileSync(path.join(f.run,'originals','a.txt'),'utf8'),'original a.txt');const journal=JSON.parse(fs.readFileSync(path.join(f.run,'publication.json'),'utf8'));assert.equal(journal.state,'INTERRUPTED');assert.equal(journal.files[0].status,'published');assert.equal(journal.files[1].status,'pending');assert.ok(!JSON.stringify(journal).includes('original a.txt'));}finally{f.clean();}});
test('publication checks cancellation between files and records recoverable progress',()=>{const f=fixture();try{assert.throws(()=>f.ws.publish(()=>{if(fs.readFileSync(path.join(f.source,'a.txt'),'utf8')==='replacement a.txt')throw new Error('cancelled by test');}),/cancelled/);assert.equal(fs.readFileSync(path.join(f.source,'b.txt'),'utf8'),'original b.txt');assert.equal(JSON.parse(fs.readFileSync(path.join(f.run,'publication.json'),'utf8')).state,'INTERRUPTED');}finally{f.clean();}});
test('publication preserves existing file mode and leaves no temporary source files',()=>{const f=fixture();try{fs.chmodSync(path.join(f.source,'a.txt'),0o640);f.ws.publish();assert.equal(fs.statSync(path.join(f.source,'a.txt')).mode&0o777,0o640);assert.deepEqual(fs.readdirSync(f.source).sort(),['a.txt','b.txt']);}finally{f.clean();}});
test('recovery compares observed bytes after interruption and never overwrites divergent edits',async()=>{const f=fixture();try{const {recovery}=await import('../dist/local-commands.js');const {createHash}=await import('node:crypto');const id=f.ws.task.taskId;const run={id,state:'FAILED',task:f.ws.task};const store={get(){return run;},dir(){return f.run;}};assert.throws(()=>failWrite('replacement b.txt',()=>f.ws.publish()));let report=recovery(store,id);assert.equal(report.files[0].observed,'published');assert.equal(report.files[0].backupValid,true);assert.equal(report.files[1].observed,'original');fs.writeFileSync(path.join(f.source,'a.txt'),'user changed it');report=recovery(store,id);assert.equal(report.files[0].observed,'diverged');assert.equal(fs.readFileSync(path.join(f.source,'a.txt'),'utf8'),'user changed it');assert.equal(report.modified,false);
 // Explicit offline restore procedure: back up divergent edit separately, restore retained original.
 fs.copyFileSync(path.join(f.source,'a.txt'),path.join(f.root,'user-edit-backup.txt'));fs.copyFileSync(report.files[0].backup,path.join(f.source,'a.txt'));assert.equal(recovery(store,id).files[0].observed,'original');assert.equal(fs.readFileSync(path.join(f.root,'user-edit-backup.txt'),'utf8'),'user changed it');
 }finally{f.clean();}});
test('recovery reads a bounded journal for the maximum valid path count',()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-large-journal-')));
  try{
    const id=randomUUID(),paths=Array.from({length:1000},(_,i)=>['x'.repeat(180),'y'.repeat(180),'z'.repeat(180),String(i)].join('/'));
    const run={id,state:'FAILED',task:{writablePaths:paths,workspaceRoot:root}};
    fs.writeFileSync(path.join(root,'publication.json'),JSON.stringify({version:1,taskId:id,state:'INTERRUPTED',files:paths.map(p=>({path:p,beforeHash:null,afterHash:'a'.repeat(64),status:'pending'}))}),{mode:0o600});
    assert.ok(fs.statSync(path.join(root,'publication.json')).size>512000);
    const result=recovery({get:()=>run,dir:()=>root},id);assert.equal(result.files.length,1000);assert.equal(result.modified,false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
