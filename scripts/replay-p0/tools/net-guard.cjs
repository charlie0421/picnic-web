'use strict';
// Preloaded with NODE_OPTIONS=--require into the Next build and start processes of the replay harness.
// Installs only when REPLAY_NET_GUARD=1. Allows loopback and the exact hosts in REPLAY_NET_ALLOW (comma-separated);
// every other request throws and is logged to REPLAY_NET_LOG.
const fs = require('node:fs');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
function hostAllowed(host, extra) {
  const raw = String(host).toLowerCase();
  if (LOOPBACK.has(raw)) return true; // checked before port removal: '::1' ends in ':1'
  const name = raw.replace(/:\d+$/, '');
  return LOOPBACK.has(name) || extra.includes(name);
}
/** Host of a fetch/http input. Request options without a host default to localhost, as in Node. */
function hostOf(input) {
  if (typeof input === 'string' || input instanceof URL) return new URL(String(input)).hostname;
  if (input && typeof input === 'object') {
    if (typeof input.url === 'string') return new URL(input.url).hostname;
    return input.hostname || input.host || 'localhost';
  }
  throw new Error('net-guard: unknown request input');
}
function install(env) {
  const extra = (env.REPLAY_NET_ALLOW || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const check = input => {
    const host = hostOf(input);
    if (hostAllowed(host, extra)) return;
    if (env.REPLAY_NET_LOG) fs.appendFileSync(env.REPLAY_NET_LOG, JSON.stringify({ host, pid: process.pid }) + '\n');
    throw new Error(`replay-harness-network-blocked:${host}`);
  };
  const originalFetch = globalThis.fetch;
  if (originalFetch) globalThis.fetch = (input, ...rest) => { check(input); return originalFetch(input, ...rest); };
  for (const name of ['node:http', 'node:https']) {
    const mod = require(name);
    for (const method of ['request', 'get']) {
      const original = mod[method];
      mod[method] = function guarded(input, ...rest) { check(input); return original.call(this, input, ...rest); };
    }
  }
}
module.exports = { hostAllowed, hostOf };
if (process.env.REPLAY_NET_GUARD === '1') install(process.env);
