'use strict';
// Cooperative in-process error detection for the reviewed fixture code.
// Docker's internal network is the external-network boundary. This is not
// a hostile-code sandbox: raw sockets constrain addresses, while only the
// fetch/http.request wrappers below constrain HTTP method and RPC path.
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const http2 = require('node:http2');
const dns = require('node:dns');
const dgram = require('node:dgram');
const childProcess = require('node:child_process');
const workerThreads = require('node:worker_threads');
const config = JSON.parse(fs.readFileSync('/fixture/config.json', 'utf8'));
if (net.isIP(config.restIp) !== 4 || config.restAlias !== 'order-rest' || config.restPort !== 3000) {
  throw new Error('Invalid owned PostgREST boundary');
}
let proxyPort = null;
const blocked = [];
function deny(kind) {
  blocked.push(kind);
  throw new Error('ORDER_HTTP_NETWORK_DENIED:' + kind);
}
function allowedSocket(host, port) {
  return (host === config.restIp || host === config.restAlias) && Number(port) === 3000
    || host === '127.0.0.1' && proxyPort !== null && Number(port) === proxyPort;
}
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const options = (Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args))[0];
  if (options.path || !allowedSocket(options.host || 'localhost', options.port)) deny('tcp');
  return socketConnect.apply(this, args);
};
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  const options = args[0];
  if (!options || typeof options !== 'object' || options.host !== '127.0.0.1' || options.port !== 0) deny('listen');
  return listen.apply(this, args);
};
function checkHttp(url, method) {
  if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash || method !== 'POST') deny('http');
  const port = Number(url.port || 80);
  if (!allowedSocket(url.hostname, port)) deny('http-address');
  const expectedPath = url.hostname === '127.0.0.1' ? '/rest/v1/rpc/create_web_payment_order' : '/rpc/create_web_payment_order';
  if (url.pathname !== expectedPath) deny('http-path');
}
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = function(target, init) {
  const url = new URL(typeof target === 'string' || target instanceof URL ? target : target.url);
  checkHttp(url, (init?.method || (target && target.method) || 'GET').toUpperCase());
  return realFetch(target, init);
};
const request = http.request;
http.request = function(target, ...args) {
  let url, method;
  if (typeof target === 'string' || target instanceof URL) {
    url = new URL(target); method = (args[0]?.method || 'GET').toUpperCase();
  } else {
    const host = target.hostname || target.host || 'localhost';
    url = new URL('http://' + host + ':' + (target.port || 80) + (target.path || '/'));
    method = (target.method || 'GET').toUpperCase();
  }
  checkHttp(url, method);
  return request.call(this, target, ...args);
};
http.get = () => deny('http-get');
https.request = https.get = () => deny('https');
tls.connect = () => deny('tls');
http2.connect = () => deny('http2');
dgram.createSocket = () => deny('udp');
dgram.Socket.prototype.send = () => deny('udp');
for (const owner of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const key of Object.getOwnPropertyNames(owner)) {
    if (/^(lookup|resolve|reverse)/.test(key) && typeof owner[key] === 'function') owner[key] = () => deny('dns');
  }
}
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  childProcess[key] = () => deny('child-process');
}
workerThreads.Worker = class DeniedWorker {
  constructor() { deny('worker-thread'); }
};
// Node's numeric bind path still calls dns.lookup. Return only these exact
// IPv4 literals asynchronously, without calling DNS, getaddrinfo or an OS
// resolver. Hostnames, other literals, resolve and reverse remain denied.
function literalResult(hostname, options) {
  if (hostname !== '127.0.0.1' && hostname !== config.restIp) deny('dns');
  const opts = typeof options === 'number' || typeof options === 'string' ? { family: options } : options || {};
  const family = opts.family ?? 0;
  if (![0, 4, 6, 'IPv4', 'IPv6'].includes(family)) throw new TypeError('Invalid literal lookup family');
  if (family === 6 || family === 'IPv6') {
    const error = new Error('No IPv6 result in the owned IPv4-only fixture');
    error.code = 'EAI_ADDRFAMILY';
    throw error;
  }
  return opts.all ? [{ address: hostname, family: 4 }] : { address: hostname, family: 4 };
}
dns.lookup = function(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  if (typeof callback !== 'function') throw new TypeError('Literal lookup requires a callback');
  let result;
  try { result = literalResult(hostname, options); }
  catch (error) {
    if (error.code === 'EAI_ADDRFAMILY') { process.nextTick(callback, error); return; }
    throw error;
  }
  if (Array.isArray(result)) process.nextTick(callback, null, result);
  else process.nextTick(callback, null, result.address, result.family);
};
dns.promises.lookup = async (hostname, options) => literalResult(hostname, options);
module.exports = {
  allowProxy(port) {
    if (proxyPort !== null || !Number.isInteger(port) || port < 1 || port > 65535 || port === 54322) deny('proxy-registration');
    proxyPort = port;
  },
  report() {
    return { configured: { restIp: config.restIp, restAlias: config.restAlias, restPort: 3000,
      proxyHost: '127.0.0.1', proxyPort,
      wrapperRpcOnly: 'fetch/http.request: POST create_web_payment_order at exact endpoint paths',
      rawSocketBoundary: 'owned PostgREST address:3000 or registered proxy address:port; no HTTP method/path mediation',
      enforcementScope: 'cooperative in-process detection for fixed reviewed code; Docker internal network is external-network boundary; not a hostile-code sandbox',
      dns: 'no-resolver: exact 127.0.0.1 and pinned PostgREST IPv4 literals only; Resolver prototypes deny',
      childProcess: 'spawn/exec/execFile/fork and sync variants deny', workerThreads: 'Worker deny', udp: 'deny-all', tls: 'deny-all' },
      observedBlocked: [...blocked] };
  },
};
