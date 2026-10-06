'use strict';

/**
 * envelope 테스트의 두 시나리오(누출 run.js, 전달 delivery.js)가 같이 쓰는 것: 포트, 압축 풀기, next start, 기다리기.
 */

const { spawn } = require('child_process');
const http = require('http');
const zlib = require('zlib');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}

async function freePort() {
  const probe = http.createServer();
  const port = await listen(probe, '127.0.0.1');
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** Sentry SDK 가 보낸 envelope 본문의 압축을 푼다. */
function decode(body, encoding) {
  if (encoding === 'gzip') return zlib.gunzipSync(body);
  if (encoding === 'br') return zlib.brotliDecompressSync(body);
  if (encoding === 'deflate') return zlib.inflateSync(body);
  return body;
}

/** next start 를 띄우고 표준 출력·오류를 output 배열에 쌓는다. */
function startNext(nextBin, root, env, output) {
  const child = spawn(nextBin, ['start', '-p', env.PORT], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  return child;
}

/** check 가 참이 될 때까지 기다린다. what 을 주면 시간 초과에서 던지고, 주지 않으면 false 를 돌려준다. */
async function waitFor(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(100);
  }
  if (what) throw new Error(`시간 초과: ${what}`);
  return false;
}

/** next start 가 요청을 받을 준비가 될 때까지 기다린다. 요청을 보내지 않는다 — 첫 요청은 시나리오의 것이어야 한다. */
function waitUntilReady(next, output) {
  return waitFor(
    () => {
      if (next.exitCode !== null) throw new Error(`next start 가 종료됐다(코드 ${next.exitCode})\n${output.join('')}`);
      return output.join('').includes('Ready in');
    },
    60_000,
    'next start 준비',
  );
}

module.exports = { sleep, listen, freePort, decode, startNext, waitFor, waitUntilReady };
