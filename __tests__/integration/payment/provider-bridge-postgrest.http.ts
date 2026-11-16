/** Disposable D2 bridge. Root owns the database, native observation and cleanup. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@supabase/supabase-js';
import { createWebPaymentChargeRepository } from '../../../lib/payment/paypal-charge/repository';
import { createRpcChargeBindingSource } from '../../../lib/payment/paypal-charge/binding-source';
import { createRpcProviderEntryGate } from '../../../lib/payment/paypal-charge/provider-entry';
import { ensurePayPalProviderOrder, capturePayPalOrder, type PayPalChargeDeps } from '../../../lib/payment/paypal-charge/orchestrator';
import type { PayPalTransport } from '../../../lib/payment/paypal-charge/transport';

const guard = require('/fixture/guard.cjs');
const config = JSON.parse(fs.readFileSync('/fixture/config.json', 'utf8'));
const phase = process.argv[2];
assert.equal(config.phaseSet, 'd2');
assert.ok(['A','B','C'].includes(phase));
const hash = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(`/fixture/native-${phase}.json`);
assert.equal(hash(bytes), process.argv[3], 'Native input pin differs');
const native = JSON.parse(bytes.toString('utf8'));
assert.equal(native.phaseSet, 'd2');
const executionPins = {bundleSha256: hash(fs.readFileSync('/fixture/provider-bridge-http.cjs')),
  guardSha256: hash(fs.readFileSync('/fixture/guard.cjs')), entryDeliverySha256: config.executionPins.entryDeliverySha256};
assert.deepEqual(executionPins, config.executionPins);
const labels = ['F1','F2','F3','F4a','F4b','F5','F5prime','F6','F7','L1-CLAIM','N-A','N-B','N-C','ORD-ACL'];
const cases = new Map<string, any>(config.cases.map((row: any) => [row.label, row]));
assert.equal(cases.size, 23);
const rpc = {getter:'get_web_payment_charge_context', prepare:'prepare_web_payment_provider_context',
  binding:'get_web_payment_provider_binding', entry:'authorize_web_payment_provider_entry',
  bind:'bind_web_payment_provider_identity', record:'record_web_payment_observation', claim:'claim_web_payment_charge',
  intent:'record_web_payment_submission_intent', receive:'receive_web_payment_purchase'};
type Trace = {label: string; orderLabel: string; scope: 'setup' | 'measured'; lane: number; step: number};
const context = new AsyncLocalStorage<Trace>();
const taps: any[] = [], direct: any[] = [], scenarios: any[] = [], openFindings: any[] = [];
const pending = new Map<string, any>();
const claims = new Map<string, any>();
const winners = new Map<string, string>();
let server: http.Server | null = null;
let firstProxyError: unknown;
let serial = 0;
const token = (role: string) => {
  assert.ok(['service','anon','authenticated'].includes(role));
  return config.tokens[role];
};
const actorArgs = (label: string) => ({p_actor_user_id: cases.get(label).actor, p_order_id: cases.get(label).order});
const input = (label: string) => ({actorUserId: cases.get(label).actor, orderId: cases.get(label).order});
function semanticHeaders(headers: Headers) {
  return {accept: headers.get('accept'), prefer: headers.get('prefer'), contentType: headers.get('content-type'),
    contentProfile: headers.get('content-profile'), acceptProfile: headers.get('accept-profile'),
    apikeyMatches: headers.get('apikey') === token('service'),
    authorizationMatches: headers.get('authorization') === `Bearer ${token('service')}`,
    clientInfoVersion: /^supabase-js\/([0-9]+\.[0-9]+\.[0-9]+)(?:;|$)/.exec(headers.get('x-client-info') || '')?.[1] ?? null};
}
const expectedHeaders = {accept:null, prefer:null, contentType:'application/json', contentProfile:'public',
  acceptProfile:null, apikeyMatches:true, authorizationMatches:true, clientInfoVersion:'2.112.3'};
const measuredFetch: typeof fetch = async (target, init) => {
  const trace = context.getStore();
  assert.ok(trace, 'SDK request has no scenario/lane');
  const headers = new Headers(init?.headers || (target instanceof Request ? target.headers : undefined));
  const sdkHeaders = semanticHeaders(headers);
  assert.deepEqual(sdkHeaders, expectedHeaders);
  const id = String(++serial);
  pending.set(id, {trace:{...trace, step:trace.step++}, sdkHeaders});
  headers.set('x-fixture-trace', id);
  return fetch(target, {...init, headers});
};
function wire(url: URL, method: string, role: string, body?: string) {
  return new Promise<{status:number; response:any; rawBody:string; parseError:string|null}>((resolve,reject) => {
    const request = http.request(url, {method, headers:{authorization:`Bearer ${token(role)}`,
      accept:'application/json', 'content-type':'application/json'}}, response => {
      const chunks: Buffer[] = []; let size=0,finished=false;
      const finish=(failure:string|null=null)=>{
        if(finished) return;
        finished=true;
        let rawBody=Buffer.concat(chunks).toString('utf8');
        // A split UTF-8 sequence can expand to a replacement character.
        while(Buffer.byteLength(rawBody,'utf8')>65536) rawBody=rawBody.slice(0,-1);
        let parsed:any=null,parseError=failure;
        try { parsed=JSON.parse(rawBody); }
        catch { parseError ??='NON_JSON'; }
        resolve({status:response.statusCode??0,response:parsed,rawBody,parseError});
      };
      response.on('data', chunk => {
        if(finished) return;
        const bytes=Buffer.from(chunk),remaining=65536-size;
        chunks.push(bytes.subarray(0,remaining)); size+=Math.min(bytes.length,remaining);
        if(bytes.length>remaining) { finish('RESPONSE_TOO_LARGE'); response.destroy(); }
      });
      response.on('error',reject);
      response.on('end', () => finish());
    });
    request.setTimeout(10000, () => request.destroy(new Error('HTTP fixture deadline')));
    request.on('error',reject);
    if (body!==undefined) request.write(body);
    request.end();
  });
}
async function startProxy() {
  server=http.createServer((request,response) => {
    void (async () => {
      const id=request.headers['x-fixture-trace'];
      assert.equal(typeof id,'string');
      const attempt=pending.get(id as string);
      assert.ok(attempt,'Unregistered SDK attempt');
      pending.delete(id as string);
      const trace=attempt.trace as Trace;
      const url=new URL(request.url!,'http://127.0.0.1');
      assert.equal(request.method,'POST');
      assert.equal(url.search,'');
      const name=url.pathname.slice('/rest/v1/rpc/'.length);
      assert.ok(url.pathname.startsWith('/rest/v1/rpc/') && Object.values(rpc).includes(name));
      const incoming=new Headers();
      for (const [key,value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) value.forEach(item => incoming.append(key,item));
        else if (value!==undefined) incoming.set(key,value);
      }
      const incomingHeaders=semanticHeaders(incoming);
      assert.deepEqual(incomingHeaders,{...attempt.sdkHeaders,accept:'*/*'});
      const chunks: Buffer[]=[]; let size=0;
      for await (const chunk of request) {
        size+=chunk.length; assert.ok(size<=16384); chunks.push(Buffer.from(chunk));
      }
      const body=Buffer.concat(chunks).toString('utf8');
      const args=JSON.parse(body);
      const prior=claims.get(trace.orderLabel);
      const leaseTokenMatchesClaim=name===rpc.intent ? Boolean(prior && args.p_lease_token===prior.lease_token
        && args.p_attempt_id===prior.attempt_id && args.p_fencing_version===prior.fencing_version) : null;
      if (name===rpc.intent) assert.equal(leaseTokenMatchesClaim,true,'Intent raw capability mismatch');
      const upstream=await wire(new URL(`http://${config.restIp}:3000/rpc/${name}`),'POST','service',body);
      assert.equal(upstream.parseError,null,'Invalid upstream JSON or response bound');
      const redactedArgs=structuredClone(args);
      if ('p_lease_token' in redactedArgs) redactedArgs.p_lease_token='<redacted>';
      if (name===rpc.claim && upstream.response.decision==='SUBMIT') claims.set(trace.orderLabel,upstream.response);
      const projectedResponse=structuredClone(upstream.response);
      if ('lease_token' in projectedResponse) projectedResponse.lease_token='<redacted>';
      const downstreamDestroyed=trace.label==='F5' && name===rpc.intent;
      taps.push({...trace,rpc:name,method:'POST',args:redactedArgs,status:upstream.status,response:projectedResponse,
        upstream:true,injected:false,retryHeader:incoming.get('x-retry-count'),sdkHeaders:attempt.sdkHeaders,
        incomingHeaders,leaseTokenMatchesClaim,downstreamDestroyed});
      if (downstreamDestroyed) {
        assert.equal(upstream.status,200,'F5 upstream must have committed before socket destruction');
        assert.equal(upstream.response.decision,'SUBMIT');
        response.destroy();
        return;
      }
      response.writeHead(upstream.status,{'content-type':'application/json'});
      response.end(upstream.rawBody);
    })().catch(error => {
      firstProxyError ??= error;
      if (!response.headersSent) response.writeHead(500,{'content-type':'application/json'});
      response.end(JSON.stringify({code:'FIXTURE_PROXY_FAILURE'}));
    });
  });
  await new Promise<void>((resolve,reject) => { server!.once('error',reject); server!.listen({host:'127.0.0.1',port:0},resolve); });
  const address=server.address(); assert.ok(address && typeof address==='object');
  guard.allowProxy(address.port);
  return `http://127.0.0.1:${address.port}`;
}
async function probes(proxy:string) {
  const base=`http://${config.restIp}:3000/rpc/`;
  const tests: [string,string][] = [
    [`https://${config.restIp}:3000/rpc/${rpc.binding}`,'GET'],
    [`http://order-rest:3000/rpc/${rpc.binding}`,'GET'],
    [base+'create_web_payment_order','POST'], [`http://127.0.0.1:54322/rpc/${rpc.binding}`,'GET'],
    [base+rpc.prepare,'GET'], [base+rpc.getter,'PUT'], [base+rpc.getter,'GET'], [base+rpc.binding+'?unexpected=1','POST']];
  const entryGet=new URL(`/rest/v1/rpc/${rpc.entry}`,proxy);
  for(const [key,value] of Object.entries({...actorArgs('ORD-ACL'),p_context_id:crypto.randomUUID(),
    p_create_request_key:crypto.randomUUID(),p_binding_hash:'a'.repeat(64)})) entryGet.searchParams.set(key,value);
  tests.push([entryGet.toString(),'GET']);
  for (const [url,method] of tests) await assert.rejects(async () => fetch(url,{method}),
    (error:any) => error.code==='PROVIDER_RPC_HTTP_NETWORK_DENIED');
  assert.deepEqual(guard.report().blocked,['http','http-address','rpc-path','http-address','rpc-method','rpc-method','rpc-query','rpc-query','rpc-method']);
}
function runIn<T>(label:string,orderLabel:string,scope:'setup'|'measured',lane:number,fn:()=>Promise<T>) {
  return context.run({label,orderLabel,scope,lane,step:0},fn);
}
function providerId(label:string) { return 'ORDER'+label.replaceAll('-','').toUpperCase(); }
function fakeBody(label:string,capture=false,badPayee=false) {
  const baseline=native.bridgeNative[label].context;
  const body:any={id:providerId(label),status:capture?'COMPLETED':'CREATED',intent:'CAPTURE',purchase_units:[{
    custom_id:'v2:'+cases.get(label).order,amount:{value:'1.23',currency_code:'USD'},
    payee:{merchant_id:badPayee?'different-merchant':'binding-merchant-v1'},payments:{captures:[]}}]};
  assert.equal(baseline.amount_minor,'123');
  assert.equal(baseline.currency,'USD');
  if (capture) {
    body.purchase_units[0].payments.captures=[{id:'CAPTURE'+label.replaceAll('-','').toUpperCase(),status:'COMPLETED',
      amount:{value:label==='N-A'?'2.34':'1.23',currency_code:'USD'}}];
    if (['N-A','N-C'].includes(label)) body.status='FUTURE_ORDER';
    if (label==='N-B') body.intent='AUTHORIZE';
  }
  return body;
}
function fakeTransport(name:string,label:string,calls:any[],barrier?:any):PayPalTransport {
  let creates=0,gets=0;
  let release: (()=>void)|undefined;
  let timer: ReturnType<typeof setTimeout>|undefined;
  const barrierReady=barrier ? new Promise<void>(resolve => {
    release=resolve;
    timer=setTimeout(() => { barrier.timedOut=true; resolve(); },4000);
  }) : Promise.resolve();
  async function call(method:string,arg:any) {
    const trace=context.getStore(); assert.ok(trace,'Fake call outside scenario');
    const response:any=method==='requestToken'?{kind:'TOKEN_AVAILABLE'}:{kind:'RESPONSE',status:200,
      body:fakeBody(label,method==='captureOrder',name==='F6')};
    if (method==='createOrder') {
      const index=creates++;
      if (name==='F3a' || (name==='F2' && index===0)) Object.assign(response,{kind:'TRANSPORT_UNKNOWN'});
      if (name==='F4b' && trace.lane===1) response.body.id+='OTHER';
      if (barrier) {
        barrier.arrivals++;
        if (barrier.arrivals===2) { barrier.released=true; clearTimeout(timer); release!(); }
        await barrierReady;
        if (barrier.timedOut) { delete response.body; delete response.status; response.kind='TRANSPORT_UNKNOWN'; }
      }
    }
    if (method==='getOrder') {
      response.body.status='APPROVED';
      const index=gets++;
      if ((name==='F5prime' || name.startsWith('N-')) && index>0) response.kind='TRANSPORT_UNKNOWN';
    }
    if (method==='captureOrder' && name==='F5prime') response.kind='TRANSPORT_UNKNOWN';
    if (response.kind==='TRANSPORT_UNKNOWN') { delete response.status; delete response.body; }
    calls.push({scope:trace.scope,method,requestKey:method==='createOrder'||method==='captureOrder'?arg.requestKey:null,
      providerOrderId:arg.providerOrderId??providerId(label),response:structuredClone(response)});
    return method==='requestToken'?{accessToken:'public-fixture-only-access-token'}:response;
  }
  return {requestToken:arg=>call('requestToken',arg), createOrder:arg=>call('createOrder',arg),
    getOrder:arg=>call('getOrder',arg),captureOrder:arg=>call('captureOrder',arg)};
}
let repository: ReturnType<typeof createWebPaymentChargeRepository>;
let bindings: ReturnType<typeof createRpcChargeBindingSource>;
let entry: ReturnType<typeof createRpcProviderEntryGate>;
function dependencies(name:string,label:string,calls:any[],barrier?:any):PayPalChargeDeps {
  return {repository,bindings,entry,transport:fakeTransport(name,label,calls,barrier),nowMs:Date.now,log:()=>{},
    credentials:{async resolve(value) {
      if (value.provider!=='PAYPAL'||value.environment!=='SANDBOX'||value.credentialRef!=='fixture.binding.paypal.v1'
        ||value.bindingVersion!=='1') return null;
      return {clientId:'binding-client-v1',clientSecret:'public-fixture-only-secret'};
    }}};
}
async function get(label:string) {
  const value=await repository.getChargeContext(cases.get(label).actor,cases.get(label).order);
  assert.equal(value.kind,'FOUND');
  if (value.kind!=='FOUND') throw new Error('Missing owned context');
  return value.context;
}
function latest(label:string,name:string) {
  const row=taps.filter(t=>t.orderLabel===label&&t.rpc===name).at(-1);
  assert.ok(row,'Missing actual RPC tuple'); return row.response;
}
function gateInput(label:string) {
  const prepared=latest(label,rpc.prepare),binding=latest(label,rpc.binding);
  return {...input(label),contextId:prepared.context_id,createRequestKey:prepared.create_request_key,bindingHash:binding.binding_hash};
}
function remember(label:string,outcome:any) {
  if (outcome.kind==='PROVIDER_ORDER_READY') winners.set(label,outcome.providerOrderId);
  return outcome;
}
const captureInput=(label:string)=>({...input(label),approvedProviderOrderId:winners.get(label)??providerId(label)});
async function scenario(name:string,label:string,action:(d:PayPalChargeDeps,row:any)=>Promise<void>,barrier=false) {
  const row:any={label:name,orderLabel:label,outcomes:[],fakeCalls:[],setupEvidence:null};
  if (barrier) row.barrier={arrivals:0,released:false,timedOut:false};
  scenarios.push(row);
  await action(dependencies(name,label,row.fakeCalls,row.barrier),row);
  if (firstProxyError) throw firstProxyError;
}
async function phaseA() {
  await scenario('F1','F1',async(d,r)=>runIn('F1','F1','measured',0,async()=>{
    r.outcomes.push(remember('F1',await ensurePayPalProviderOrder(d,input('F1'))));
    r.outcomes.push(await capturePayPalOrder(d,captureInput('F1')));
  }));
  for (const [name,label,count] of [['F2','F2',2],['F3a','F3',1]] as const) {
    await scenario(name,label,async(d,r)=>runIn(name,label,'measured',0,async()=>{
      for(let index=0;index<count;index++) r.outcomes.push(remember(label,await ensurePayPalProviderOrder(d,input(label))));
    }));
  }
  for (const label of ['F4a','F4b']) {
    await scenario(label,label,async(d,r)=>{
      await runIn(label,label,'setup',0,async()=>{
        const prepared=await repository.prepareProviderContext(cases.get(label).actor,cases.get(label).order);
        assert.equal(prepared.kind,'PREPARED');
        if(prepared.kind!=='PREPARED') throw new Error('F4 setup prepare failed');
        assert.equal(prepared.replayed,false);
        const getter=await get(label);
        r.setupEvidence={prepared:{kind:prepared.kind,replayed:prepared.replayed,contextId:prepared.contextId,createRequestKey:prepared.createRequestKey},
          getter:{contextId:getter.contextId,verificationBindingPresent:getter.verificationBindingPresent,
            providerOrderId:getter.providerOrderId,reviewRequired:getter.reviewRequired,attemptId:getter.attemptId,
            submissionIntentRecorded:getter.submissionIntentRecorded}};
        assert.deepEqual(r.setupEvidence.getter,{contextId:prepared.contextId,verificationBindingPresent:true,providerOrderId:null,
          reviewRequired:false,attemptId:null,submissionIntentRecorded:false});
      });
      r.outcomes=await Promise.all([0,1].map(lane=>runIn(label,label,'measured',lane,async()=>
        remember(label,await ensurePayPalProviderOrder(d,input(label))))));
      assert.deepEqual(r.barrier,{arrivals:2,released:true,timedOut:false});
    },true);
  }
  await scenario('F4b-refusal','F4b',async(d,r)=>runIn('F4b-refusal','F4b','measured',0,async()=>{
    r.outcomes.push(await capturePayPalOrder(d,captureInput('F4b')));
    r.outcomes.push(await entry.authorizeProviderEntry(gateInput('F4b')));
  }));
  for (const label of ['F5','F5prime']) {
    await scenario(label,label,async(d,r)=>runIn(label,label,'measured',0,async()=>{
      r.outcomes.push(remember(label,await ensurePayPalProviderOrder(d,input(label))));
      r.outcomes.push(await capturePayPalOrder(d,captureInput(label)));
      r.outcomes.push(await capturePayPalOrder(d,captureInput(label)));
      if (label==='F5') {
        const getter=await get(label);
        const claim=await repository.claimCharge(cases.get(label).actor,cases.get(label).order,getter.rowVersion);
        r.outcomes.push({kind:claim.kind});
      }
    }));
  }
  await scenario('F6','F6',async(d,r)=>{
    await runIn('F6','F6','setup',0,async()=>{
      const outcome=await ensurePayPalProviderOrder(d,input('F6'));
      assert.deepEqual(outcome,{kind:'REVIEW_REQUIRED'});
      const getter=await get('F6');
      const reasonObserved=latest('F6',rpc.record).reason_code;
      r.setupEvidence={outcome,createCount:r.fakeCalls.filter((c:any)=>c.method==='createOrder').length,reasonObserved,
        getter:{reviewRequired:getter.reviewRequired,providerOrderId:getter.providerOrderId,attemptId:getter.attemptId,paymentState:getter.paymentState}};
      assert.equal(reasonObserved,'PROVIDER_SCOPE_MISMATCH');
      assert.deepEqual(r.setupEvidence.getter,{reviewRequired:true,providerOrderId:null,attemptId:null,paymentState:'NOT_SUBMITTED'});
    });
    await runIn('F6','F6','measured',0,async()=>{
      r.outcomes.push(await ensurePayPalProviderOrder(d,input('F6')));
      await bindings.getProviderBinding(cases.get('F6').actor,cases.get('F6').order);
      r.outcomes.push(await entry.authorizeProviderEntry(gateInput('F6')));
      const claim=await repository.claimCharge(cases.get('F6').actor,cases.get('F6').order,latest('F6',rpc.getter).row_version);
      assert.equal(claim.kind,'BLOCKED'); r.outcomes.push(claim);
    });
  });
  await scenario('F7a','F7',async(_d,r)=>runIn('F7a','F7','measured',0,async()=>{
    const prepared=await repository.prepareProviderContext(cases.get('F7').actor,cases.get('F7').order);
    assert.equal(prepared.kind,'PREPARED'); r.outcomes.push({kind:prepared.kind,replayed:(prepared as any).replayed});
  }));
  await scenario('L1a','F1',async(_d,r)=>runIn('L1a','F1','measured',0,async()=>{
    await bindings.getProviderBinding(cases.get('F1').actor,cases.get('F1').order);
    const tuple=gateInput('F1'),other=latest('F2',rpc.prepare);
    for (const args of [{...tuple,contextId:other.context_id},{...tuple,createRequestKey:other.create_request_key},
      {...tuple,bindingHash:(tuple.bindingHash[0]==='a'?'b':'a')+tuple.bindingHash.slice(1)},tuple]) {
      r.outcomes.push(await entry.authorizeProviderEntry(args));
    }
  }));
  await scenario('L1-CLAIM','L1-CLAIM',async(d,r)=>{
    await runIn('L1-CLAIM','L1-CLAIM','setup',0,async()=>{
      const ready=remember('L1-CLAIM',await ensurePayPalProviderOrder(d,input('L1-CLAIM')));
      assert.equal(ready.kind,'PROVIDER_ORDER_READY');
      const initial=await get('L1-CLAIM');
      const claim=await repository.claimCharge(cases.get('L1-CLAIM').actor,cases.get('L1-CLAIM').order,initial.rowVersion);
      assert.equal(claim.kind,'SUBMIT');
      const getter=await get('L1-CLAIM');
      await bindings.getProviderBinding(cases.get('L1-CLAIM').actor,cases.get('L1-CLAIM').order);
      r.setupEvidence={claim:{kind:claim.kind},providerOrderId:getter.providerOrderId,attemptId:getter.attemptId,
        submissionIntentRecorded:getter.submissionIntentRecorded,paymentState:getter.paymentState,rowVersion:getter.rowVersion,reviewRequired:getter.reviewRequired};
      assert.equal(getter.submissionIntentRecorded,false); assert.equal(getter.paymentState,'NOT_SUBMITTED');
      assert.equal(BigInt(getter.rowVersion)-BigInt(initial.rowVersion),1n);
    });
    await runIn('L1-CLAIM','L1-CLAIM','measured',0,async()=>{
      r.outcomes.push(await entry.authorizeProviderEntry(gateInput('L1-CLAIM')));
    });
  });
  await scenario('L1b','F5',async(_d,r)=>runIn('L1b','F5','measured',0,async()=>{
    await bindings.getProviderBinding(cases.get('F5').actor,cases.get('F5').order);
    r.outcomes.push(await entry.authorizeProviderEntry(gateInput('F5')));
  }));
  for(const label of ['N-A','N-B','N-C']) await scenario(label,label,async(d,r)=>runIn(label,label,'measured',0,async()=>{
    r.outcomes.push(remember(label,await ensurePayPalProviderOrder(d,input(label))));
    r.outcomes.push(await capturePayPalOrder(d,captureInput(label)));
    r.outcomes.push(await capturePayPalOrder(d,captureInput(label)));
  }));
  for(const label of ['N-A','N-B','N-C']) openFindings.push({label,status:'OBSERVED_OPEN',facts:observedFacts(label)});
}
function observedFacts(label:string) {
  const rows=taps.filter(t=>t.orderLabel===label),getter=rows.filter(t=>t.rpc===rpc.getter).at(-1)!.response;
  const bound=rows.filter(t=>t.rpc===rpc.bind||t.rpc===rpc.record);
  const unique=[...new Map(bound.filter(t=>t.response.observation_id).map(t=>[t.response.observation_id,t])).values()];
  const links=unique.filter(t=>t.rpc===rpc.bind&&t.response.outcome==='RECORDED').map(t=>({identityKind:t.args.p_evidence.identity_kind,externalId:t.args.p_evidence.external_id}));
  const observations=unique.map(t=>({source:t.args.p_evidence.source,identityKind:t.args.p_evidence.identity_kind,
    outcome:t.response.outcome,reasonCode:t.response.reason_code??null}));
  return {orderId:cases.get(label).order,contextCount:getter.context_id?1:0,links,observations,
    attemptCount:getter.attempt_id?1:0,submissionIntentRecorded:getter.submission_intent_recorded,
    paymentState:getter.payment_state,settlementState:getter.settlement_state,rowVersion:getter.row_version,
    intakeCount:rows.filter(t=>t.rpc===rpc.receive&&t.response.outcome==='INTAKE_PENDING').length,inboxCount:0,receiptCount:0};
}
async function acl() {
  const label='ORD-ACL',dummy=crypto.randomUUID(),actor=actorArgs(label);
  const args:any={getter:actor,prepare:actor,binding:actor,
    entry:{...actor,p_context_id:dummy,p_create_request_key:crypto.randomUUID(),p_binding_hash:'a'.repeat(64)},
    bind:{p_context_id:dummy,p_evidence:{}},record:{p_context_id:dummy,p_evidence:{}},
    claim:{...actor,p_expected_version:native.bridgeNative[label].context.row_version,p_action:'CAPTURE'},
    intent:{...actor,p_expected_version:native.bridgeNative[label].context.row_version,p_action:'CAPTURE',p_attempt_id:dummy,
      p_lease_token:crypto.randomUUID(),p_fencing_version:'1'},receive:{p_order_id:actor.p_order_id,p_observation_id:dummy}};
  for(const role of ['anon','authenticated']) for(const [op,name] of Object.entries(rpc)) {
    const value=await wire(new URL(`http://${config.restIp}:3000/rpc/${name}`),'POST',role,JSON.stringify(args[op]));
    const projected=structuredClone(args[op]); if ('p_lease_token' in projected) projected.p_lease_token='<redacted>';
    direct.push({label,role,rpc:name,args:projected,method:'POST',...value,retryHeader:null});
    assert.equal(value.parseError,null,'Invalid direct JSON or response bound');
    assert.ok(value.status<200||value.status>=300); assert.equal(value.response.code,'42501');
  }
  const entryBody={contract_version:'web-payment-provider-entry.v1',outcome:'BLOCKED',
    charge_authority:false,safe_reason_code:'CONTEXT_REQUIRED'};
  let entryGetResponse:any;
  for(const op of ['getter','binding','entry'] as const) {
    const url=new URL(`http://${config.restIp}:3000/rpc/${rpc[op]}`);
    for(const [key,value] of Object.entries(args[op])) url.searchParams.set(key,String(value));
    const value=await wire(url,'GET','service');
    direct.push({label,role:'service',rpc:rpc[op],method:'GET',...value,query:args[op],retryHeader:null});
    assert.equal(value.parseError,null,'Invalid direct JSON or response bound');
    if(op==='entry') {
      assert.equal(value.status,200); assert.deepEqual(value.response,entryBody); entryGetResponse=value.response;
    }
    else { assert.equal(value.status,200); assert.deepEqual(value.response,native.bridgeNative[label][op==='getter'?'context':'binding']); }
  }
  const posted=await wire(new URL(`http://${config.restIp}:3000/rpc/${rpc.entry}`),'POST','service',JSON.stringify(args.entry));
  direct.push({label,role:'service',rpc:rpc.entry,method:'POST',...posted,args:args.entry,retryHeader:null});
  assert.equal(posted.parseError,null,'Invalid direct JSON or response bound');
  assert.equal(posted.status,200); assert.deepEqual(posted.response,entryBody); assert.deepEqual(posted.response,entryGetResponse);
  for(const role of ['anon','authenticated']) {
    const url=new URL(`http://${config.restIp}:3000/rpc/${rpc.entry}`);
    for(const [key,value] of Object.entries(args.entry)) url.searchParams.set(key,String(value));
    const value=await wire(url,'GET',role);
    direct.push({label,role,rpc:rpc.entry,method:'GET',...value,query:args.entry,retryHeader:null});
    assert.equal(value.parseError,null,'Invalid direct JSON or response bound');
    assert.ok(value.status<200||value.status>=300); assert.equal(value.response.code,'42501');
  }
}
async function main() {
  const proxy=await startProxy();
  await probes(proxy);
  const client=createClient(proxy,token('service'),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:measuredFetch}});
  repository=createWebPaymentChargeRepository(client); bindings=createRpcChargeBindingSource(client); entry=createRpcProviderEntryGate(client);
  if(phase==='A') { await phaseA(); await acl(); }
  else {
    const name=phase==='B'?'F7b':'F3b',label=phase==='B'?'F7':'F3';
    await scenario(name,label,async(d,r)=>runIn(name,label,'measured',0,async()=>{
      r.outcomes.push(await ensurePayPalProviderOrder(d,input(label)));
    }));
    if(phase==='C') {
      const row={label:'C-READS',orderLabel:null,outcomes:[],fakeCalls:[],setupEvidence:null}; scenarios.push(row);
      let step=taps.length;
      for(const readLabel of labels) await context.run({label:'C-READS',orderLabel:readLabel,scope:'measured',lane:0,step},async()=>{
        const getter=await get(readLabel);
        const binding=await bindings.getProviderBinding(cases.get(readLabel).actor,cases.get(readLabel).order);
        assert.equal(getter.orderId,cases.get(readLabel).order);
        assert.deepEqual(latest(readLabel,rpc.getter),native.bridgeNative[readLabel].context);
        assert.deepEqual(latest(readLabel,rpc.binding),native.bridgeNative[readLabel].binding);
        if(readLabel==='ORD-ACL') assert.deepEqual(binding,{kind:'CONTEXT_REQUIRED'});
        else assert.equal((binding as any).bindingVersion,'1');
        step+=2;
      });
    }
  }
  assert.equal(pending.size,0,'Unfinished SDK requests'); if(firstProxyError) throw firstProxyError;
  const counts={scenarios:scenarios.length,setupProxy:taps.filter(t=>t.scope==='setup').length,
    measuredProxy:taps.filter(t=>t.scope==='measured').length,direct:direct.length,postgrest:taps.length+direct.length};
  const expected:any={A:{scenarios:16,setupProxy:19,measuredProxy:130,direct:24,postgrest:173},
    B:{scenarios:1,setupProxy:0,measuredProxy:4,direct:0,postgrest:4},C:{scenarios:2,setupProxy:0,measuredProxy:32,direct:0,postgrest:32}};
  assert.deepEqual(counts,expected[phase],'Actual request counts differ');
  assert.deepEqual(guard.report().blocked,['http','http-address','rpc-path','http-address','rpc-method','rpc-method','rpc-query','rpc-query','rpc-method']);
  const entryNotAfter=taps.find(t=>t.rpc===rpc.entry&&t.response.outcome==='AUTHORIZED')?.response.entry_not_after??null;
  console.log('PROVIDER_RPC_HTTP_RESULT '+JSON.stringify({...partial(),counts,nativeTimestampEvidence:{timezone:native.timezone,entryNotAfter}}));
  console.log(config.completionMarkers[phase]);
}
const partial=()=>({phase,phaseSet:'d2',source:[],direct,taps,scenarios,openFindings,guard:guard.report(),executionPins});
const watchdog=setTimeout(()=>{
  console.log('PROVIDER_RPC_HTTP_PARTIAL_RESULT '+JSON.stringify(partial()));
  console.error('HTTP fixture watchdog exceeded'); process.exit(1);
},config.nodeDeadlineMs);
watchdog.unref();
void main().catch(error=>{
  console.log('PROVIDER_RPC_HTTP_PARTIAL_RESULT '+JSON.stringify(partial()));
  console.error(error instanceof Error?error.stack:String(error)); process.exitCode=1;
}).finally(async()=>{
  clearTimeout(watchdog);
  if(server) { server.closeAllConnections(); await new Promise<void>(resolve=>server!.close(()=>resolve())); }
});
