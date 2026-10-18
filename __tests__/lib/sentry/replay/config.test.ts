import { afterEach, expect, it, vi } from 'vitest';
import { localReplayConfig } from '@/lib/sentry/replay/config';

afterEach(() => vi.unstubAllEnvs());
it('keeps remote origins disabled even if a deployment has the local trial flag', () => {
  vi.stubEnv('NEXT_PUBLIC_REPLAY_LOCAL_TEST', '1');
  for (const url of ['https://www.picnic.fan/ko/vote', 'https://preview.vercel.app/ko/vote', 'http://localhost:53931/ko/vote']) {
    expect(localReplayConfig(new URL(url))).toBeNull();
  }
});
it('requires the explicit local trial flag and its synthetic backend', () => {
  const location = new URL('http://127.0.0.1:53931/ko/vote');
  expect(localReplayConfig(location)).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_REPLAY_LOCAL_TEST', '1');
  expect(localReplayConfig(location)).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:59862');
  expect(localReplayConfig(location)).toEqual({ origin: 'http://127.0.0.1:53931', endpoint: 'http://127.0.0.1:59862/replay' });
});

it('refuses a Vercel build with the local flag', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['-e', "require('./next.config.js')"], { cwd: process.cwd(), encoding: 'utf8', env: { PATH: process.env.PATH, VERCEL: '1', NEXT_PUBLIC_REPLAY_LOCAL_TEST: '1' } });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Replay local harness must not be deployed to Vercel');
});
