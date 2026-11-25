import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createPortOneTestBindings } from '../portone-test/repository';
import { createPortOneTestTransport } from '../portone-test/transport';
import { readPortOneHostedChannels } from './config';
import { readContinuationSecret } from './continuation';
import { createHostedEntryGate } from './entry';
import { createHostedAvailability, createPortOneHostedRepository } from './repository';
import type { HostedDeps } from './service';

/**
 * Production-capable wiring. Nothing is open by default: channels, secrets, the local downstream opt-in and the
 * DB availability report are all unset or false until provisioned.
 */
export function createPortOneHostedDependencies(env: Readonly<Record<string, string | undefined>> = process.env): HostedDeps {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('PORTONE_HOSTED_UNAVAILABLE');
  // No user session, cookies or Authorization header enters the service client.
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (target, init) => fetch(target, { ...init, cache: 'no-store' }) } });
  return { repository: createPortOneHostedRepository(client), bindings: createPortOneTestBindings(client),
    entry: createHostedEntryGate(client), channels: readPortOneHostedChannels(env), transport: createPortOneTestTransport(),
    availability: createHostedAvailability(client, env), continuationSecret: readContinuationSecret(env), nowMs: Date.now };
}
