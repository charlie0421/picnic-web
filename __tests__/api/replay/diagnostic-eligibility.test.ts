// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/replay/eligibility/route';
import { readDiagnosticBuild } from '@/lib/sentry/replay/diagnostic-build';
vi.mock('@/lib/sentry/replay/diagnostic-build', () => ({readDiagnosticBuild:vi.fn()}));
const digest='c'.repeat(64), url='https://www.picnic.fan/api/replay/eligibility?mode=diagnostic';
const disclosure={retentionDays:30,deletionRequestUrl:'https://www.picnic.fan/support',storedTechnicalFields:['browser']};
const req=(suffix='',headers={})=>new NextRequest(url+suffix,{headers});
beforeEach(()=> { vi.stubEnv('REPLAY_DIAGNOSTIC_ENABLED','1'); vi.stubEnv('REPLAY_DIAGNOSTIC_DISCLOSURE_JSON',JSON.stringify(disclosure)); vi.mocked(readDiagnosticBuild).mockResolvedValue({manifestSha256:digest} as any); });
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it.each(['','0','true'])('denies unless switch equals 1: %s',async value=>{vi.stubEnv('REPLAY_DIAGNOSTIC_ENABLED',value);expect((await GET(req())).status).toBe(404);});
it.each(['','{}','not json'])('denies absent or unconfirmed disclosure',async value=>{vi.stubEnv('REPLAY_DIAGNOSTIC_DISCLOSURE_JSON',value);expect((await GET(req())).status).toBe(404);});
it('denies missing final build proof',async()=>{vi.mocked(readDiagnosticBuild).mockResolvedValue(null);expect((await GET(req())).status).toBe(404);});
it.each([{}, {cookie:'locale=ko'}])('allows public preference cookies only',async headers=>{
 const result=await GET(req('',headers));expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toContain('no-store');expect(await result.json()).toEqual({allowed:true,manifestSha256:digest,disclosure});
});
it.each([{cookie:'auth=secret'},{cookie:'locale=ko; locale=ko'},{cookie:'locale=ko; hidden=yes'},{authorization:'Bearer synthetic'}])('denies credentials',async headers=>expect((await GET(req('',headers))).status).toBe(403));
it.each(['&other=1','&mode=diagnostic','&'])('denies other query combinations %s',async suffix=>expect((await GET(req(suffix))).status).toBe(404));

it.each(['https://preview.vercel.app','https://picnic.fan','http://www.picnic.fan'])('denies non-production origin: %s',async origin=>{
 expect((await GET(new NextRequest(origin+'/api/replay/eligibility?mode=diagnostic'))).status).toBe(404);
 expect(readDiagnosticBuild).not.toHaveBeenCalled();
});
