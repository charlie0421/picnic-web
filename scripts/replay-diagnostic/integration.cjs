'use strict';
// The running server must be the isolated --diagnostic harness. No request to Sentry leaves this browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { serializeEnvelope } = require('@sentry/core');
const { parseBrowserEnvelope } = require('../envelope-test/browser-analyze');
const { build } = require('esbuild');
const { verifyRestore, installPendingStream } = require('../replay-p0/tools/vote-list-integration.cjs');
const ORIGIN = 'http://127.0.0.1:53931';
const ENDPOINT = 'https://o1.ingest.us.sentry.io/api/1/envelope/';
const opt = name => process.argv[process.argv.indexOf(name) + 1];
const waitUntil = async (page, test, label, ms = 12000) => {
  const deadline = Date.now() + ms;
  while (!test() && Date.now() < deadline) await page.waitForTimeout(100);
  assert(test(), label);
};
async function main() {
  if (!process.argv.includes('--out')) throw new Error('missing --out');
  const out = path.resolve(opt('--out')); fs.mkdirSync(out, { recursive: true });
  const capture = process.argv.includes('--capture');
  const chrome = process.argv.includes('--chrome');
  const manifestPath = path.resolve('lib/sentry/replay/generated/diagnostic-manifest.json');
  const digest = createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  const disclosure = { retentionDays: 30, deletionRequestUrl: 'https://www.picnic.fan/support', storedTechnicalFields: ['browser','os','device'] };
  const viewer = (await build({ entryPoints: [path.resolve('scripts/replay-p0/vote-list-restore-entry.ts')], bundle: true, platform: 'browser', format: 'iife', write: false })).outputFiles[0].text;
  const browser = await chromium.launch(chrome ? { channel: 'chrome', headless: false } : { headless: true });
  const results = [];
  const scenarios = capture ? ['capture'] : ['positive','streaming-ready','cancel','no-consent','unknown-auth','cookie','ads','spa','popup','more','tab','unknown-css','post-timeout','eligibility-timeout','remote-off','off'];
  try {
    for (const name of scenarios.filter(n => !process.argv.includes('--only') || opt('--only').split(',').includes(n))) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(consent => { if (consent) localStorage.setItem('picnic-cookie-consent',consent); }, name === 'ads' ? 'granted' : 'denied');
      if (name === 'streaming-ready') await installPendingStream(context);
      if (name === 'cookie') await context.addCookies([{name:'HttpOnlyCanary',value:'synthetic',url:ORIGIN,httpOnly:true}]);
      if (name === 'unknown-auth') await context.addInitScript(() => {
        let client; Object.defineProperty(window, 'supabase', { configurable: true, get: () => client, set(value) {
          client = value; value.auth.getUser = async () => ({ data: { user: null }, error: { message: 'synthetic auth unavailable' } });
        } });
      });
      const page = await context.newPage(), replays = [], ordinary = [], errors = [], blocked = [], raw = [];
      let eligibility = 0, deny = false, numberVisible = true;
      page.on('pageerror', error => { if (!String(error).includes('diagnostic-synthetic-error')) errors.push(String(error)); });
      if (capture) {
        await page.exposeBinding('__captureDiagnosticInput', (_source, input) => {
          input[1] = input[1].map(([header,payload]) => [header, Array.isArray(payload) ? new Uint8Array(payload) : payload]);
          const serialized = serializeEnvelope(input); const bytes = Buffer.from(serialized);
          raw.push(bytes); fs.writeFileSync(path.join(out, `wire-1280-${raw.length}.bin`), bytes);
        });
        await page.addInitScript(() => {
          const OriginalWorker = window.Worker;
          window.Worker = class extends OriginalWorker {
            postMessage(message, transfer) {
              if (message.input) void window.__captureDiagnosticInput([message.input[0], message.input[1].map(([header,payload]) => [header,payload instanceof Uint8Array ? [...payload] : payload])]);
              super.postMessage(message, transfer);
            }
          };
        });
      }
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname === '/api/replay/eligibility') {
          eligibility++;
          if (name === 'eligibility-timeout' && eligibility >= 3) { await new Promise(resolve => setTimeout(resolve,1500)); return route.fulfill({status:404,body:''}).catch(()=>{}); }
          if (name === 'off' || deny) return route.fulfill({status:404,body:''});
          if (capture) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowed:true,manifestSha256:digest,disclosure})});
        }
        if (name === 'unknown-auth' && /\/auth\/v1\//.test(url.pathname)) return route.fulfill({status:503,body:'{}'});
        if (name === 'popup' && url.pathname === '/api/popups') {
          // A synthetic nonempty popup response must close before a recorder is loaded.
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:1,title:{ko:'Synthetic popup'},content:{ko:'Synthetic popup'},image:{ko:''},platform:'web'}])});
        }
        if (url.origin + url.pathname === ENDPOINT && request.method() === 'POST') {
          const parsed = parseBrowserEnvelope(request.postDataBuffer());
          const event = parsed.items.find(item => item.header.type === 'replay_event');
          if (event) {
            const text = await page.locator('p').filter({hasText:'진단 번호:'}).innerText().catch(()=>'');
            if (!text.includes(event.payload.replay_id)) numberVisible = false;
            replays.push(parsed); fs.writeFileSync(path.join(out,`${name}-${replays.length}.bin`),request.postDataBuffer());
            if (name === 'post-timeout') { await new Promise(resolve=>setTimeout(resolve,6000)); return route.fulfill({status:200,body:'{}'}).catch(()=>{}); }
          } else ordinary.push(parsed);
          return route.fulfill({status:200,contentType:'application/json',body:'{}'});
        }
        if (url.hostname === '127.0.0.1' && ['53931','59862'].includes(url.port)) return route.continue();
        blocked.push(url.origin); return route.abort();
      });
      try {
        await page.goto(ORIGIN + (name === 'spa' ? '/ko/faq' : '/ko/vote'), {waitUntil:'load',timeout:90000});
        const entry = page.getByRole('button',{name:'화면 문제 진단',exact:true});
        if (name === 'streaming-ready') {
          await page.waitForSelector('h3', {timeout:20000});
          assert.equal(await page.locator('[id="S:replay-test"] template').count(),1,'pending stream remains after load');
          assert.equal(await entry.count(),0,'pending stream cannot show consent entry');
          assert.equal(replays.length,0,'pending stream sends no Replay');
          await page.evaluate(()=>document.getElementById('S:replay-test').remove());
        }
        if (name === 'spa') {
          // Header renders this desktop link only after hydration and auth have settled.
          await page.locator('header a[href="/ko/mypage"]').last().waitFor({state:'visible',timeout:15000});
          await page.evaluate(() => { window.__diagnosticDocument = 'same-document'; });
          await page.locator('header a').first().click();
          await page.waitForURL(ORIGIN + '/ko/vote');
          assert.equal(await page.evaluate(() => window.__diagnosticDocument), 'same-document', 'exercise SPA without a new document');
          await page.waitForTimeout(1500);assert.equal(await entry.count(),0);assert.equal(replays.length,0);
        } else if (['cookie','ads','unknown-auth','popup','off'].includes(name)) {
          await page.waitForTimeout(3500);assert.equal(await entry.count(),0,'ineligible entry hidden');assert.equal(replays.length,0);
          if (name === 'off') assert.equal(eligibility,1,'OFF checked only once');
        } else {
          await entry.waitFor({timeout:15000});assert.equal(replays.length,0,'no collection before consent');
          if (name === 'no-consent') { await page.waitForTimeout(2000);assert.equal(replays.length,0); }
          else {
            await entry.click();
            if(chrome && name==='positive')await page.screenshot({path:path.join(out,'consent.png')});
            if (name === 'cancel') {
              await page.getByRole('button',{name:'취소',exact:true}).click();await entry.click();
              assert.equal(replays.length,0);assert.equal(eligibility,1);await page.getByRole('button',{name:'취소',exact:true}).click();
            } else {
              await page.getByRole('button',{name:'동의하고 시작',exact:true}).click();
              if (capture) { await waitUntil(page,()=>raw.length>=1,'raw candidate envelope'); }
              else if (name === 'eligibility-timeout') { await page.getByText('진단이 종료되었습니다.',{exact:true}).waitFor({timeout:10000});assert.equal(replays.length,0); }
              else {
                await waitUntil(page,()=>replays.length>=1,'first projected segment');
                assert(numberVisible,'real ID visible before first POST');
                if(chrome && name==='positive')await page.screenshot({path:path.join(out,'recording.png')});
                if (name === 'post-timeout') { await page.getByText('전송이 중단되어 저장 여부를 확인할 수 없습니다.',{exact:true}).waitFor({timeout:10000}); }
                else if (name === 'positive' || name === 'streaming-ready') {
                  await page.evaluate(()=>setTimeout(()=>{throw new Error('diagnostic-synthetic-error');},0));
                  await waitUntil(page,()=>ordinary.some(e=>e.items.some(i=>i.header.type==='event')),'ordinary error delivery');
                  await page.getByRole('button',{name:'다음 배너',exact:true}).click();await waitUntil(page,()=>replays.length>=2,'second projected segment');
                  await page.evaluate(()=>scrollTo(0,650));await waitUntil(page,()=>replays.length>=3,'third projected segment');
                  const count=replays.length;await page.getByRole('button',{name:'중지',exact:true}).click();await page.waitForTimeout(1800);assert.equal(replays.length,count);
                  await verifyRestore(browser,page,replays,1280,viewer,out,name,{ excludeDiagnosticControls: true });
                } else {
                  const count=replays.length;
                  if(name==='more')await page.getByRole('button',{name:'더보기',exact:true}).click();
                  if(name==='tab')await page.keyboard.press('Tab');
                  if(name==='unknown-css')await page.evaluate(()=>{const style=document.createElement('style');style.textContent='.private-canary{color:red}';document.head.append(style);});
                  if(name==='remote-off'){deny=true;await page.getByRole('button',{name:'다음 배너',exact:true}).click();}
                  await page.getByText('진단이 종료되었습니다.',{exact:true}).waitFor({timeout:10000});await page.waitForTimeout(1800);assert.equal(replays.length,count);
                }
                assert.deepEqual(replays.map(e=>e.items.find(i=>i.header.type==='replay_event').payload.segment_id),replays.map((_,i)=>i));
                for (const envelope of replays) {
                  const replayId=envelope.items.find(i=>i.header.type==='replay_event').payload.replay_id;
                  for(const item of envelope.items.filter(i=>i.header.type==='replay_recording'))assert(!JSON.stringify(item.payload.records).includes(replayId),'ID masked in recording text');
                }
                const text=JSON.stringify(replays);assert(!/Synthetic vote|Synthetic artist|HttpOnlyCanary|synthetic-anon-key|private-canary/.test(text));
                assert(!/replay_id|replayId|\"Replays\"/.test(JSON.stringify(ordinary)),'ordinary correlation removed');
              }
            }
          }
        }
        assert.equal(errors.length,0,'no page errors');
        results.push({name,passed:true,replays:replays.length,raw:raw.length,eligibility,blocked});
      } catch(error) {
        results.push({name,passed:false,error:String(error),replays:replays.length,eligibility,errors});
        await page.screenshot({path:path.join(out,name+'-failure.png')});
      } finally {await context.close();}
      console.log(JSON.stringify(results.at(-1)));
    }
  } finally {await browser.close();fs.writeFileSync(path.join(out,capture?'capture.json':chrome?'chrome.json':'integration.json'),JSON.stringify({browser:browser.version(),chrome,results},null,2)+'\n');}
  if(results.some(r=>!r.passed))process.exitCode=1;
}
module.exports={main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
