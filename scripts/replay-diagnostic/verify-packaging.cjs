'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { build } = require('esbuild');
const { getDiagnosticBuildMetadata } = require('./build-metadata.cjs');
function tracedDiagnosticFiles(root, buildDir) {
  const trace = path.join(root,buildDir,'server/app/api/replay/eligibility/route.js.nft.json');
  const files = JSON.parse(fs.readFileSync(trace,'utf8')).files.map(file=>path.resolve(path.dirname(trace),file));
  for(const required of [path.join(root,buildDir,'BUILD_ID'),path.join(root,'lib/sentry/replay/generated/diagnostic-proof.json')])assert(files.includes(required),'missing runtime trace: '+path.relative(root,required));
  for(const file of files)assert(!path.relative(root,file).startsWith('..'+path.sep),'trace leaves repository');
  return files;
}
async function verifyPackagedBuild({root=process.cwd(),buildDir='.next-envtest',env=process.env}={}) {
  const files=tracedDiagnosticFiles(root,buildDir),fixture=fs.mkdtempSync(path.join(os.tmpdir(),'replay-packaged-'));
  fs.chmodSync(fixture,0o700);
  try {
    for(const source of files){const target=path.join(fixture,path.relative(root,source));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
    const metadata=getDiagnosticBuildMetadata({root,env});
    const define={};
    for(const [key,value] of Object.entries(metadata))define[`process.env.NEXT_PUBLIC_REPLAY_DIAGNOSTIC_${key==='manifestSha256'?'MANIFEST_SHA256':key.toUpperCase()}`]=JSON.stringify(value);
    for(const key of ['NEXT_PUBLIC_REPLAY_DIAGNOSTIC_TEST','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SENTRY_DSN','ENVELOPE_TEST'])define[`process.env.${key}`]=JSON.stringify(env[key]||'');
    const file=path.join(fixture,'reader.cjs');
    await build({entryPoints:[path.join(root,'lib/sentry/replay/diagnostic-build.ts')],bundle:true,platform:'node',format:'cjs',outfile:file,define,
      plugins:[{name:'server-only-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'marker'}));b.onLoad({filter:/.*/,namespace:'marker'},()=>({contents:''}));}}]});
    const {readDiagnosticBuild}=require(file);
    const proof=await readDiagnosticBuild({root:fixture});assert(proof?.verified,'packaged runtime cannot read current proof');
    fs.writeFileSync(path.join(fixture,buildDir,'BUILD_ID'),'stale-build');assert.equal(await readDiagnosticBuild({root:fixture}),null);
    fs.writeFileSync(path.join(fixture,buildDir,'BUILD_ID'),proof.buildId);fs.unlinkSync(path.join(fixture,'lib/sentry/replay/generated/diagnostic-proof.json'));assert.equal(await readDiagnosticBuild({root:fixture}),null);
    return {files:files.length,verified:true,missingProofDenied:true,staleBuildDenied:true};
  } finally {fs.rmSync(fixture,{recursive:true,force:true});}
}
module.exports={tracedDiagnosticFiles,verifyPackagedBuild};
