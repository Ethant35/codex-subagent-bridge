// Author: Ethan. Installed-package upgrade, recovery, rollback and reinstall drill.
// Usage: node scripts/release-operations.mjs --previous FILE.tgz --candidate FILE.tgz --output DIR [--previous-version VERSION --candidate-version VERSION]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2);
function option(name){const i=args.indexOf(name);if(i<0||!args[i+1])throw new Error(`Required: ${name} VALUE`);return path.resolve(args[i+1]);}
const previous=option('--previous'),candidate=option('--candidate'),output=option('--output');
const expectedVersion=(flag,fallback)=>{const i=args.indexOf(flag);const value=i<0?fallback:args[i+1];assert.match(value??'',/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);return value;};
const previousVersion=expectedVersion('--previous-version','1.2.0'),nextVersion=expectedVersion('--candidate-version','1.2.1');
for(const file of [previous,candidate])assert.ok(fs.statSync(file).isFile(),`Archive missing: ${file}`);
assert.notEqual(previous,candidate,'Use separate previous and candidate archives');
const npmCache=path.join(os.homedir(),'.npm');assert.ok(fs.statSync(npmCache).isDirectory(),'Expected existing npm cache at os.homedir()/.npm');
fs.mkdirSync(output,{recursive:true});assert.equal(fs.readdirSync(output).length,0,'Evidence output directory must be empty');
fs.chmodSync(output,0o700);
const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-release-operations-')));
const app=path.join(work,'app'),home=path.join(work,'cpb-home'),project=path.join(work,'project');
const isolatedHome=path.join(work,'home'),isolatedCodex=path.join(work,'codex-home');
const fetchGuard=path.join(work,'fetch-guard.cjs'),fetchCount=path.join(work,'fetch-count.jsonl');
fs.mkdirSync(app,{mode:0o700});fs.mkdirSync(project,{mode:0o700});fs.mkdirSync(isolatedHome,{mode:0o700});fs.mkdirSync(isolatedCodex,{mode:0o700});
fs.mkdirSync(path.join(project,'.codex'),{mode:0o700});
const projectConfig=path.join(project,'.codex','config.toml');
fs.writeFileSync(projectConfig,'model = "synthetic-preserved"\n',{mode:0o600});
const projectConfigHash=hash(fs.readFileSync(projectConfig));
fs.writeFileSync(fetchGuard,`const fs=require('node:fs');\nconst file=process.env.CPB_FETCH_GUARD_FILE;\nglobalThis.fetch=(...args)=>{fs.appendFileSync(file,JSON.stringify({url:String(args[0])})+'\\n',{mode:0o600});return Promise.reject(new Error('Network blocked by the operations drill fetch guard'));};\n`,{mode:0o600});
// Keep child processes away from inherited provider credentials and session tokens.
const env={PATH:process.env.PATH??'/usr/bin:/bin',HOME:isolatedHome,CODEX_HOME:isolatedCodex,TMPDIR:os.tmpdir(),LANG:process.env.LANG??'C',CPB_HOME:home,npm_config_cache:npmCache};
const evidence={author:'Ethan',startedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,node:process.version,syntheticDataOnly:true,networkGuard:{enabled:true,attempts:null},archives:{previous:{path:previous,sha256:hash(fs.readFileSync(previous))},candidate:{path:candidate,sha256:hash(fs.readFileSync(candidate))}},steps:[],commandExits:[],cliTranscript:[],directoryModes:{}};
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function hash(bytes){return createHash('sha256').update(bytes).digest('hex');}
function safeMessage(value){return typeof value==='string'?value.replace(/(?:sk-or-v1-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+)/gi,'[REDACTED]').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,400):null;}
function mode(dir){return fs.existsSync(dir)?fs.statSync(dir).mode&0o777:null;}
function command(bin,argv,{cwd=work,allowFailure=false,state=home,fetchGuarded=false}={}){
 const commandEnv={...env,CPB_HOME:state,...(fetchGuarded?{NODE_OPTIONS:`--require=${fetchGuard}`,CPB_FETCH_GUARD_FILE:fetchCount}:{})};
 const r=spawnSync(bin,argv,{cwd,env:commandEnv,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
 if(r.error)throw r.error;
 const result={status:r.status,stdout:r.stdout??'',stderr:r.stderr??''};
 evidence.commandExits.push({command:path.basename(bin),args:argv.map(String),status:r.status,signal:r.signal??null,fetchGuarded});
 if(!allowFailure&&r.status!==0)throw new Error(`${path.basename(bin)} ${argv.join(' ')} failed (${r.status}): ${result.stderr||result.stdout}`);
 return result;
}
function npm(argv){return command('npm',['--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',app,...argv]);}
function cpb(argv,{allowFailure=false,state=home}={}){
 const bin=path.join(app,'node_modules','.bin','cpb');
 const r=command(bin,argv,{allowFailure,state,fetchGuarded:true});
 let value;try{value=JSON.parse(r.stdout);}catch{throw new Error(`Expected JSON from cpb ${argv[0]}: ${r.stdout}`);}
 const runError=value?.error&&typeof value.error==='object'?value.error:undefined;
 const summary={status:r.status,command:argv[0],id:value?.id??value?.taskId??null,version:value?.version??null,state:value?.state??null,errorCode:runError?.code??value?.error?.code??null,errorMessage:safeMessage(runError?.message??value?.error?.message)};
 evidence.cliTranscript.push(summary);
 return {status:r.status,value,stderr:r.stderr};
}
function inventory(dir){
 const rows=[];
 if(fs.existsSync(dir)){
  const rootStat=fs.lstatSync(dir);assert.equal(rootStat.isSymbolicLink(),false,'Store root must not be a symlink');assert.equal(rootStat.mode&0o077,0,'Store root is not private');
  rows.push({path:'.',kind:'directory',mode:rootStat.mode&0o777});
  function visit(p){for(const name of fs.readdirSync(p).sort()){const file=path.join(p,name),st=fs.lstatSync(file);assert.equal(st.isSymbolicLink(),false,`Unexpected symlink in state backup: ${file}`);assert.equal(st.mode&0o077,0,`State entry is not private: ${file}`);if(st.isDirectory()){rows.push({path:path.relative(dir,file),kind:'directory',mode:st.mode&0o777});visit(file);}else rows.push({path:path.relative(dir,file),kind:'file',mode:st.mode&0o777,sha256:hash(fs.readFileSync(file))});}}
  visit(dir);
 }
 return rows;
}
function install(archive){npm(['install',archive]);}
function copyTree(from,to){fs.cpSync(from,to,{recursive:true,preserveTimestamps:true,errorOnExist:true});}
function assertReadsPreserveState(action,state=home){
 const before=inventory(state),fixtureBefore={task:hash(fs.readFileSync(taskFile)),fact:hash(fs.readFileSync(factFile))};
 const result=action();
 assert.deepEqual(inventory(state),before,'A read-only inspection changed persistent state');
 assert.deepEqual({task:hash(fs.readFileSync(taskFile)),fact:hash(fs.readFileSync(factFile))},fixtureBefore,'A read-only inspection changed the sample or task');
 return result;
}

let failure,stateBackupInventory,fixtureHashes;
let taskFile,factFile;
evidence.directoryModes={scratch:mode(work),application:mode(app),project:mode(project),projectCodex:mode(path.join(project,'.codex')),projectConfig:mode(projectConfig),isolatedHome:mode(isolatedHome),isolatedCodexHome:mode(isolatedCodex),evidenceOutput:mode(output)};
try{
 evidence.workspaceStatusBefore=command('git',['status','--short','--branch'],{cwd:repoRoot}).stdout.trim();
 install(previous);evidence.steps.push({name:'clean install previous public archive',result:'PASS'});
 const versionOld=cpb(['--version']);assert.equal(versionOld.value.version,previousVersion);
 const sampleDir=path.join(project,'sample');const sample=cpb(['sample','--directory',sampleDir]);assert.equal(sample.status,0);
 evidence.directoryModes.sample=mode(sampleDir);
 taskFile=path.join(sampleDir,'task.json');factFile=path.join(sampleDir,'fact.txt');const generatedTaskHash=hash(fs.readFileSync(taskFile));const task=JSON.parse(fs.readFileSync(taskFile,'utf8'));
 task.taskId=randomUUID();task.writablePaths=['fact.txt'];task.allowedOperations=['read_file','write_file'];
 fs.writeFileSync(taskFile,JSON.stringify(task,null,2)+'\n',{mode:0o600});
 fixtureHashes={sampleFact:hash(fs.readFileSync(factFile)),taskBeforeExplicitEdit:generatedTaskHash,taskAfterFirstExplicitEdit:hash(fs.readFileSync(taskFile)),projectConfig:projectConfigHash};
 evidence.directoryModes.taskFile=mode(taskFile);evidence.directoryModes.sampleFact=mode(factFile);
 const first=cpb(['delegate','--provider','openrouter','--model',task.model,'--task-file',taskFile],{allowFailure:true});
 assert.equal(first.value.state,'BLOCKED');assert.equal(first.value.error?.code,'MISSING_CREDENTIALS','No key should block before provider access');
 const runId=task.taskId;
 const oldInspect=assertReadsPreserveState(()=>cpb(['inspect',runId]));assert.equal(oldInspect.value.id,runId);
 evidence.steps.push({name:`create and inspect synthetic ${previousVersion} history`,result:'PASS',runId,state:first.value.state,errorCode:first.value.error.code});

 install(candidate);const candidateVersion=cpb(['--version']).value.version;assert.equal(candidateVersion,nextVersion,'Candidate version must match the requested release');
 assert.equal(assertReadsPreserveState(()=>cpb(['inspect',runId])).value.id,runId);
 assert.ok(assertReadsPreserveState(()=>cpb(['runs','--limit','1000'])).value.some(x=>x.id===runId));
 // A fresh process above reopens the same private store, proving restart persistence.
 evidence.steps.push({name:'upgrade and restart with history retained',result:'PASS',version:candidateVersion});

 const secondId=randomUUID();task.taskId=secondId;fs.writeFileSync(taskFile,JSON.stringify(task,null,2)+'\n',{mode:0o600});
 fixtureHashes.taskAfterSecondExplicitEdit=hash(fs.readFileSync(taskFile));
 const second=cpb(['delegate','--provider','openrouter','--model',task.model,'--task-file',taskFile],{allowFailure:true});
 assert.equal(second.value.state,'BLOCKED');assert.equal(second.value.error?.code,'MISSING_CREDENTIALS');
 const originals=path.join(home,'runs',secondId,'originals','fact.txt');
 assert.equal(fs.readFileSync(originals,'utf8'),'This is safe sample data.\n');
 // CLI children have exited; make and compare a complete stopped-store copy.
 const before=inventory(home);stateBackupInventory=before;assert.ok(before.some(row=>row.path==='scheduler.sqlite'));
 const backup=path.join(work,'store-backup'),restored=path.join(work,'restored-store');copyTree(home,backup);
 evidence.directoryModes.cpbHome=mode(home);evidence.directoryModes.backup=mode(backup);
 assert.deepEqual(inventory(backup),before);
 evidence.steps.push({name:'stopped complete private-store backup',result:'PASS',fileCount:before.length});

 fs.writeFileSync(path.join(home,'runs',secondId,'run.json'),'invalid json');
 const damaged=cpb(['inspect',secondId],{allowFailure:true});
 assert.notEqual(damaged.status,0);assert.equal(damaged.value.error.code,'STORE_CORRUPT');
 copyTree(backup,restored);evidence.directoryModes.restoredStore=mode(restored);assert.deepEqual(inventory(restored),before);
 const inspectRestored=assertReadsPreserveState(()=>cpb(['inspect',secondId],{state:restored}),restored);
 assert.equal(inspectRestored.value.id,secondId);
 evidence.steps.push({name:'corruption visible and full-store restore',result:'PASS',errorCode:damaged.value.error.code});

 // Roll back application code to the previous archive while retaining the migrated store.
 npm(['install',previous]);
 const oldRollback=assertReadsPreserveState(()=>cpb(['inspect',secondId],{state:restored}),restored);assert.equal(oldRollback.value.id,secondId);
 const oldRuns=assertReadsPreserveState(()=>cpb(['runs','--limit','1000'],{state:restored}),restored);assert.ok(oldRuns.value.some(x=>x.id===runId));
 const rollbackVersion=cpb(['--version']).value.version;assert.equal(rollbackVersion,previousVersion);
 evidence.steps.push({name:'rollback inspection of retained state',result:'PASS',version:rollbackVersion});

 // Remove and reinstall the package with state and the separate project untouched.
 npm(['uninstall','codex-subagent-bridge']);assert.equal(fs.existsSync(path.join(app,'node_modules','.bin','cpb')),false);
 assert.deepEqual(inventory(restored),before);assert.equal(hash(fs.readFileSync(projectConfig)),projectConfigHash);
 npm(['install',candidate]);
 const reinstated=cpb(['inspect',secondId],{state:restored});assert.equal(reinstated.value.id,secondId);
 assert.equal(hash(fs.readFileSync(projectConfig)),projectConfigHash);assert.deepEqual(inventory(restored),before);
 const reinstalledVersion=cpb(['--version']).value.version;assert.equal(reinstalledVersion,nextVersion);
 evidence.steps.push({name:'uninstall and reinstall preserve state and Codex project config',result:'PASS',version:reinstalledVersion});
 assert.deepEqual({sampleFact:hash(fs.readFileSync(factFile)),task:hash(fs.readFileSync(taskFile))},{sampleFact:fixtureHashes.sampleFact,task:fixtureHashes.taskAfterSecondExplicitEdit},'CLI flow changed the synthetic source/task outside the explicit fixture edit');
 const fetchAttempts=fs.existsSync(fetchCount)?fs.readFileSync(fetchCount,'utf8').trim().split('\n').filter(Boolean).length:0;
 assert.equal(fetchAttempts,0,'CLI attempted a network fetch; guard blocked it');
 evidence.fixtureHashes={...fixtureHashes,projectConfig:projectConfigHash};
 evidence.workspaceStatusAfter=command('git',['status','--short','--branch'],{cwd:repoRoot}).stdout.trim();
}catch(error){failure=error;evidence.failure=String(error?.stack??error);}
finally{
 evidence.networkGuard.attempts=fs.existsSync(fetchCount)?fs.readFileSync(fetchCount,'utf8').trim().split('\n').filter(Boolean).length:0;
 fs.rmSync(work,{recursive:true,force:true});evidence.scratchRemoved=!fs.existsSync(work);
}
evidence.finishedAt=new Date().toISOString();
evidence.outcome=failure?'FAIL':'PASS';
evidence.topLevelStatus={exitCode:failure?1:0,completedSteps:evidence.steps.filter(x=>x.result==='PASS').length,totalSteps:evidence.steps.length};
evidence.directoryModes.output=mode(output);evidence.directoryModes.cpbHome=evidence.directoryModes.cpbHome??null;
evidence.stateFiles=stateBackupInventory??null;
evidence.projectConfigSha256=projectConfigHash;
const evidenceFile=path.join(output,failure?'release-operations-failure.json':'release-operations.json');
fs.writeFileSync(evidenceFile,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
if(failure)throw failure;
console.log(`Installed-package operations drill PASS; evidence: ${evidenceFile}`);
