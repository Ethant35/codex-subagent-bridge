import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runOpenRouter } from '../dist/providers/openrouter.js';

const MODEL = 'example/tool-model';
const KEY = 'synthetic-provider-contract-test-key';
const PRICING = { prompt: '0.000001', completion: '0.000002', request: '0' };

function context(overrides = {}) {
  const task = {
    version: 1,
    taskId: '00000000-0000-4000-8000-000000000001',
    correlationId: 'provider-contract-test',
    provider: 'openrouter',
    backend: 'api',
    model: MODEL,
    instructions: 'Return one word.',
    workspaceRoot: '/tmp',
    allowedOperations: [],
    readablePaths: [],
    writablePaths: [],
    maxRuntimeMs: 10000,
    maxToolSteps: 1,
    maxSpendUsd: 0.1,
    expectedOutput: 'One word',
    resultFormat: 'text',
    networkPolicy: 'provider-only',
    ...overrides,
  };
  return {
    task,
    workspace: '/tmp',
    configPath: '/tmp/capability.json',
    signal: overrides.signal ?? new AbortController().signal,
    tools: { execute: async () => 'unused' },
    event: () => {},
  };
}

function modelCatalog(model = { id: MODEL, supported_parameters: ['tools'], pricing: PRICING }) {
  return new Response(JSON.stringify({ data: [model] }), { status: 200 });
}

function completion(message, extra = {}) {
  return new Response(JSON.stringify({
    id: 'controlled-generation',
    model: MODEL,
    usage: { prompt_tokens: 8, completion_tokens: 2, cost: 0.001 },
    choices: [{ finish_reason: 'stop', message }],
    ...extra,
  }), { status: 200 });
}

async function withFetch(handler, action) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const requests = [];
  process.env.OPENROUTER_API_KEY = KEY;
  globalThis.fetch = async (input, init = {}) => {
    const request = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: init.headers,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      signal: init.signal,
    };
    requests.push(request);
    return handler(request, requests.length);
  };
  try {
    return await action(requests);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
}

async function catalogThen(reply, taskOverrides = {}, ctxOverrides = {}) {
  return withFetch((request, index) => index === 1 ? modelCatalog() : reply(request), async (requests) => {
    const ctx = context(taskOverrides);
    Object.assign(ctx, ctxOverrides);
    return { result: await runOpenRouter(ctx), requests, ctx };
  });
}

test('controlled successful read preserves exact instructions and executes one authorized read', async () => {
  const instructions = 'Read fact.txt exactly; return “done” only after reading it.  ';
  const toolCalls = [];
  const { result, requests } = await catalogThen((request) => {
    if (request.method !== 'POST') throw new Error('unexpected request');
    if (request.body.messages.some((message) => message.role === 'tool')) {
      return completion({ role: 'assistant', content: 'done' });
    }
    return completion({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call-read-1', type: 'function', function: { name: 'read_file', arguments: '{"path":"fact.txt"}' } }],
    }, { choices: [{ finish_reason: 'tool_calls', message: {
      role: 'assistant', content: null,
      tool_calls: [{ id: 'call-read-1', type: 'function', function: { name: 'read_file', arguments: '{"path":"fact.txt"}' } }],
    } }] });
  }, {
    instructions,
    allowedOperations: ['read_file'],
    readablePaths: ['fact.txt'],
  }, {
    tools: { execute: async (name, args) => { toolCalls.push({ name, args }); return 'nonce: 7c19\n'; } },
  });

  assert.equal(requests.length, 3);
  assert.equal(requests.filter((request) => request.method === 'POST').length, 2);
  assert.equal(requests[1].body.messages.find((message) => message.role === 'user').content, instructions);
  assert.equal(requests[1].body.max_tokens <= 4096, true);
  assert.equal(requests[1].body.provider.allow_fallbacks, false);
  assert.deepEqual(toolCalls, [{ name: 'read_file', args: { path: 'fact.txt' } }]);
  assert.equal(requests[2].body.messages.find((message) => message.role === 'tool').content, 'nonce: 7c19\n');
  assert.equal(result.output, 'done');
  assert.deepEqual(result.sources, ['fact.txt']);
});

test('finite budget rejects missing prompt price before inference', async () => {
  await withFetch((request, index) => {
    if (index === 1) return modelCatalog({ id: MODEL, supported_parameters: ['tools'], pricing: { completion: '0.000002', request: '0' } });
    return completion({ role: 'assistant', content: 'would be too late' });
  }, async (requests) => {
    await assert.rejects(runOpenRouter(context()), (error) => error.code === 'UNKNOWN_PRICING');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'GET');
  });
});

const malformedCompletionCases = [
  ['missing choices', {}, 'MALFORMED_RESPONSE'],
  ['null tool-call entry', { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [null] } }] }, 'MALFORMED_TOOL'],
  ['object output', { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: { text: 'done' } } }] }, 'EMPTY_OR_INCOMPLETE_RESULT'],
  ['empty output', { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '  ' } }] }, 'EMPTY_OR_INCOMPLETE_RESULT'],
  ['unknown cost under finite cap', { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'done' } }], usage: { prompt_tokens: 8, completion_tokens: 2 } }, 'UNKNOWN_COST'],
  ['malformed tool-call JSON', { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [{ id: 'call-bad', type: 'function', function: { name: 'read_file', arguments: '{' } }] } }] }, 'MALFORMED_TOOL'],
];

for (const [label, responseShape, expectedCode] of malformedCompletionCases) {
  test(`controlled provider rejects ${label} without false completion`, async () => {
    let calls = 0;
    const tools = { execute: async () => { calls++; return 'unexpected'; } };
    await withFetch((request, index) => index === 1 ? modelCatalog() : new Response(JSON.stringify({
      id: 'controlled-generation', model: MODEL,
      usage: { prompt_tokens: 8, completion_tokens: 2, cost: 0.001 },
      ...responseShape,
    }), { status: 200 }), async (requests) => {
      const ctx = context({ allowedOperations: ['read_file'] });
      ctx.tools = tools;
      await assert.rejects(runOpenRouter(ctx), (error) => error.code === expectedCode);
      assert.equal(requests.filter((item) => item.method === 'POST').length, 1);
      assert.equal(calls, 0);
    });
  });
}

test('malformed catalog entries fail closed before inference', async () => {
  await withFetch(() => new Response(JSON.stringify({ data: [null] }), { status: 200 }), async (requests) => {
    await assert.rejects(runOpenRouter(context()), (error) => error.code === 'MALFORMED_CATALOG');
    assert.equal(requests.length, 1);
  });
});

test('null catalog JSON is classified as malformed without inference', async () => {
  await withFetch(() => new Response('null', { status: 200 }), async (requests) => {
    await assert.rejects(runOpenRouter(context()), (error) => error.code === 'MALFORMED_CATALOG');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'GET');
  });
});

test('null completion JSON is classified as malformed without retry', async () => {
  let toolExecutions = 0;
  await withFetch((request, index) => index === 1 ? modelCatalog() : new Response('null', { status: 200 }), async (requests) => {
    const ctx = context();
    ctx.tools = { execute: async () => { toolExecutions++; return 'unexpected'; } };
    await assert.rejects(runOpenRouter(ctx), (error) => error.code === 'MALFORMED_RESPONSE');
    assert.equal(requests.filter((request) => request.method === 'POST').length, 1);
  });
  assert.equal(toolExecutions, 0);
});

for (const [status, expectedCode] of [[401, 'AUTH_FAILED'], [429, 'RATE_LIMITED']]) {
  test(`HTTP ${status} inference response fails without retry`, async () => {
    await withFetch((request, index) => index === 1 ? modelCatalog() : new Response('controlled error', { status }), async (requests) => {
      await assert.rejects(runOpenRouter(context()), (error) => error.code === expectedCode);
      assert.equal(requests.filter((item) => item.method === 'POST').length, 1);
    });
  });
}

test('uncertain failed inference request is never retried', async () => {
  await withFetch((request, index) => {
    if (index === 1) return modelCatalog();
    throw new Error('connection dropped after request dispatch');
  }, async (requests) => {
    await assert.rejects(runOpenRouter(context()), (error) => error.code === 'NETWORK_ERROR');
    assert.equal(requests.filter((item) => item.method === 'POST').length, 1);
  });
});

test('oversized catalog response is rejected before inference', async () => {
  await withFetch(() => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(4_000_001)); controller.close(); },
  }), { status: 200 }), async (requests) => {
    await assert.rejects(runOpenRouter(context()), (error) => error.code === 'OUTPUT_LIMIT');
    assert.equal(requests.length, 1);
  });
});

test('interrupted inference response fails without retry', async () => {
  await withFetch((request, index) => index === 1 ? modelCatalog() : new Response(new ReadableStream({
    start(controller) { controller.error(new Error('controlled stream interruption')); },
  }), { status: 200 }), async (requests) => {
    await assert.rejects(runOpenRouter(context()), (error) => error.code === 'NETWORK_ERROR');
    assert.equal(requests.filter((item) => item.method === 'POST').length, 1);
  });
});

test('abort during inference response stops without retry', async () => {
  const controller = new AbortController();
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  await withFetch((request, index) => {
    if (index === 1) return modelCatalog();
    markStarted();
    return new Promise((resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  }, async (requests) => {
    const pending = runOpenRouter(context({ signal: controller.signal }));
    await started;
    controller.abort();
    await assert.rejects(pending);
    assert.equal(requests.filter((item) => item.method === 'POST').length, 1);
  });
});


test('structured pricing overrides use conservative rates without weakening provider price caps', async () => {
  const pricing={...PRICING,overrides:[
    {utc_start:800,utc_end:1600,prompt:'0.000004',completion:'0.000006'},
    {prompt_tokens:200000,prompt:'0.000003',completion:'0.000005'},
  ]};
  await withFetch((request,index)=>index===1?modelCatalog({id:MODEL,supported_parameters:['tools'],pricing}):completion({role:'assistant',content:'done'}),async requests=>{
    const result=await runOpenRouter(context());assert.equal(result.output,'done');
    assert.equal(requests.length,2);
    assert.deepEqual(requests[1].body.provider.max_price,{prompt:4,completion:6,request:0});
    assert.equal(requests[1].body.provider.allow_fallbacks,false);
  });
});

for(const [label,overrides] of [
  ['non-array',{prompt:'0.1'}],['null entry',[null]],['unknown prompt',[{prompt:null}]],
  ['unknown completion',[{completion:'invalid'}]],['request charge',[{request:'0.1'}]],
  ['negative price',[{prompt:'-0.1'}]],
])test(`finite budget rejects ${label} override before inference`,async()=>{
  await withFetch(()=>modelCatalog({id:MODEL,supported_parameters:['tools'],pricing:{...PRICING,overrides}}),async requests=>{
    await assert.rejects(runOpenRouter(context()),e=>e.code==='UNKNOWN_PRICING');
    assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');
  });
});

test('omitted request price requires explicit zero request-price routing cap',async()=>{
  await withFetch((request,index)=>index===1?modelCatalog({id:MODEL,supported_parameters:['tools'],pricing:{prompt:PRICING.prompt,completion:PRICING.completion}}):completion({role:'assistant',content:'done'}),async requests=>{
    assert.equal((await runOpenRouter(context())).output,'done');
    assert.equal(requests.length,2);
    assert.equal(requests[1].body.provider.max_price.request,0);
    assert.equal(requests[1].body.provider.require_parameters,true);
    assert.equal(requests[1].body.provider.allow_fallbacks,false);
  });
});
for(const request of [null,'', 'invalid','-1','0.1'])test(`invalid or nonzero base request price ${JSON.stringify(request)} blocks inference`,async()=>{
  await withFetch(()=>modelCatalog({id:MODEL,supported_parameters:['tools'],pricing:{...PRICING,request}}),async requests=>{
    await assert.rejects(runOpenRouter(context()),e=>e.code==='UNKNOWN_PRICING');assert.equal(requests.length,1);
  });
});
