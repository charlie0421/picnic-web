// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectDiagnosticEnvelope } from '@/lib/sentry/replay/diagnostic-worker';
import { emptyProjectionState } from '@/scripts/replay-p0/contract';
import { el, txt, page, envelope, ID, outputRecords } from '../../../scripts/replay-p0/vote-list/helpers';
beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_COMMIT','b'.repeat(40));vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_MANIFEST_SHA256','c'.repeat(64));vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_RELEASE','picnic-web@'+'b'.repeat(40));vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_ENVIRONMENT','replay-diagnostic-production');});
afterEach(()=>vi.unstubAllEnvs());
it('projects visible diagnostic ID and controls with all recording text masked and fixed metadata',async()=>{
 const input=envelope(page([], [el('div',{},[el('p',{},[txt('진단 번호: '+ID)]),el('button',{type:'button'},[txt('중지')])])]));
 const result=await projectDiagnosticEnvelope(input,emptyProjectionState(),'https://www.picnic.fan',0);
 expect(result.ok).toBe(true);if(!result.ok)return;
 const text=JSON.stringify(outputRecords(result.value.bytes));expect(text).not.toContain(ID);expect(text).not.toContain('진단 번호');
 const metadata=new TextDecoder().decode(result.value.bytes).split('\n')[2];expect(metadata).toContain('picnic-web@'+'b'.repeat(40));expect(metadata).toContain('replay-diagnostic-production');
});
it('rejects unknown CSS and missing build metadata',async()=>{
 const input=envelope(page([], [el('style',{},[txt('.secret{color:red}')],{isStyle:true})]));
 expect((await projectDiagnosticEnvelope(input,emptyProjectionState(),'https://www.picnic.fan',0)).ok).toBe(false);
 vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_COMMIT','');expect((await projectDiagnosticEnvelope(envelope(page([],[])),emptyProjectionState(),'https://www.picnic.fan',0)).ok).toBe(false);
});
