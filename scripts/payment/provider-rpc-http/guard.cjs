'use strict';
// Cooperative wrappers for the reviewed fixture. Docker owns network isolation.
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const http2 = require('node:http2');
const dns = require('node:dns');
const dgram = require('node:dgram');
const processes = require('node:child_process');
const workers = require('node:worker_threads');
const config = JSON.parse(fs.readFileSync('/fixture/config.json', 'utf8'));
if (net.isIP(config.restIp) !== 4 || config.restPort !== 3000 || config.restAlias !== 'order-rest') {
  throw new Error('Invalid owned REST IPv4 boundary');
}
const blocked = [];
let proxyPort = null;
const rpc = 'get_web_payment_provider_binding';
function deny(kind) {
  blocked.push(kind);
  const error = new Error('PROVIDER_RPC_HTTP_NETWORK_DENIED:' + kind);
  error.code = 'PROVIDER_RPC_HTTP_NETWORK_DENIED';
  throw error;
}
function socketAllowed(host, port) {
  return (host === config.restIp && Number(port) === 3000)
    || (host === '127.0.0.1' && proxyPort !== null && Number(port) === proxyPort);
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const options = (Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args))[0];
  if (!options || options.path || !socketAllowed(options.host || 'localhost', options.port)) deny('tcp');
  return originalConnect.apply(this, args);
};
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  if (!args[0] || typeof args[0] !== 'object' || args[0].host !== '127.0.0.1' || args[0].port !== 0) deny('listen');
  return originalListen.apply(this, args);
};
function checkHttp(url, method) {
  if (url.protocol !== 'http:' || url.username || url.password || url.hash || !['GET', 'POST'].includes(method)) deny('http');
  if (!socketAllowed(url.hostname, Number(url.port || 80))) deny('http-address');
  const prefix = url.hostname === '127.0.0.1' ? '/rest/v1/rpc/' : '/rpc/';
  if (url.pathname !== prefix + rpc) deny('rpc-path');
  if (method === 'POST' && url.search) deny('rpc-query');
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (method !== 'GET' || !['p_actor_user_id', 'p_order_id'].includes(key) || seen.has(key)
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) deny('rpc-query');
    seen.add(key);
  }
}
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = function(target, init) {
  const url = new URL(typeof target === 'string' || target instanceof URL ? target : target.url);
  checkHttp(url, String(init?.method || target?.method || 'GET').toUpperCase());
  return originalFetch(target, init);
};
const originalRequest = http.request;
http.request = function(target, ...args) {
  let url, method;
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
  if (host !== config.restIp && host !== '127.0.0.1') deny('dns');
  const normalized = typeof options === 'number' || typeof options === 'string' ? { family: options } : options || {};
  if (![0, 4, 6, 'IPv4', 'IPv6'].includes(normalized.family ?? 0)) throw new TypeError('Invalid literal address family');
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
module.exports = {
  allowProxy(port) {
    if (proxyPort !== null || !Number.isInteger(port) || port < 1 || port > 65535 || port === 3000 || port === 54322) deny('proxy-registration');
    proxyPort = port;
  },
  report() {
    return { configured: { restIp: config.restIp, restPort: 3000, restAliasUse: 'metadata only; routing denied',
      proxyHost: '127.0.0.1', proxyPort, rpc, methods: ['GET', 'POST'], dns: 'approved IPv4 literals only; no resolver',
      tls: 'deny', https: 'deny', http2: 'deny', udp: 'deny', childProcess: 'deny', workers: 'deny',
      scope: 'Cooperative wrappers for fixed reviewed code, not hostile whole-OS isolation' }, blocked: [...blocked] };
  },
};
