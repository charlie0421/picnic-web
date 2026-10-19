import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDiagnosticBridge } from '@/lib/sentry/replay/diagnostic-bridge';
import { createDiagnosticSession } from '@/lib/sentry/replay/diagnostic-session';
import { createReplaySignals } from '@/lib/sentry/replay/signals';
import { diagnosticConfig } from '@/lib/sentry/replay/diagnostic-config';
const id='a'.repeat(32),digest='c'.repeat(64);
const config=diagnosticConfig(`https://${id}@o123.ingest.us.sentry.io/456`,digest,'b'.repeat(40))!;
const allowance={allowed:true as const,manifestSha256:digest,disclosure:{retentionDays:30,deletionRequestUrl:'https://www.picnic.fan/support',storedTechnicalFields:[]}};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(ready=true) {
 const signals=createReplaySignals();if(ready){signals.setAuth('anonymous');signals.setAds('denied');signals.setReady('vote');signals.setReady('banner',0);signals.setReady('popup');}
 const session=createDiagnosticSession(),sdk={start:vi.fn(),stop:vi.fn(async()=>{}),flush:vi.fn(async()=>{}),getReplayId:()=>id};
 const loadSdk=vi.fn(async()=>sdk),eligible=vi.fn(async()=>allowance),install=vi.fn(()=>true),interaction=vi.fn(()=>vi.fn()),transform=vi.fn();
 const deps={signals,session,config,normal:{send:vi.fn(),flush:vi.fn(async()=>true)},win:window,loadSdk,eligible,install,interaction,transform,
  pageSafe:vi.fn(()=>true),ready:()=>true,visible:()=>true,now:()=>performance.now(),fetch:vi.fn()};
 const bridge=createDiagnosticBridge(deps);return {bridge,deps,sdk,signals,session};
}
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
it('checks ready documents once and never loads a recorder before explicit consent',async()=>{const t=setup();await settle();expect(t.bridge.snapshot().phase).toBe('ready');expect(t.deps.eligible).toHaveBeenCalledTimes(1);expect(t.deps.loadSdk).not.toHaveBeenCalled();t.signals.setReady('vote');await settle();expect(t.deps.eligible).toHaveBeenCalledTimes(1);t.bridge.stop();});
it('waits for all coarse facts and never shows UI for unknown auth',async()=>{const t=setup(false);await settle();expect(t.bridge.snapshot().phase).toBe('unavailable');expect(t.deps.eligible).not.toHaveBeenCalled();t.bridge.stop();});
it('installs interaction guards before any await, registers a closed transport before SDK start and publishes the real ID',async()=>{
 const t=setup();await settle();t.sdk.start.mockImplementation(()=>expect(t.deps.install).toHaveBeenCalledTimes(1));
 t.bridge.start();expect(t.deps.interaction).toHaveBeenCalledTimes(1);expect(t.session.snapshot().attempted).toBe(true);expect(t.bridge.snapshot().phase).toBe('loading');
 await settle();expect(t.deps.loadSdk).toHaveBeenCalledTimes(1);expect(t.bridge.snapshot()).toMatchObject({phase:'recording',id});expect(t.session.snapshot().visibleId).toBeNull();
 t.bridge.idDisplayed(id);expect(t.session.snapshot().visibleId).toBe(id);t.bridge.start();expect(t.deps.loadSdk).toHaveBeenCalledTimes(1);t.bridge.stop();expect(t.sdk.stop).toHaveBeenCalledTimes(1);
});
it('closes an SDK envelope arriving before the UI confirms the ID',async()=>{const t=setup();await settle();t.sdk.start.mockImplementation(()=>{const transport=t.deps.install.mock.calls[0][0];void transport.send([{},[[{type:'replay_event'},{}],[{type:'replay_recording'},new Uint8Array()]]]);});t.bridge.start();await settle();expect(t.bridge.snapshot().phase).toBe('closed');expect(t.deps.transform).not.toHaveBeenCalled();expect(t.deps.fetch).not.toHaveBeenCalled();expect(t.sdk.stop).toHaveBeenCalledTimes(1);});
it('stop during SDK loading prevents a late start and cannot be reversed',async()=>{const t=setup();await settle();let resolve!:(v:any)=>void;t.deps.loadSdk.mockImplementation(()=>new Promise(r=>{resolve=r;}));t.bridge.start();await settle();t.bridge.stop();resolve(t.sdk);await settle();expect(t.sdk.start).not.toHaveBeenCalled();expect(t.bridge.snapshot().phase).toBe('closed');t.bridge.start();expect(t.deps.loadSdk).toHaveBeenCalledTimes(1);});
it('closes when disclosure changes after consent',async()=>{const t=setup();await settle();t.deps.eligible.mockResolvedValue({...allowance,disclosure:{...allowance.disclosure,retentionDays:90}});t.bridge.start();await settle();expect(t.deps.loadSdk).not.toHaveBeenCalled();expect(t.bridge.snapshot().phase).toBe('closed');});
it('stops at 60 seconds and on auth/ad closure',async()=>{const t=setup();await settle();t.bridge.start();await settle();t.bridge.idDisplayed(id);await vi.advanceTimersByTimeAsync(60000);expect(t.bridge.snapshot().phase).toBe('closed');expect(t.sdk.stop).toHaveBeenCalledTimes(1);});
it('OFF is checked once and does not produce a retry loop',async()=>{const t=setup(false);t.deps.eligible.mockResolvedValue(null);t.signals.setAuth('anonymous');t.signals.setAds('denied');t.signals.setReady('vote');t.signals.setReady('banner',0);t.signals.setReady('popup');await settle();expect(t.bridge.snapshot().phase).toBe('closed');t.signals.setReady('vote');expect(t.deps.eligible).toHaveBeenCalledTimes(1);});
