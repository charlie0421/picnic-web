// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { tracedDiagnosticFiles } from '@/scripts/replay-diagnostic/verify-packaging.cjs';
const roots:string[]=[];
afterEach(()=>{for(const root of roots)fs.rmSync(root,{recursive:true,force:true});roots.length=0;});
it('requires both the final proof and the matching BUILD_ID in the real route trace',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'diagnostic-trace-'));roots.push(root);
 const dir=path.join(root,'.next/server/app/api/replay/eligibility');fs.mkdirSync(dir,{recursive:true});
 const trace=path.join(dir,'route.js.nft.json');fs.writeFileSync(trace,JSON.stringify({version:1,files:[]}));expect(()=>tracedDiagnosticFiles(root,'.next')).toThrow();
 fs.writeFileSync(trace,JSON.stringify({version:1,files:['../../../../../BUILD_ID','../../../../../../lib/sentry/replay/generated/diagnostic-proof.json']}));
 expect(tracedDiagnosticFiles(root,'.next').map((f:string)=>path.relative(root,f))).toEqual(['.next/BUILD_ID','lib/sentry/replay/generated/diagnostic-proof.json']);
});
