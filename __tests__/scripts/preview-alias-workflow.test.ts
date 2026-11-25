// @vitest-environment node
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// 워크플로의 run 블록을 그대로 꺼내 가짜 Vercel API 로 실행한다.
// 스크립트는 워크플로 파일 안에만 있다. 그래서 이 검사가 실제로 실행되는 본문을 본다.
const WORKFLOW = path.join(process.cwd(), '.github/workflows/preview-alias.yml');
const source = readFileSync(WORKFLOW, 'utf8');

function extractRunBlock(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^\s+run: \|\s*$/.test(line));
  if (start < 0) throw new Error('run block not found');
  const indent = (lines[start].match(/^\s+/)?.[0].length ?? 0) + 2;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (line.length - line.trimStart().length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}

const script = extractRunBlock(source);

const ALIAS = 'preview.picnic.fan';
const HOST = 'picnic-abc123-team.vercel.app';
const TOKEN = 'test-token-value';

type Reply = { status: number; body: unknown };
type Seen = { method: string; url: string; auth: string | undefined; body: string };

const NOT_FOUND: Reply = { status: 404, body: { error: { code: 'not_found' } } };

function deployment(overrides: Record<string, unknown> = {}): Reply {
  return {
    status: 200,
    body: {
      id: 'dpl_new',
      projectId: 'prj_test',
      target: null,
      readyState: 'READY',
      createdAt: 2000,
      meta: { githubCommitOrg: 'charlie0421', githubCommitRepo: 'picnic-web' },
      ...overrides,
    },
  };
}

let deployments: Record<string, Reply>;
let aliasReply: Reply;
let postReply: Reply;
let seen: Seen[];
let baseUrl = '';
let workDir = '';

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, body });
    const url = new URL(req.url ?? '/', 'http://localhost');
    const lookup = url.pathname.match(/^\/v13\/deployments\/([^/]+)$/);
    const assign = url.pathname.match(/^\/v2\/deployments\/([^/]+)\/aliases$/);
    let reply: Reply = { status: 500, body: { error: { code: 'unexpected_route' } } };
    if (req.method === 'GET' && lookup) reply = deployments[decodeURIComponent(lookup[1])] ?? NOT_FOUND;
    else if (req.method === 'GET' && url.pathname === `/v4/aliases/${ALIAS}`) reply = aliasReply;
    else if (req.method === 'POST' && assign) reply = postReply;
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
});

function run(overrides: Record<string, string> = {}): Promise<{ code: number | null; output: string }> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    VERCEL_API: baseUrl,
    VERCEL_TOKEN: TOKEN,
    TEAM_ID: 'team_test',
    PROJECT_ID: 'prj_test',
    DEPLOYMENT_URL: `https://${HOST}`,
    REPOSITORY: 'charlie0421/picnic-web',
    ALIAS,
    GITHUB_STEP_SUMMARY: path.join(workDir, 'summary.md'),
    ...overrides,
  };
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', script], { env, cwd: workDir });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

const posts = () => seen.filter((request) => request.method === 'POST');

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'preview-alias-'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  deployments = { [HOST]: deployment() };
  aliasReply = NOT_FOUND;
  postReply = { status: 200, body: { alias: ALIAS, uid: 'alias_1' } };
  seen = [];
});

describe('preview-alias workflow definition', () => {
  it('runs only for deployment status events and holds no repository permission', () => {
    expect(source).toMatch(/^on:\n {2}deployment_status:\n\npermissions: \{\}\n/m);
    expect(source.match(/^on:/gm)).toHaveLength(1);
  });

  it('never checks out code or uses a third-party action', () => {
    expect(source).not.toMatch(/^\s*-?\s*uses:/m);
    expect(source).not.toMatch(/actions\/checkout/);
  });

  it('acts only on successful Preview deployments that Vercel created', () => {
    expect(source).toContain("github.event.deployment_status.state == 'success'");
    expect(source).toContain("startsWith(github.event.deployment.environment, 'Preview')");
    expect(source).toContain("github.event.deployment.creator.login == 'vercel[bot]'");
  });

  it('keeps workflow expressions out of the shell script', () => {
    expect(script).not.toContain('${{');
    expect(script).toContain('set -euo pipefail');
  });

  it('calls the real Vercel API and serialises runs', () => {
    expect(source).toContain('VERCEL_API: https://api.vercel.com');
    expect(source).toMatch(/concurrency:\n {2}group: preview-alias\n {2}cancel-in-progress: false/);
  });
});

describe('preview-alias script', () => {
  it('moves the fixed address to a ready Preview deployment', async () => {
    const result = await run();
    expect(result.code).toBe(0);
    expect(posts()).toHaveLength(1);
    expect(posts()[0].url).toBe('/v2/deployments/dpl_new/aliases?teamId=team_test');
    expect(JSON.parse(posts()[0].body)).toEqual({ alias: ALIAS });
    expect(seen.every((request) => request.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(seen.every((request) => request.url.endsWith('?teamId=team_test'))).toBe(true);
    expect(result.output).toContain(`${ALIAS} -> ${HOST}`);
    expect(readFileSync(path.join(workDir, 'summary.md'), 'utf8')).toContain(HOST);
  });

  it('never prints the token', async () => {
    postReply = { status: 403, body: { error: { code: 'forbidden', message: `token ${TOKEN}` } } };
    const result = await run();
    expect(result.code).toBe(1);
    expect(result.output).not.toContain(TOKEN);
    expect(result.output).toContain('HTTP 403, forbidden');
  });

  it('does nothing when the address already points to this deployment', async () => {
    aliasReply = { status: 200, body: { alias: ALIAS, deploymentId: 'dpl_new' } };
    const result = await run();
    expect(result.code).toBe(0);
    expect(posts()).toHaveLength(0);
  });

  it('keeps the address on a newer deployment', async () => {
    aliasReply = { status: 200, body: { alias: ALIAS, deploymentId: 'dpl_newer' } };
    deployments.dpl_newer = deployment({ id: 'dpl_newer', createdAt: 3000 });
    const result = await run();
    expect(result.code).toBe(0);
    expect(posts()).toHaveLength(0);
    expect(result.output).toContain('::notice::');
  });

  it('moves the address away from an older deployment', async () => {
    aliasReply = { status: 200, body: { alias: ALIAS, deploymentId: 'dpl_old' } };
    deployments.dpl_old = deployment({ id: 'dpl_old', createdAt: 1000 });
    const result = await run();
    expect(result.code).toBe(0);
    expect(posts()).toHaveLength(1);
  });

  it('moves the address when the deployment it points to no longer exists', async () => {
    aliasReply = { status: 200, body: { alias: ALIAS, deploymentId: 'dpl_gone' } };
    const result = await run();
    expect(result.code).toBe(0);
    expect(posts()).toHaveLength(1);
  });

  it.each([
    ['another project', { projectId: 'prj_other' }],
    ['a Production deployment', { target: 'production' }],
    ['a commit from another repository', { meta: { githubCommitOrg: 'someone', githubCommitRepo: 'picnic-web' } }],
    ['a deployment without repository information', { meta: {} }],
  ])('skips %s without moving the address', async (_name, overrides) => {
    deployments[HOST] = deployment(overrides);
    const result = await run();
    expect(result.code).toBe(0);
    expect(posts()).toHaveLength(0);
    expect(result.output).toContain('::notice::');
  });

  it('compares the repository name without regard to case', async () => {
    const result = await run({ REPOSITORY: 'Charlie0421/Picnic-Web' });
    expect(result.code).toBe(0);
    expect(posts()).toHaveLength(1);
  });

  it.each([
    ['a deployment that is not ready', { readyState: 'ERROR' }],
    ['a deployment id with an unexpected form', { id: 'dpl_new/../../x' }],
  ])('fails for %s', async (_name, overrides) => {
    deployments[HOST] = deployment(overrides);
    const result = await run();
    expect(result.code).toBe(1);
    expect(posts()).toHaveLength(0);
    expect(result.output).toContain('::error::');
  });

  it.each([
    ['VERCEL_TOKEN', { VERCEL_TOKEN: '' }],
    ['TEAM_ID', { TEAM_ID: '' }],
    ['PROJECT_ID', { PROJECT_ID: '' }],
    ['a team id with a query separator', { TEAM_ID: 'team_test&x=1' }],
    ['an address outside Vercel', { DEPLOYMENT_URL: 'https://evil.example.com' }],
    ['an address with a path', { DEPLOYMENT_URL: `https://${HOST}/v2/deployments` }],
    ['an address with a command', { DEPLOYMENT_URL: 'https://a.vercel.app$(touch pwned)' }],
    ['an address without https', { DEPLOYMENT_URL: `http://${HOST}` }],
    ['an empty address', { DEPLOYMENT_URL: '' }],
  ])('fails before any request without %s', async (_name, overrides) => {
    const result = await run(overrides);
    expect(result.code).toBe(1);
    expect(seen).toHaveLength(0);
    expect(result.output).toContain('::error::');
  });

  it('fails when Vercel does not know the deployment', async () => {
    deployments = {};
    const result = await run();
    expect(result.code).toBe(1);
    expect(posts()).toHaveLength(0);
    expect(result.output).toContain('HTTP 404');
  });

  it('fails when the current address cannot be read', async () => {
    aliasReply = { status: 500, body: { error: { code: 'internal' } } };
    const result = await run();
    expect(result.code).toBe(1);
    expect(posts()).toHaveLength(0);
  });

  it('fails when the API cannot be reached', async () => {
    const result = await run({ VERCEL_API: 'http://127.0.0.1:9' });
    expect(result.code).toBe(1);
    expect(result.output).toContain('::error::');
  });
});
