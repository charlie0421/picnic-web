// @vitest-environment node
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// 워크플로 파일을 YAML 로 읽어 구조를 검사하고, run 블록을 그대로 꺼내 가짜 Vercel API 로 실행한다.
// 스크립트는 워크플로 파일 안에만 있다. 그래서 이 검사가 실제로 실행되는 본문을 본다.
const WORKFLOW = path.join(process.cwd(), '.github/workflows/preview-alias.yml');
const source = readFileSync(WORKFLOW, 'utf8');
const workflow = parse(source) as {
  on: Record<string, unknown>;
  permissions: unknown;
  concurrency: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<string, {
    if: string;
    environment: { name: string; deployment: boolean };
    steps: Array<{ uses?: string; run?: string; env?: Record<string, string> }>;
  }>;
};
const job = workflow.jobs.alias;
const step = job.steps[0];
const script = step.run ?? '';

const ALIAS = 'preview.picnic.fan';
const TOKEN = 'test-token-value';
const REPO = 'charlie0421/picnic-web';

type Reply = { status: number; body: unknown };
type Seen = { method: string; url: string; auth: string | undefined; body: string };
type Deployment = Record<string, unknown>;

const NOT_FOUND: Reply = { status: 404, body: { error: { code: 'not_found' } } };

function preview(uid: string, created: number, overrides: Deployment = {}): Deployment {
  return {
    uid,
    url: `picnic-${uid.slice(4).toLowerCase()}-team.vercel.app`,
    created,
    state: 'READY',
    target: null,
    meta: { githubCommitOrg: 'charlie0421', githubCommitRepo: 'picnic-web' },
    ...overrides,
  };
}

let listReply: Reply;
let aliasReply: Reply;
let postReply: Reply;
let seen: Seen[];
let baseUrl = '';
let workDir = '';

const listOf = (...deployments: Deployment[]): Reply => ({ status: 200, body: { deployments } });
const aliasAt = (deploymentId: string): Reply => ({ status: 200, body: { alias: ALIAS, deploymentId } });

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, body });
    const url = new URL(req.url ?? '/', 'http://localhost');
    let reply: Reply = { status: 500, body: { error: { code: 'unexpected_route' } } };
    if (req.method === 'GET' && url.pathname === '/v6/deployments') reply = listReply;
    else if (req.method === 'GET' && url.pathname === `/v4/aliases/${ALIAS}`) reply = aliasReply;
    else if (req.method === 'POST' && /^\/v2\/deployments\/[^/]+\/aliases$/.test(url.pathname)) reply = postReply;
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
  });
});

function run(overrides: Record<string, string> = {}): Promise<{ code: number | null; output: string }> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    VERCEL_API: baseUrl,
    VERCEL_TOKEN: TOKEN,
    TEAM_ID: 'team_test',
    PROJECT_ID: 'prj_test',
    REPOSITORY: REPO,
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
const postedTo = () => posts().map((request) => request.url.split('?')[0]);

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
  listReply = listOf(preview('dpl_C', 3000), preview('dpl_B', 2000), preview('dpl_A', 1000));
  aliasReply = aliasAt('dpl_A');
  postReply = { status: 200, body: { alias: ALIAS, uid: 'alias_1' } };
  seen = [];
});

describe('preview-alias workflow definition', () => {
  it('runs only on a schedule or by hand, never on events tied to a branch commit', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(workflow.on.schedule).toEqual([{ cron: '*/5 * * * *' }]);
  });

  it('holds no repository permission and has a single job', () => {
    expect(workflow.permissions).toEqual({});
    expect(Object.keys(workflow.jobs)).toEqual(['alias']);
  });

  it('reads the token only through the main-only environment, without creating deployments', () => {
    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(job.environment).toEqual({ name: 'preview-alias', deployment: false });
    expect(step.env?.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');
  });

  it('never checks out code or uses an action', () => {
    expect(job.steps).toHaveLength(1);
    expect(job.steps.every((s) => s.uses === undefined)).toBe(true);
  });

  it('passes values only through env and calls the real Vercel API', () => {
    expect(script).not.toContain('${{');
    expect(script.startsWith('set -euo pipefail')).toBe(true);
    expect(step.env).toMatchObject({
      VERCEL_API: 'https://api.vercel.com',
      TEAM_ID: '${{ vars.VERCEL_TEAM_ID }}',
      PROJECT_ID: '${{ vars.VERCEL_PROJECT_ID }}',
      REPOSITORY: '${{ github.repository }}',
      ALIAS,
    });
  });

  it('serialises runs without cancelling a running one', () => {
    expect(workflow.concurrency).toEqual({ group: 'preview-alias', 'cancel-in-progress': false });
  });
});

describe('preview-alias script', () => {
  it('moves the address to the newest ready Preview of this repository', async () => {
    const result = await run();
    expect(result.code).toBe(0);
    expect(postedTo()).toEqual(['/v2/deployments/dpl_C/aliases']);
    expect(JSON.parse(posts()[0].body)).toEqual({ alias: ALIAS });
    expect(seen.every((request) => request.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(result.output).toContain(`${ALIAS} -> picnic-c-team.vercel.app`);
    expect(readFileSync(path.join(workDir, 'summary.md'), 'utf8')).toContain('picnic-c-team.vercel.app');
  });

  it('asks Vercel only for ready Preview deployments of this project and team', async () => {
    await run();
    const list = new URL(seen[0].url, 'http://localhost');
    expect(list.pathname).toBe('/v6/deployments');
    expect(Object.fromEntries(list.searchParams)).toEqual({
      projectId: 'prj_test', teamId: 'team_test', target: 'preview', state: 'READY', limit: '20',
    });
    expect(seen.every((request) => new URL(request.url, 'http://localhost').searchParams.get('teamId') === 'team_test')).toBe(true);
  });

  it('chooses by creation time, not by list order', async () => {
    listReply = listOf(preview('dpl_A', 1000), preview('dpl_C', 3000), preview('dpl_B', 2000));
    await run();
    expect(postedTo()).toEqual(['/v2/deployments/dpl_C/aliases']);
  });

  it('does nothing when the address already points to the newest Preview', async () => {
    aliasReply = aliasAt('dpl_C');
    const result = await run();
    expect(result.code).toBe(0);
    expect(posts()).toHaveLength(0);
    expect(result.output).toContain('::notice::');
  });

  it('does not lose the newest deployment when an older one finished last', async () => {
    // A 가 주소를 갖고 있고, C(가장 새 것)와 B(늦게 끝난 옛 것)의 이벤트 순서와 관계없이 C 를 고른다.
    aliasReply = aliasAt('dpl_B');
    await run();
    expect(postedTo()).toEqual(['/v2/deployments/dpl_C/aliases']);
  });

  it('creates the address when it does not exist yet', async () => {
    aliasReply = NOT_FOUND;
    await run();
    expect(postedTo()).toEqual(['/v2/deployments/dpl_C/aliases']);
  });

  it('repairs an address that points to another project or a deleted deployment', async () => {
    aliasReply = aliasAt('dpl_other_project');
    const result = await run();
    expect(result.code).toBe(0);
    expect(postedTo()).toEqual(['/v2/deployments/dpl_C/aliases']);
  });

  it.each([
    ['a Production deployment', { target: 'production' }],
    ['a deployment from another repository', { meta: { githubCommitOrg: 'someone', githubCommitRepo: 'picnic-web' } }],
    ['a fork deployment without repository information', { meta: {} }],
    ['a deployment that is not ready', { state: 'ERROR' }],
  ])('skips %s even when it is newer', async (_name, overrides) => {
    listReply = listOf(preview('dpl_X', 9000, overrides), preview('dpl_C', 3000));
    await run();
    expect(postedTo()).toEqual(['/v2/deployments/dpl_C/aliases']);
  });

  it('compares the repository name without regard to case', async () => {
    await run({ REPOSITORY: 'Charlie0421/Picnic-Web' });
    expect(postedTo()).toEqual(['/v2/deployments/dpl_C/aliases']);
  });

  it.each([
    ['no deployments at all', listOf()],
    ['only deployments that are not eligible', listOf(preview('dpl_X', 9000, { target: 'production' }))],
    ['a response without a deployments field', { status: 200, body: {} }],
  ])('leaves the address alone when there is %s', async (_name, reply) => {
    listReply = reply;
    const result = await run();
    expect(result.code).toBe(0);
    expect(posts()).toHaveLength(0);
    expect(seen).toHaveLength(1);
    expect(result.output).toContain('::notice::');
  });

  it.each([
    ['the list request fails', () => { listReply = { status: 503, body: { error: { code: 'unavailable' } } }; }, 'HTTP 503'],
    ['the list is not JSON', () => { listReply = { status: 200, body: '<html>' }; }, '::error::'],
    ['the current address cannot be read (429)', () => { aliasReply = { status: 429, body: { error: { code: 'rate_limited' } } }; }, 'HTTP 429'],
    ['the current address cannot be read (500)', () => { aliasReply = { status: 500, body: { error: { code: 'internal' } } }; }, 'HTTP 500'],
    ['the newest id has an unexpected form', () => { listReply = listOf(preview('dpl_C', 3000, { uid: 'dpl_C/../../x' })); }, '::error::'],
    ['the newest url has an unexpected form', () => { listReply = listOf(preview('dpl_C', 3000, { url: 'evil.example.com' })); }, '::error::'],
  ])('fails without moving the address when %s', async (_name, arrange, message) => {
    arrange();
    const result = await run();
    expect(result.code).toBe(1);
    expect(posts()).toHaveLength(0);
    expect(result.output).toContain(message);
  });

  it('fails and never prints the token when Vercel refuses the move', async () => {
    postReply = { status: 403, body: { error: { code: 'forbidden', message: `token ${TOKEN}` } } };
    const result = await run();
    expect(result.code).toBe(1);
    expect(result.output).not.toContain(TOKEN);
    expect(result.output).toContain('HTTP 403, forbidden');
  });

  it.each([
    ['VERCEL_TOKEN', { VERCEL_TOKEN: '' }],
    ['TEAM_ID', { TEAM_ID: '' }],
    ['PROJECT_ID', { PROJECT_ID: '' }],
    ['a team id with a query separator', { TEAM_ID: 'team_test&x=1' }],
    ['a project id with a path', { PROJECT_ID: 'prj/../x' }],
    ['a repository without an owner', { REPOSITORY: 'picnic-web' }],
    ['an alias with a path', { ALIAS: 'preview.picnic.fan/x' }],
  ])('fails before any request without a valid %s', async (_name, overrides) => {
    const result = await run(overrides);
    expect(result.code).toBe(1);
    expect(seen).toHaveLength(0);
    expect(result.output).toContain('::error::');
  });

  it('fails when the API cannot be reached', async () => {
    const result = await run({ VERCEL_API: 'http://127.0.0.1:9' });
    expect(result.code).toBe(1);
    expect(result.output).toContain('::error::');
  });
});
