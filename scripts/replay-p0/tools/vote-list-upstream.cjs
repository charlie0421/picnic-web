'use strict';
// Synthetic PostgREST upstream for the vote list harness. Every value is synthetic; no product data.
const fs = require('node:fs');
const http = require('node:http');

const tr = s => ({ ko: s, en: s });
/** 5 banners and 12 ongoing votes. Vote end times are relative to `now` (1 day + i hours). */
function fixtures(now) {
  const banners = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1, title: tr(`Synthetic banner ${i + 1}`),
    image: i === 2 ? null : tr(i === 3 ? '/images/replay-synthetic-missing.png' : '/images/logo.png'),
    link: null, duration: 3600, start_at: '2020-01-01T00:00:00Z', end_at: '2099-01-01T00:00:00Z',
    deleted_at: null, order: i, location: 'vote_home' }));
  const votes = Array.from({ length: 12 }, (_, i) => ({
    id: 910000 + i, title: tr(`Synthetic vote ${i + 1}`),
    main_image: i % 3 === 1 ? null : i % 3 === 0 ? '/images/logo.png' : '/images/replay-synthetic-missing.png',
    start_at: '2020-01-01T00:00:00Z', stop_at: new Date(now + 86400000 + i * 3600000).toISOString(),
    visible_at: '2020-01-01T00:00:00Z', deleted_at: null, updated_at: '2026-10-14T00:00:00Z',
    vote_category: 'birthday', vote_sub_category: 'idol', is_partnership: false, areas: ['kpop'],
    vote_item: Array.from({ length: 3 }, (_, j) => ({
      id: 920000 + i * 3 + j, vote_total: 300 - j * 100, updated_at: '2026-10-14T00:00:00Z',
      artist: { id: 930000 + j, name: tr(`Synthetic artist ${j}`), image: j === 1 ? null : '/images/logo.png',
        artist_group: { id: 940000, name: tr('Synthetic group') } } })),
    vote_reward: i % 2 ? [{ reward_id: 950000, reward: { id: 950000, title: tr('Synthetic reward'), thumbnail: '/images/logo.png' } }] : [] }));
  return { banners, votes };
}
/** The PostgREST filters the vote list sends (eq, is, lte, gt, cs) plus offset/limit. Other operators match every row. */
function filter(rows, q) {
  const offset = Number(q.get('offset') || 0); const limit = Number(q.get('limit') || 999);
  return rows.filter(row => [...q].every(([key, value]) => {
    if (!Object.hasOwn(row, key)) return true;
    const [op, ...rest] = value.split('.'); const x = rest.join('.');
    if (op === 'eq') return String(row[key]) === x;
    if (op === 'is') return x === 'null' ? row[key] === null : true;
    if (op === 'lte') return row[key] <= x;
    if (op === 'gt') return row[key] > x;
    if (op === 'cs') return x.slice(1, -1).split(',').every(a => row[key].includes(a));
    return true;
  })).slice(offset, offset + limit);
}
function startUpstream({ port, logFile, now }) {
  const data = fixtures(now);
  const server = http.createServer((req, res) => {
    req.resume();
    res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', '*');
    res.setHeader('content-type', 'application/json');
    const u = new URL(req.url, 'http://localhost'); let body = [];
    if (u.pathname === '/rest/v1/banner') body = filter(data.banners, u.searchParams);
    if (u.pathname === '/rest/v1/vote') body = filter(data.votes, u.searchParams);
    if (logFile) fs.appendFileSync(logFile, JSON.stringify({ method: req.method, path: u.pathname, query: u.search, rows: body.length }) + '\n');
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server)); });
}
module.exports = { fixtures, filter, startUpstream };
