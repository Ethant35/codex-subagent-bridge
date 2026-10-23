// Author: Ethan. Local bounded workload measurements; no inference or network calls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Workspace} from '../dist/workspace.js';
import {Store} from '../dist/store.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cpb-measure-'))),results=[];
const source=path.join(root,'source');fs.mkdirSync(source);
const base={version:1,taskId:randomUUID(),correlationId:'measurement',provider:'openrouter',backend:'api',model:'deepseek/deepseek-v4.1-flash-1017',instructions:'Read the authorized data.',workspaceRoot:source,allowedOperations:['read_file','write_file'],readablePaths:[],writablePaths:[],maxRuntimeMs:30000,maxToolSteps:4,maxSpendUsd:0,expectedOutput:'No inference',resultFormat:'text',networkPolicy:'provider-only'};
let client;
try{
  for(const [count,size,repetitions] of [[16,500000,5],[1000,100,2]]){
    const paths=Array.from({length:count},(_,i)=>`file-${i}.txt`);for(const p of paths)fs.writeFileSync(path.join(source,p),'a'.repeat(size));
    const samples=[];
    for(let n=0;n<repetitions;n++){
      const run=path.join(root,randomUUID());fs.mkdirSync(run,{mode:0o700});
      const task={...base,taskId:randomUUID(),writablePaths:paths,readablePaths:paths},ws=new Workspace(task,path.join(run,'workspace'));
      let start=performance.now();ws.prepare();const prepareMs=performance.now()-start;
      for(const p of paths)fs.writeFileSync(path.join(ws.root,p),(n%2===0?'b':'a').repeat(size));
      start=performance.now();assert.equal(ws.publish().length,count);const publishMs=performance.now()-start;
      samples.push({prepareMs,publishMs,rssBytes:process.memoryUsage().rss});fs.rmSync(run,{recursive:true,force:true});
    }
    results.push({fileCount:count,sourceBytes:count*size,samples});for(const p of paths)fs.unlinkSync(path.join(source,p));
  }
  fs.writeFileSync(path.join(source,'fact.txt'),'local soak data\n');
  const env={...process.env,CPB_HOME:path.join(root,'state')};delete env.OPENROUTER_API_KEY;delete env.ANTHROPIC_API_KEY;
  const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/cli.js'),'mcp'],env,stderr:'pipe'});
  client=new Client({name:'readiness-local-soak',version:'1'});await client.connect(transport);
  const latencies=[],rss=[],start=performance.now();
  for(let i=0;i<100;i++){
    const at=performance.now();const r=await client.callTool({name:'cpb_delegate',arguments:{...base,taskId:randomUUID(),readablePaths:['fact.txt'],writablePaths:[]}});
    const run=JSON.parse(r.content[0].text);assert.equal(r.isError,true);assert.equal(run.state,'BLOCKED');assert.equal(run.error.code,'MISSING_CREDENTIALS');latencies.push(performance.now()-at);
    if(i%10===0)rss.push({afterRuns:i+1,kib:Number(execFileSync('ps',['-o','rss=','-p',String(transport.pid)],{encoding:'utf8'}).trim())});
  }
  const elapsedMs=performance.now()-start;await client.close();client=undefined;
  const store=new Store(env.CPB_HOME);assert.equal(store.list({limit:1000}).length,100);
  const release=store.acquire(randomUUID());assert.equal(typeof release,'function');release();
  latencies.sort((a,b)=>a-b);
  fs.writeFileSync('evidence/readiness/performance.json',JSON.stringify({author:'Ethan',date:new Date().toISOString(),node:process.version,os:os.release(),platform:process.platform,arch:process.arch,providerCalls:0,workspace:results,mcpSoak:{requests:100,expectedState:'BLOCKED missing credentials',elapsedMs,medianMs:latencies[50],p95Ms:latencies[94],rssSamples:rss,postSoakSlotReuse:'PASS'},limits:['Single host and local filesystem; warm/cache effects uncontrolled.','RSS is sampled, not a leak proof or isolated peak allocation.','MCP soak exercises real transport/persistence/scheduler failures; it does not simulate successful provider compatibility.','Every writable source file has a private original copy; temporary staging and backups increase disk usage.']},null,2)+'\n');
  console.log('Workspace measurements and 100-request real MCP local soak PASS');
}finally{await client?.close();fs.rmSync(root,{recursive:true,force:true});}
