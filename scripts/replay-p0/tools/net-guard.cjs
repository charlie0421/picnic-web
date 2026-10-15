'use strict';
// Preloaded with NODE_OPTIONS=--require into the Next build and start processes of the replay harness, and so into their
// worker threads and child processes. Installs only when REPLAY_NET_GUARD=1.
// It checks every outgoing TCP and TLS connection at net.Socket.prototype.connect: fetch (undici, also Next's compiled
// copies), http, https, redirect hops and tls all open their sockets there, after any URL and option merging.
// Allowed: loopback hosts, unix sockets, and the exact hosts in REPLAY_NET_ALLOW (comma-separated). A blocked connection
// fails like a refused one (an 'error' event on the socket) before any DNS lookup, and is logged to REPLAY_NET_LOG.
const fs = require('node:fs');
const net = require('node:net');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
function hostAllowed(host, extra) {
  const raw = String(host).toLowerCase();
  if (LOOPBACK.has(raw)) return true; // checked before port removal: '::1' ends in ':1'
  const name = raw.replace(/:\d+$/, '');
  return LOOPBACK.has(name) || extra.includes(name);
}
/** Destination of a net.Socket.prototype.connect call: { path } for a unix socket, else { host }. */
function connectTarget(args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0]; // net.connect passes its normalized [options, callback] array
  if (first && typeof first === 'object') {
    if (first.path) return { path: String(first.path) };
    return { host: String(first.host || 'localhost') };
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { path: first }; // connect(path[, callback])
  return { host: typeof args[1] === 'string' ? args[1] : 'localhost' }; // connect(port[, host][, callback])
}
function install(env) {
  const extra = (env.REPLAY_NET_ALLOW || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    const target = connectTarget(args);
    if (target.path !== undefined || hostAllowed(target.host, extra)) return original.apply(this, args);
    if (env.REPLAY_NET_LOG) fs.appendFileSync(env.REPLAY_NET_LOG, JSON.stringify({ host: target.host, pid: process.pid }) + '\n');
    const error = Object.assign(new Error(`replay-harness-network-blocked:${target.host}`), { code: 'EREPLAYBLOCKED' });
    process.nextTick(() => this.destroy(error));
    return this;
  };
}
module.exports = { hostAllowed, connectTarget };
if (process.env.REPLAY_NET_GUARD === '1') install(process.env);
