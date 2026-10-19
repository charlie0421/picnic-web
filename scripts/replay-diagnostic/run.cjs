'use strict';
// Starts and stops only its own synthetic server. Product environment files and occupied ports are rejected by the server.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {harnessEnv}=require('../replay-p0/tools/vote-list-server.cjs');
const {verifyPackagedBuild}=require('./verify-packaging.cjs');
async function main(){
 const args=process.argv.slice(2),local=args.includes('--local'),at=args.indexOf('--out');
 const out=at>=0?path.resolve(args[at+1]):fs.mkdtempSync(path.join(os.tmpdir(),'picnic-replay-integration-'));fs.mkdirSync(out,{recursive:true,mode:0o700});
 const server=spawn(process.execPath,['scripts/replay-p0/tools/vote-list-server.cjs','--out',out,local?'--integration':'--diagnostic'],{stdio:'inherit'});
 let exited=false;server.once('exit',()=>{exited=true;});const stopped=new Promise(resolve=>server.once('exit',resolve));
 const stop=()=>server.kill('SIGTERM');process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{
  const deadline=Date.now()+300000;
  while(Date.now()<deadline){
   if(exited)throw new Error('Synthetic server failed; inspect '+out+'/build.log');
   try{if(JSON.parse(fs.readFileSync(path.join(out,'server.json'))).phase==='serving')break;}catch{}
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(Date.now()>=deadline)throw new Error('Synthetic build deadline');
  if(!local)console.log(JSON.stringify(await verifyPackagedBuild({env:harnessEnv({out,fontMock:false,build:false,diagnostic:true})})));
  const test=spawn(process.execPath,[local?'scripts/replay-p0/tools/vote-list-integration.cjs':'scripts/replay-diagnostic/integration.cjs','--out',path.join(out,'results')],{stdio:'inherit'});
  const code=await new Promise(resolve=>test.once('exit',resolve));if(code!==0)throw new Error('Synthetic browser tests failed');
 }finally{stop();await stopped;process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
 console.log('Synthetic evidence: '+out);
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
