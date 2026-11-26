'use strict';
// Root-owned guard, proxy and control channel for the H1 intake-hold fixture.
// Docker owns network isolation. These wrappers are cooperative checks for reviewed code.
// The proxy holds every proof RPC until the root has read the database on its own connection.
// No raw token, credential or request body leaves this process: events carry SHA-256 values only.
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const http2 = require('node:http2');
const dns = require('node:dns');
const dgram = require('node:dgram');
const crypto = require('node:crypto');
const readline = require('node:readline');
const processes = require('node:child_process');
const workers = require('node:worker_threads');

const config = JSON.parse(fs.readFileSync('/fixture/config.json', 'utf8'));
if (net.isIP(config.restIp) !== 4 || config.restPort !== 3000 || config.restAlias !== 'order-rest'
    || !['canonical', 'fault'].includes(config.phase)) {
  throw new Error('Invalid owned REST IPv4 boundary');
}
const P1 = 'record_web_payment_submission_result';
const OPEN = 'open_web_payment_read_cycle';
const COMPLETE = 'complete_web_payment_read_cycle';
const RPCS = ['get_web_payment_charge_context', 'prepare_web_payment_provider_context',
  'get_web_payment_provider_binding', 'authorize_web_payment_provider_entry', 'bind_web_payment_provider_identity',
  'record_web_payment_observation', 'claim_web_payment_charge', 'record_web_payment_submission_intent',
  P1, OPEN, COMPLETE, 'record_web_payment_preintent_assertions', 'claim_web_payment_reconciliation_item',
  'finish_web_payment_reconciliation_item', 'record_web_payment_reconciliation_run'];
const WRITING = { [P1]: ['CLASSIFIED', 'CONFLICT_RECORDED'], [OPEN]: ['OPENED'],
  [COMPLETE]: ['COMPLETED', 'LATE_RECORDED', 'CONFLICT_RECORDED'] };
const SHAPED_FIELDS = { [P1]: ['assertions'], [COMPLETE]: ['observed_capture_ids'] };
const MAX_BODY = 524288;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function emit(event) {
  const line = Buffer.from('H1_EVENT ' + JSON.stringify(event) + '\n', 'utf8');
  let offset = 0;
  while (offset < line.length) {
    try { offset += fs.writeSync(1, line, offset); }
    catch (error) { if (error.code !== 'EAGAIN') throw error; }
  }
}

let proxyPort = null;
const blocked = [];
function deny(kind, destination = null, method = null) {
  blocked.push(kind);
  emit({ type: 'unexpected-request', reason: kind, destination, method });
  const error = new Error('H1_NETWORK_DENIED:' + kind);
  error.code = 'H1_NETWORK_DENIED';
  throw error;
}
function socketAllowed(host, port) {
  return (host === config.restIp && Number(port) === 3000)
    || (host === '127.0.0.1' && proxyPort !== null && Number(port) === proxyPort);
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const options = (Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args))[0];
  if (!options || options.path || !socketAllowed(options.host || 'localhost', options.port)) {
    deny('tcp', options ? String(options.host) + ':' + String(options.port) : null);
  }
  return originalConnect.apply(this, args);
};
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  if (!args[0] || typeof args[0] !== 'object' || args[0].host !== '127.0.0.1' || args[0].port !== 0) deny('listen');
  return originalListen.apply(this, args);
};
// Canonical contract methods only: POST of an approved RPC, no query string.
function checkHttp(url, method) {
  const destination = url.host + url.pathname;
  if (url.protocol !== 'http:' || url.username || url.password || url.hash) deny('http', destination, method);
  if (!socketAllowed(url.hostname, Number(url.port || 80))) deny('http-address', destination, method);
  const prefix = url.hostname === '127.0.0.1' ? '/rest/v1/rpc/' : '/rpc/';
  if (!url.pathname.startsWith(prefix) || !RPCS.includes(url.pathname.slice(prefix.length))) deny('rpc-path', destination, method);
  if (method !== 'POST') deny('rpc-method', destination, method);
  if (url.search) deny('rpc-query', destination, method);
}
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = function(target, init) {
  const url = new URL(typeof target === 'string' || target instanceof URL ? target : target.url);
  checkHttp(url, String(init?.method || target?.method || 'GET').toUpperCase());
  return originalFetch(target, init);
};
const originalRequest = http.request;
http.request = function(target, ...args) {
  let url; let method;
  if (typeof target === 'string' || target instanceof URL) {
    url = new URL(target);
    const options = args[0] && typeof args[0] === 'object' ? args[0] : {};
    if (['hostname', 'host', 'port', 'path', 'protocol', 'auth', 'socketPath', 'createConnection', 'lookup']
      .some(key => key in options)) deny('http-options');
    method = String(options.method || 'GET').toUpperCase();
  } else {
    if (!target || typeof target !== 'object' || target.auth || target.socketPath || target.createConnection || target.lookup) deny('http-options');
    const host = target.hostname || target.host || 'localhost';
    url = new URL((target.protocol || 'http:') + '//' + host + (target.port ? ':' + target.port : '') + (target.path || '/'));
    method = String(target.method || 'GET').toUpperCase();
  }
  checkHttp(url, method);
  return originalRequest.call(this, target, ...args);
};
http.get = () => deny('http-get');
https.request = https.get = () => deny('https');
tls.connect = () => deny('tls');
http2.connect = () => deny('http2');
dgram.createSocket = () => deny('udp');
dgram.Socket.prototype.send = () => deny('udp');
for (const owner of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const name of Object.getOwnPropertyNames(owner)) {
    if (/^(lookup|resolve|reverse)/.test(name) && typeof owner[name] === 'function') owner[name] = () => deny('dns');
  }
}
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  processes[name] = () => deny('child-process');
}
workers.Worker = class { constructor() { deny('worker'); } };
function literalAddress(host, options) {
  if (host !== config.restIp && host !== '127.0.0.1') deny('dns', String(host));
  const normalized = typeof options === 'number' || typeof options === 'string' ? { family: options } : options || {};
  if (normalized.family === 6 || normalized.family === 'IPv6') {
    const error = new Error('Fixture is IPv4 only');
    error.code = 'EAI_ADDRFAMILY';
    throw error;
  }
  return normalized.all ? [{ address: host, family: 4 }] : { address: host, family: 4 };
}
dns.lookup = function(host, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  if (typeof callback !== 'function') throw new TypeError('Literal lookup callback required');
  let result;
  try { result = literalAddress(host, options); }
  catch (error) {
    if (error.code === 'EAI_ADDRFAMILY') { process.nextTick(callback, error); return; }
    throw error;
  }
  if (Array.isArray(result)) process.nextTick(callback, null, result);
  else process.nextTick(callback, null, result.address, result.family);
};
dns.promises.lookup = async (host, options) => literalAddress(host, options);

// ---------------------------------------------------------------------------
// Control channel: one JSON line for each root command. A release resolves one held gate.
// ---------------------------------------------------------------------------
const waiting = new Map();
let commandHandler = null;
let gateSerial = 0;
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { emit({ type: 'fatal', reason: 'COMMAND_JSON' }); process.exit(2); }
  if (message.op === 'release') {
    const resolve = waiting.get(message.gate);
    if (!resolve) { emit({ type: 'fatal', reason: 'UNKNOWN_GATE' }); process.exit(2); }
    waiting.delete(message.gate);
    resolve(message.action);
  } else if (commandHandler) {
    commandHandler(message);
  }
});
function hold(event) {
  const gate = ++gateSerial;
  const released = new Promise(resolve => waiting.set(gate, resolve));
  emit({ ...event, type: 'gate', gate });
  return released;
}

// ---------------------------------------------------------------------------
// Proxy to the owned PostgREST. One step is active at a time.
// ---------------------------------------------------------------------------
let serviceToken = null;
let step = null;
const lastBodies = new Map();
function upstream(name, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(`http://${config.restIp}:3000/rpc/${name}`), { method: 'POST', headers: {
      authorization: `Bearer ${serviceToken}`, accept: 'application/json', 'content-type': 'application/json',
      'content-length': Buffer.byteLength(body) } }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size <= MAX_BODY) chunks.push(Buffer.from(chunk)); });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode ?? 0, raw: Buffer.concat(chunks).toString('utf8'), size }));
    });
    request.setTimeout(9000, () => request.destroy(new Error('H1 upstream deadline')));
    request.on('error', reject);
    request.end(body);
  });
}
async function handle(request, response) {
  const active = step;
  if (!active || request.method !== 'POST' || !request.url || request.url.includes('?')
      || !request.url.startsWith('/rest/v1/rpc/')) throw new Error('Unapproved proxy request');
  const name = request.url.slice('/rest/v1/rpc/'.length);
  if (!RPCS.includes(name)) throw new Error('Unapproved proxy RPC');
  if (request.headers.authorization !== `Bearer ${serviceToken}` || request.headers.apikey !== serviceToken) {
    throw new Error('Proxy credential differs');
  }
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Proxy request is too large');
    chunks.push(Buffer.from(chunk));
  }
  const received = Buffer.concat(chunks).toString('utf8');
  const args = JSON.parse(received);
  const token = args.p_lease_token ?? args.p_cycle_token ?? null;
  const nth = (active.counts[name] = (active.counts[name] ?? 0) + 1);
  const proof = Object.prototype.hasOwnProperty.call(WRITING, name);
  // Crafted native acceptance probes only. The root names one approved field of the actual request and its
  // value. Facts, IDs, order, bind flags, receive index, sender tuple and cycle token are not changed.
  const payloadKey = name === P1 ? 'p_classification' : name === COMPLETE ? 'p_completion' : null;
  const payload = payloadKey !== null && args[payloadKey] !== null && typeof args[payloadKey] === 'object' ? args[payloadKey] : null;
  const shapedFields = [];
  for (const item of (active.shape ?? []).filter(row => row.rpc === name && (row.nth ?? 1) === nth)) {
    if (payload === null || !SHAPED_FIELDS[name]?.includes(item.field)) throw new Error('Unapproved shaped field');
    payload[item.field] = item.value;
    shapedFields.push(item.field);
  }
  const body = shapedFields.length ? JSON.stringify(args) : received;
  const count = value => (Array.isArray(value) ? value.length : null);
  // Safe request summary: kinds and counts only.
  const requestSummary = payload === null ? null : { kind: typeof payload.kind === 'string' ? payload.kind : null,
    category: typeof payload.category === 'string' ? payload.category : null, factCount: count(payload.facts),
    assertionCount: count(payload.assertions), captureIdCount: count(payload.post_capture_ids ?? payload.observed_capture_ids),
    receiveFactIndex: Number.isInteger(payload.receive_fact_index) ? payload.receive_fact_index : null, shapedFields };
  const base = { step: active.id, rpc: name, bytes: Buffer.byteLength(body), argsSha256: sha(body),
    tokenSha256: typeof token === 'string' ? sha(token) : null, request: requestSummary };
  if (proof) lastBodies.set(active.order + '|' + name, body);
  const rule = (active.gates ?? []).find(item => item.rpc === name && (item.nth ?? 1) === nth);
  const mode = rule ? rule.mode : 'observe';
  if (proof && (mode === 'hold-before' || mode === 'fail-before')) {
    // The request has not reached the database. hold-before waits for the root kill.
    await hold({ ...base, stage: 'before', mode });
    request.socket.destroy();
    return;
  }
  const result = await upstream(name, body);
  let parsed = null;
  try { parsed = JSON.parse(result.raw); } catch { /* A non-JSON reply has no outcome. */ }
  const record = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const outcome = typeof record.outcome === 'string' ? record.outcome : typeof record.decision === 'string' ? record.decision : null;
  const accepted = result.status >= 200 && result.status < 300;
  const report = { ...base, status: result.status, outcome, replayed: typeof record.replayed === 'boolean' ? record.replayed : null,
    errorCode: !accepted && typeof record.code === 'string' ? record.code : null,
    effectiveKind: typeof record.effective_kind === 'string' ? record.effective_kind : null,
    ids: { cycleId: typeof record.cycle_id === 'string' ? record.cycle_id : null } };
  if (!proof) {
    emit({ ...report, type: 'rpc' });
  } else {
    // The upstream reply is held. The root reads the row on its own connection, then delivers or drops the ACK.
    const writes = accepted && WRITING[name].includes(outcome) && record.replayed !== true;
    const action = await hold({ ...report, stage: 'after', mode, writes });
    if (action === 'drop') { request.socket.destroy(); return; }
  }
  response.writeHead(result.status, { 'content-type': 'application/json' });
  response.end(result.raw);
}
let server = null;
async function startProxy(token) {
  if (server || typeof token !== 'string' || !token) throw new Error('Proxy start is invalid');
  serviceToken = token;
  server = http.createServer((request, response) => {
    handle(request, response).catch(() => {
      emit({ type: 'unexpected-request', reason: 'proxy-refused', destination: '127.0.0.1' + String(request.url).slice(0, 120),
        method: request.method ?? null });
      request.socket.destroy();
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port: 0 }, resolve); });
  proxyPort = server.address().port;
  return `http://127.0.0.1:${proxyPort}`;
}

module.exports = {
  emit, startProxy,
  onCommand(handler) { commandHandler = handler; },
  beginStep(context) { step = { ...context, counts: {} }; },
  endStep() { step = null; },
  // The stored body stays in this process. It is used only for the replay, conflict and late steps.
  lastRequest(order, name) { return lastBodies.get(order + '|' + name) ?? null; },
  memory() { return { storedBodies: lastBodies.size, heldGates: waiting.size }; },
  async close() {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(() => resolve())); }
  },
  report() {
    return { configured: { restIp: config.restIp, restPort: 3000, proxyHost: '127.0.0.1', proxyPort, rpcs: RPCS,
      methods: ['POST'], dns: 'approved IPv4 literals only', tls: 'deny', https: 'deny', http2: 'deny', udp: 'deny',
      childProcess: 'deny', workers: 'deny', scope: 'Cooperative wrappers for fixed reviewed code' }, blocked: [...blocked] };
  },
};
