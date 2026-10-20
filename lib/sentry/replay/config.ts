export type LocalReplayConfig = { origin: string; endpoint: string };

/** Only the isolated synthetic product harness uses this configuration. */
export function localReplayConfig(location: Pick<Location, 'origin'>): LocalReplayConfig | null {
  if (process.env.NEXT_PUBLIC_REPLAY_LOCAL_TEST !== '1'
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:59862'
    || location.origin !== 'http://127.0.0.1:53931') return null;
  return { origin: 'http://127.0.0.1:53931', endpoint: 'http://127.0.0.1:59862/replay' };
}
