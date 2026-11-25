import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isLocalPortOneDatabase } from '@/lib/payment/portone-test-local';
import { createRpcProviderEntryGate } from '../paypal-charge/provider-entry';
import { readPortOneTestConfig } from './config';
import { createPortOneTestBindings, createPortOneTestRepository } from './repository';
import { createPortOneTestTransport } from './transport';

export function createPortOneTestDependencies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isLocalPortOneDatabase(url) || !url || !key) throw new Error('PORTONE_TEST_UNAVAILABLE');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (target, init) => fetch(target, { ...init, cache: 'no-store' }) } });
  return { repository: createPortOneTestRepository(client), bindings: createPortOneTestBindings(client),
    entry: createRpcProviderEntryGate(client), config: readPortOneTestConfig(), transport: createPortOneTestTransport(), nowMs: Date.now };
}
