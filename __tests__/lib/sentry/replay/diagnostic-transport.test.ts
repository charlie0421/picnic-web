// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Envelope } from '@sentry/core';
import { createDiagnosticTransport } from '@/lib/sentry/replay/diagnostic-transport';
import { diagnosticConfig } from '@/lib/sentry/replay/diagnostic-config';
import { emptyProjectionState, type Gate, type ProjectResult } from '@/scripts/replay-p0/contract';
const id='a'.repeat(32),digest='c'.repeat(64);
const config=diagnosticConfig(`https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/456`,digest,'b'.repeat(40))!;
const input:Envelope=[{},[[{type:'replay_event'},{}],[{type:'replay_recording'},new Uint8Array()]]];
const allowed={allowed:true as const,manifestSha256:digest,disclosure:{retentionDays:90,storedTechnicalFields:[]}};
function bytes(length=512, replayId=id) {const b=new Uint8Array(length);b.set(new TextEncoder().encode(JSON.stringify({event_id:replayId})+'\n'+JSON.stringify({type:'replay_event'})+'\n'+JSON.stringify({replay_id:replayId,event_id:replayId})+'\n'));return b;}
function setup(selectedConfig=config) {
 let gate:Gate={phase:'RECORDING',generation:1}, visible:string|null=id;
 const normal={send:vi.fn(async()=>({statusCode:200})),flush:vi.fn(async()=>true)};
 const close=vi.fn(()=>{gate={phase:'CLOSED',generation:2};});
 const fetcher=vi.fn(async()=>new Response(null,{status:200}));
 const transform=vi.fn(async(_input,state):Promise<ProjectResult>=>({ok:true,value:{bytes:bytes(),segment:state.nextSegment,next:{...state,replayId:id,nextSegment:state.nextSegment+1}}}));
 const eligible=vi.fn(async()=>allowed);const locallyEligible=vi.fn(()=>true),delivery=vi.fn();
 const runtime=createDiagnosticTransport({config:selectedConfig,disclosure:allowed.disclosure,normal,close,fetch:fetcher,transform,gate:()=>gate,visibleId:()=>visible,eligible,locallyEligible,onDelivery:delivery});
 return {runtime,normal,close,fetcher,transform,eligible,locallyEligible,delivery,visible:(value:string|null)=>{visible=value;},stop:()=>{close();runtime.cancel();}};
}
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
it.each([config.endpoint.replace('.ingest.us.', '.ingest.de.'), config.endpoint.replace('.ingest.us.', '.ingest.')])(
 'rejects a directly supplied endpoint outside the disclosed US region: %s', endpoint => {
  expect(() => setup({...config,endpoint})).toThrow('Invalid diagnostic endpoint');
 });
it('sends serially with fixed options only after eligibility, and keeps normal delivery',async()=>{
 const t=setup();for(let n=0;n<3;n++)expect(await t.runtime.transport.send(input)).toEqual({statusCode:200});
 expect(t.eligible).toHaveBeenCalledTimes(3);expect(t.transform.mock.calls.map(c=>c[1].nextSegment)).toEqual([0,1,2]);
 expect(t.fetcher).toHaveBeenCalledWith(config.endpoint,expect.objectContaining({credentials:'omit',redirect:'error',keepalive:false,referrerPolicy:'no-referrer'}));
 expect(t.delivery).toHaveBeenLastCalledWith('accepted');await t.runtime.transport.flush(100);expect(t.normal.flush).toHaveBeenCalled();
});
it('never invokes projection when ID is absent at send entry, even if later displayed',async()=>{
 const t=setup();t.visible(null);const pending=t.runtime.transport.send(input);t.visible(id);await pending;
 expect(t.transform).not.toHaveBeenCalled();expect(t.fetcher).not.toHaveBeenCalled();expect(t.close).toHaveBeenCalledWith('sequence');
});
it('rejects a different actual projected ID',async()=>{const t=setup();t.transform.mockResolvedValue({ok:true,value:{bytes:bytes(512,'b'.repeat(32)),next:{...emptyProjectionState(),replayId:id,nextSegment:1},segment:0}});await t.runtime.transport.send(input);expect(t.fetcher).not.toHaveBeenCalled();expect(t.close).toHaveBeenCalledWith('sequence');});
it('allows exactly 8 MiB cumulative attempted bytes and rejects the next byte',async()=>{
 const t=setup();t.transform.mockImplementation(async(_i,s)=>({ok:true,value:{bytes:bytes(4*1024*1024),next:{...s,replayId:id,nextSegment:s.nextSegment+1},segment:s.nextSegment}}));
 await t.runtime.transport.send(input);await t.runtime.transport.send(input);expect(t.fetcher).toHaveBeenCalledTimes(2);
 await t.runtime.transport.send(input);expect(t.fetcher).toHaveBeenCalledTimes(2);expect(t.close).toHaveBeenCalledWith('budget');
});
it.each(['transform','eligibility'])('stop while awaiting %s prevents POST and ignores late work',async phase=>{
 const t=setup();let resolve!:(v:any)=>void;const deferred=()=>new Promise<any>(r=>{resolve=r;});
 if(phase==='transform')t.transform.mockImplementation(deferred);else t.eligible.mockImplementation(deferred);
 const pending=t.runtime.transport.send(input);await vi.advanceTimersByTimeAsync(0);t.stop();expect(await pending).toEqual({statusCode:403});resolve(allowed);expect(t.fetcher).not.toHaveBeenCalled();expect(t.delivery).not.toHaveBeenCalled();
});
it('closes overlap and does not retry the first job',async()=>{const t=setup();t.transform.mockImplementation(()=>new Promise(()=>{}));const first=t.runtime.transport.send(input);await t.runtime.transport.send(input);expect(await first).toEqual({statusCode:403});expect(t.close).toHaveBeenCalledWith('overlap');expect(t.fetcher).not.toHaveBeenCalled();});
it.each([['transform',2000,'worker-timeout'],['eligibility',1000,'ineligible'],['fetch',5000,'fetch-timeout']] as const)('times out %s independently',async(phase,ms,reason)=>{
 const t=setup();(phase==='transform'?t.transform:phase==='eligibility'?t.eligible:t.fetcher).mockImplementation(()=>new Promise(()=>{}));
 const pending=t.runtime.transport.send(input);await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(ms);
 expect(await pending).toEqual({statusCode:403});expect(t.close).toHaveBeenCalledWith(reason);
 if(phase==='fetch')expect(t.delivery).toHaveBeenLastCalledWith('unknown');else expect(t.delivery).not.toHaveBeenCalled();
});
it.each([302,429,500])('treats HTTP %i as unknown, never refunds or retries',async status=>{const t=setup();t.fetcher.mockResolvedValue(new Response(null,{status}));await t.runtime.transport.send(input);await t.runtime.transport.send(input);expect(t.fetcher).toHaveBeenCalledTimes(1);expect(t.delivery).toHaveBeenLastCalledWith('unknown');});
it('aborts a posted envelope on stop and leaves receipt unknown',async()=>{const t=setup();t.fetcher.mockImplementation(()=>new Promise(()=>{}));const pending=t.runtime.transport.send(input);await vi.advanceTimersByTimeAsync(0);t.stop();await pending;expect(t.fetcher.mock.calls[0][1].signal.aborted).toBe(true);expect(t.delivery).toHaveBeenLastCalledWith('unknown');});
it('rechecks local eligibility synchronously after the server result',async()=>{const t=setup();t.eligible.mockImplementation(async()=>{t.locallyEligible.mockReturnValue(false);return allowed;});await t.runtime.transport.send(input);expect(t.fetcher).not.toHaveBeenCalled();});
it('still calls normal.flush when its own waiting consumes the deadline',async()=>{const t=setup();t.transform.mockImplementation(()=>new Promise(()=>{}));void t.runtime.transport.send(input);const pending=t.runtime.transport.flush(10);await vi.advanceTimersByTimeAsync(10);expect(await pending).toBe(false);expect(t.normal.flush).toHaveBeenCalledWith(0);t.stop();});
it('reads only metadata before a binary recording',async()=>{const t=setup();const b=bytes();b[b.length-1]=255;t.transform.mockResolvedValue({ok:true,value:{bytes:b,next:{...emptyProjectionState(),replayId:id,nextSegment:1},segment:0}});expect(await t.runtime.transport.send(input)).toEqual({statusCode:200});});
it('denies rate-limit responses even when status is 200',async()=>{const t=setup();t.fetcher.mockResolvedValue(new Response(null,{headers:{'retry-after':'1'}}));await t.runtime.transport.send(input);expect(t.delivery).toHaveBeenLastCalledWith('unknown');expect(t.close).toHaveBeenCalledWith('http');});

it.each([
  ['retention changes', {retentionDays:30}],
  ['retired intake key appears', {deletionRequestUrl:'https://www.picnic.fan/changed'}],
  ['stored technical fields change', {storedTechnicalFields:['browser']}],
] as const)('stops before POST when %s', async (_reason, patch) => {
  const t=setup();t.eligible.mockResolvedValue({...allowed,disclosure:{...allowed.disclosure,...patch}} as any);
  await t.runtime.transport.send(input);
  expect(t.fetcher).not.toHaveBeenCalled();expect(t.close).toHaveBeenCalledWith('ineligible');
});
it('does not add a header that requires a CORS preflight',async()=>{
  const t=setup();await t.runtime.transport.send(input);
  expect(new Headers(t.fetcher.mock.calls[0][1].headers).get('content-type')).toBeNull();
});
