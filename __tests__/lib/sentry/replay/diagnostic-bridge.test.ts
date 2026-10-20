import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDiagnosticBridge } from '@/lib/sentry/replay/diagnostic-bridge';
import { createDiagnosticSession } from '@/lib/sentry/replay/diagnostic-session';
import { createReplaySignals } from '@/lib/sentry/replay/signals';
import { diagnosticConfig } from '@/lib/sentry/replay/diagnostic-config';
import { replayDocumentReady, observeReplayDocumentReady } from '@/lib/sentry/replay/document-ready';
const id='a'.repeat(32),digest='c'.repeat(64);
const config=diagnosticConfig(`https://${id}@o123.ingest.us.sentry.io/456`,digest,'b'.repeat(40))!;
const allowance={allowed:true as const,manifestSha256:digest,disclosure:{retentionDays:90,storedTechnicalFields:[]}};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(ready=true,safe=true,languageReady=true) {
 const signals=createReplaySignals();if(languageReady)signals.setLanguageReady(true);if(ready){signals.setAuth('anonymous');signals.setAds('denied');signals.setReady('vote');signals.setReady('banner',0);signals.setReady('popup');}
 const session=createDiagnosticSession(),sdk={start:vi.fn(),stop:vi.fn(async()=>{}),flush:vi.fn(async()=>{}),getReplayId:()=>id};
 const loadSdk=vi.fn(async()=>sdk),eligible=vi.fn(async()=>allowance),install=vi.fn(()=>true),interaction=vi.fn(()=>vi.fn()),transform=vi.fn();
 const deps={signals,session,config,normal:{send:vi.fn(),flush:vi.fn(async()=>true)},win:window,loadSdk,eligible,install,interaction,transform,
  pageSafe:vi.fn(()=>safe),ready:()=>replayDocumentReady(document),onReady:(callback:()=>void)=>observeReplayDocumentReady(window,callback),visible:()=>true,now:()=>performance.now(),fetch:vi.fn()};
 const bridge=createDiagnosticBridge(deps);return {bridge,deps,sdk,signals,session};
}
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(document,'readyState','get').mockReturnValue('complete');});afterEach(()=>{document.body.replaceChildren();vi.useRealTimers();vi.restoreAllMocks();});
it('withholds consent UI and SDK loading until streamed placeholders disappear',async()=>{
 document.body.innerHTML='<div hidden id="S:4"><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template></div>';
 const t=setup();await settle();t.bridge.start();expect(t.bridge.snapshot().phase).toBe('unavailable');expect(t.deps.eligible).not.toHaveBeenCalled();expect(t.deps.loadSdk).not.toHaveBeenCalled();
 document.body.replaceChildren();await settle();expect(t.bridge.snapshot().phase).toBe('ready');expect(t.deps.loadSdk).not.toHaveBeenCalled();
 t.bridge.start();await settle();expect(t.sdk.start).toHaveBeenCalledTimes(1);t.bridge.stop();
});
it('does not revive a closed document when hydration later completes',async()=>{
 document.body.innerHTML='<template></template>';const t=setup();await settle();t.bridge.stop();document.body.replaceChildren();await settle();
 expect(t.bridge.snapshot().phase).toBe('closed');expect(t.deps.eligible).not.toHaveBeenCalled();expect(t.deps.loadSdk).not.toHaveBeenCalled();
});
it('closes an unsafe loaded page even while a new placeholder delays readiness',async()=>{
 document.body.innerHTML='<template></template>';const t=setup(true,false);await settle();
 expect(t.bridge.snapshot().phase).toBe('closed');expect(t.deps.loadSdk).not.toHaveBeenCalled();
});
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
it('closes when disclosure changes after consent',async()=>{const t=setup();await settle();t.deps.eligible.mockResolvedValue({...allowance,disclosure:{...allowance.disclosure,retentionDays:30}});t.bridge.start();await settle();expect(t.deps.loadSdk).not.toHaveBeenCalled();expect(t.bridge.snapshot().phase).toBe('closed');});
it('stops at 60 seconds',async()=>{const t=setup();await settle();t.bridge.start();await settle();t.bridge.idDisplayed(id);await vi.advanceTimersByTimeAsync(60000);expect(t.bridge.snapshot().phase).toBe('closed');expect(t.sdk.stop).toHaveBeenCalledTimes(1);});
it('OFF is checked once and does not produce a retry loop',async()=>{const t=setup(false);t.deps.eligible.mockResolvedValue(null);t.signals.setAuth('anonymous');t.signals.setAds('denied');t.signals.setReady('vote');t.signals.setReady('banner',0);t.signals.setReady('popup');await settle();expect(t.bridge.snapshot().phase).toBe('closed');t.signals.setReady('vote');expect(t.deps.eligible).toHaveBeenCalledTimes(1);});

it.each(['auth','ads'] as const)('stops recording when %s changes and blocks a later envelope',async reason=>{
 const t=setup();await settle();t.bridge.start();await settle();t.bridge.idDisplayed(id);
 if(reason==='auth')t.signals.setAuth('authenticated');else t.signals.markAdsLoaded();
 expect(t.bridge.snapshot().phase).toBe('closed');expect(t.sdk.stop).toHaveBeenCalledTimes(1);
 const transport=t.deps.install.mock.calls[0][0];
 await transport.send([{},[[{type:'replay_event'},{}],[{type:'replay_recording'},new Uint8Array()]]]);
 expect(t.deps.transform).not.toHaveBeenCalled();expect(t.deps.fetch).not.toHaveBeenCalled();
});

it('waits for delayed device detection and translation before offering consent',async()=>{
 const t=setup(true,true,false);await settle();t.bridge.start();
 expect(t.bridge.snapshot().phase).toBe('unavailable');expect(t.deps.eligible).not.toHaveBeenCalled();expect(t.deps.loadSdk).not.toHaveBeenCalled();
 t.signals.setLanguageReady(true);await settle();expect(t.bridge.snapshot().phase).toBe('ready');expect(t.deps.loadSdk).not.toHaveBeenCalled();t.bridge.stop();
});
it('closes on a later language loading phase and cannot restart when it settles',async()=>{
 const t=setup();await settle();t.bridge.start();await settle();t.bridge.idDisplayed(id);
 t.signals.setLanguageReady(false);expect(t.bridge.snapshot().phase).toBe('closed');expect(t.sdk.stop).toHaveBeenCalledTimes(1);
 t.signals.setLanguageReady(true);await settle();t.bridge.start();expect(t.bridge.snapshot().phase).toBe('closed');expect(t.deps.loadSdk).toHaveBeenCalledTimes(1);
});
