// Author: Ethan. Local candidate qualification; never enables live provider tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
assert.deepEqual(process.argv.slice(2,3),['--output'],'Usage: node verify.mjs --output NEW_DIRECTORY');
assert.equal(process.argv.length,4,'Provide exactly one new output directory');
const out=path.resolve(process.argv[3]);
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.mkdirSync(out,{mode:0o700});
const scratch=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-verify-')));
const env={PATH:process.env.PATH,LANG:'en_US.UTF-8',TMPDIR:scratch,HOME:path.join(scratch,'home'),CODEX_HOME:path.join(scratch,'codex'),CPB_HOME:path.join(scratch,'state'),npm_config_cache:path.join(os.homedir(),'.npm')};
fs.mkdirSync(env.HOME,{mode:0o700});
const clean=s=>String(s??'').split(scratch).join('<scratch>').split(repo).join('<repo>');
const write=(file,value)=>fs.writeFileSync(path.join(out,file),typeof value==='string'?clean(value):JSON.stringify(value,null,2)+'\n',{mode:0o600});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const summary={author:'Ethan',kind:'local-source-and-package-candidate',startedAt:new Date().toISOString(),runtime:{node:process.version,platform:process.platform,arch:process.arch},status:'running',liveDelegation:'unexercised',nativeParent:'unexercised',paidCallsAuthorized:false,commands:[],scratchRemoved:false};
const transcripts=[];
function command(label,exe,args,{cwd=repo,status=0,timeout=180000}={}){
  const r=spawnSync(exe,args,{cwd,env,encoding:'utf8',timeout,killSignal:'SIGKILL',maxBuffer:16*1024*1024});
  const record={label,argv:args.map(clean),status:r.status,signal:r.signal,error:r.error?.message??null,stdout:clean(r.stdout),stderr:clean(r.stderr)};
  summary.commands.push({label,status:r.status});
  write(label+'.log',JSON.stringify(record,null,2)+'\n');
  assert.equal(r.error,undefined,label+': '+r.error?.message);
  assert.equal(r.status,status,label+': '+clean(r.stderr)+'\n'+clean(r.stdout));
  return r;
}
try{
  command('check','npm',['run','check']);
  const tests=command('tests','npm',['test']);
  summary.testCounts=Object.fromEntries(['tests','pass','fail','skipped'].map(key=>[key,Number(tests.stdout.match(new RegExp('^# '+key+' (\\d+)$','m'))?.[1]??NaN)]));
  assert.ok(Number.isFinite(summary.testCounts.tests)&&summary.testCounts.tests>0,'Missing test summary');
  assert.equal(summary.testCounts.fail,0);
  const pack=JSON.parse(command('pack','npm',['pack','--ignore-scripts','--json','--pack-destination',scratch]).stdout)[0];
  const archive=path.join(scratch,pack.filename);
  summary.package={name:pack.name,version:pack.version,sha256:hash(archive),fileCount:pack.files.length};
  fs.copyFileSync(archive,path.join(out,pack.filename));
  const prefix=path.join(scratch,'install');
  command('install','npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',prefix,archive]);
  const installed=path.join(prefix,'node_modules',pack.name);
  const runtime=pack.files.filter(f=>f.path.startsWith('dist/')).map(f=>f.path);
  assert.ok(runtime.length>0,'Empty runtime package');
  for(const file of runtime)assert.equal(hash(path.join(installed,file)),hash(path.join(repo,file)),file+' installed bytes differ');
  summary.runtimeFilesMatched=runtime.length;
  const sourceFiles=fs.readdirSync(path.join(repo,'src'),{recursive:true}).filter(f=>/\.ts$/.test(f)).map(f=>'src/'+f);
  const testFiles=fs.readdirSync(path.join(repo,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f);
  const skillFiles=['SKILL.md','references/features.md','agents/openai.yaml','scripts/verify.mjs'].map(f=>'.agents/verify-codex-subagent-bridge/'+f);
  write('source-hashes.json',Object.fromEntries([...sourceFiles,...testFiles,'package.json','package-lock.json',...skillFiles].map(f=>[f,hash(path.join(repo,f))])));
  const cli=path.join(installed,'dist/cli.js'),project=path.join(scratch,'example');
  function run(label,args,status=0,sqliteFree=true){
    const r=command(label,process.execPath,[cli,...args],{cwd:scratch,status,timeout:10000});
    transcripts.push({label,args:args.map(clean),status:r.status,stdout:clean(r.stdout),stderr:clean(r.stderr)});
    if(sqliteFree)assert.doesNotMatch(r.stderr,/ExperimentalWarning: SQLite/);
    return r.stdout;
  }
  assert.equal(JSON.parse(run('version',['--version'])).version,pack.version);
  const doctor=JSON.parse(run('doctor-default',['doctor','--provider','openrouter']));
  assert.deepEqual(JSON.parse(run('doctor-json',['doctor','--provider','openrouter','--json'])),doctor);
  assert.equal(doctor.openrouter.status,'MISSING_CREDENTIALS');
  const human=run('doctor-human',['doctor','--provider','openrouter','--human']);
  assert.match(human,/OpenRouter API key: missing/);assert.match(human,/Runtime:/);
  const start=run('start',['start','--directory',project]);
  assert.match(start,/OPENROUTER_API_KEY/);assert.doesNotMatch(start,/cpb run|--consent-spend/);
  const taskFile=path.join(project,'task.json'),fact=path.join(project,'fact.txt'),before=fs.readFileSync(taskFile);
  assert.equal(JSON.parse(before).maxSpendUsd,0);
  fs.writeFileSync(fact,'retained synthetic edit\n');
  const replay=JSON.parse(run('start-repeat',['start','--directory',project,'--json']));
  assert.equal(replay.validation.networkRequests,0);assert.doesNotMatch(replay.next,/cpb run/);
  assert.deepEqual(fs.readFileSync(taskFile),before);assert.equal(fs.readFileSync(fact,'utf8'),'retained synthetic edit\n');
  const valid=JSON.parse(run('validate',['validate','--task-file',taskFile,'--json']));
  assert.equal(valid.valid,true);assert.equal(valid.credentialPresent,false);
  const missing=JSON.parse(run('missing-input',['task','--directory',project,'--read','missing.txt','--instructions','Read missing.txt','--output',path.join(project,'missing-task.json'),'--json'],1));
  assert.equal(missing.error.code,'NOT_FOUND');assert.match(missing.error.message,/missing\.txt/);
  assert.equal(fs.existsSync(path.join(project,'missing-task.json')),false);
  const preview=JSON.parse(run('connect-preview',['connect','--directory',project,'--json']));
  assert.equal(preview.applied,false);assert.equal(fs.existsSync(path.join(project,'.codex')),false);
  const refused=JSON.parse(run('no-consent',['run','--task-file',taskFile,'--max-spend','0.02','--json'],1));
  assert.equal(refused.error.code,'SPEND_CONSENT_REQUIRED');
  assert.equal(fs.existsSync(env.CPB_HOME),false,'Setup or refusal created run state');
  assert.deepEqual(JSON.parse(run('empty-runs',['runs'],0,false)),[]);
  summary.status='passed';
}catch(error){
  summary.status='failed';summary.failure=clean(error.message);process.exitCode=1;
}finally{
  write('installed-cli.json',transcripts);
  fs.rmSync(scratch,{recursive:true,force:true});
  summary.scratchRemoved=!fs.existsSync(scratch);
  summary.finishedAt=new Date().toISOString();
  write('summary.json',summary);
  process.stdout.write(JSON.stringify({status:summary.status,evidence:out,testCounts:summary.testCounts,scratchRemoved:summary.scratchRemoved,failure:summary.failure})+'\n');
}
