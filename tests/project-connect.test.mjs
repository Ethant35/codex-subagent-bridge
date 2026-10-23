import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {connectProject} from '../dist/project-connect.js';

const cli=path.resolve('dist/cli.js');
function fixture(){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-connect-')));return{root,project:path.join(root,'project'),clean(){fs.rmSync(root,{recursive:true,force:true});}};}

test('connect preview has no side effects and includes exact installed CLI without secrets',()=>{
  const f=fixture();try{fs.mkdirSync(f.project);const result=connectProject(path.relative(process.cwd(),f.project),false,cli);assert.equal(result.applied,false);assert.equal(result.alreadyConfigured,false);assert.equal(fs.existsSync(path.join(f.project,'.codex')),false);assert.ok(result.config.includes(`command = ${JSON.stringify(process.execPath)}`));assert.ok(result.config.includes(`args = [${JSON.stringify(fs.realpathSync(cli))}, "mcp"]`));assert.ok(result.config.includes('env_vars = ["OPENROUTER_API_KEY"]'));assert.ok(result.config.includes('tool_timeout_sec = 180'));assert.ok(!result.config.includes('sk-or-'));assert.match(result.next,/asks separately/);assert.match(result.next,/--directory '\/.*project'/);}finally{f.clean();}
});

test('explicit trust appends an idempotent managed block and preserves unrelated TOML bytes',()=>{
  const f=fixture();try{fs.mkdirSync(f.project);fs.mkdirSync(path.join(f.project,'.codex'),{mode:0o700});const initial='# User setting\nmodel = "keep exactly"\n';const config=path.join(f.project,'.codex/config.toml');fs.writeFileSync(config,initial);const result=connectProject(f.project,true,cli);assert.equal(result.applied,true);assert.equal(fs.readFileSync(config,'utf8'),initial+'\n'+result.config+'\n');assert.equal(fs.readdirSync(path.dirname(config)).filter(x=>x.includes('.cpb-backup-')).length,1);const replay=connectProject(f.project,true,cli);assert.equal(replay.applied,false);assert.equal(replay.alreadyConfigured,true);assert.equal(fs.readFileSync(config,'utf8'),initial+'\n'+result.config+'\n');const altered=initial+'\n'+result.config+'\n[mcp_servers.cpb.env]\nOPENROUTER_API_KEY = "secret-sentinel"\n';fs.writeFileSync(config,altered);assert.throws(()=>connectProject(f.project,true,cli),e=>e.code==='CONFIG_CONFLICT');assert.equal(fs.readFileSync(config,'utf8'),altered);}finally{f.clean();}
});

test('existing inline mcp_servers and unmanaged cpb sections are refused without changing bytes',()=>{
  const f=fixture();try{fs.mkdirSync(f.project);fs.mkdirSync(path.join(f.project,'.codex'));const config=path.join(f.project,'.codex/config.toml');for(const initial of ['mcp_servers = { other = { command = "x" } }\n','[mcp_servers.cpb]\ncommand = "user-owned"\n','[mcp_servers."cpb"]\ncommand = "quoted-user-owned"\n','[mcp_servers.cpb.env]\nKEY = "conflict"\n']){fs.writeFileSync(config,initial);assert.throws(()=>connectProject(f.project,true,cli),/mcp_servers|cpb/i);assert.equal(fs.readFileSync(config,'utf8'),initial);}}finally{f.clean();}
});

test('invalid TOML and secret-bearing unrelated settings are not exposed or modified',()=>{
  const f=fixture();try{fs.mkdirSync(f.project);fs.mkdirSync(path.join(f.project,'.codex'));const config=path.join(f.project,'.codex/config.toml');const secret='api_key = "private-sentinel-value"\n';fs.writeFileSync(config,secret+'model = "keep"\n');const preview=connectProject(f.project,false,cli);assert.ok(!preview.config.includes('private-sentinel-value'));assert.ok(!preview.next.includes('private-sentinel-value'));assert.equal(fs.readFileSync(config,'utf8'),secret+'model = "keep"\n');const invalid='model = "unterminated\n';fs.writeFileSync(config,invalid);assert.throws(()=>connectProject(f.project,true,cli),e=>e.code==='INVALID_CONFIG'&&/valid TOML/.test(e.message));assert.equal(fs.readFileSync(config,'utf8'),invalid);}finally{f.clean();}
});

test('refuses user config target and symlink or FIFO config without mutation',()=>{
  const f=fixture();try{fs.mkdirSync(f.project);const original=process.env.CODEX_HOME;process.env.CODEX_HOME=f.root;try{assert.throws(()=>connectProject(f.root,true,cli),/user configuration/);}finally{if(original===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=original;}
    const codex=path.join(f.project,'.codex');fs.mkdirSync(codex);const config=path.join(codex,'config.toml');fs.symlinkSync(path.join(f.root,'elsewhere'),config);assert.throws(()=>connectProject(f.project,true,cli),/unsafe/);fs.unlinkSync(config);assert.equal(spawnSync('mkfifo',[config]).status,0);assert.throws(()=>connectProject(f.project,true,cli),/unsafe/);
  }finally{f.clean();}
});

test('refuses symlink project and config directories',()=>{
  const f=fixture();try{fs.mkdirSync(f.project);fs.mkdirSync(path.join(f.root,'real-codex'));fs.symlinkSync(path.join(f.root,'real-codex'),path.join(f.project,'.codex'));assert.throws(()=>connectProject(f.project,true,cli),/unsafe directory/);const linked=path.join(f.root,'linked-project');fs.symlinkSync(f.project,linked);assert.throws(()=>connectProject(linked,true,cli),/unsafe directory/);}finally{f.clean();}
});
test('refuses a project whose .codex is the active CODEX_HOME',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cpb-user-config-')),before=process.env.CODEX_HOME;
  try{process.env.CODEX_HOME=path.join(fs.realpathSync(root),'.codex');assert.throws(()=>connectProject(root,true,cli),e=>e.code==='UNSAFE_CONFIG');assert.equal(fs.existsSync(process.env.CODEX_HOME),false);}
  finally{if(before===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=before;fs.rmSync(root,{recursive:true,force:true});}
});
