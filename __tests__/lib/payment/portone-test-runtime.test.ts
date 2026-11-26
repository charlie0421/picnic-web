// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const create = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('@supabase/supabase-js', () => ({ createClient: create }));
import { createPortOneTestDependencies } from '@/lib/payment/portone-test/runtime';
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-only-service-key'); });
afterEach(() => vi.unstubAllEnvs());
describe('PortOne TEST local database boundary', () => {
  it.each(['https://xtijtefcycoeqludlngc.supabase.co', 'https://example.invalid', 'http://user:password@localhost:54321',
    'file:///tmp/database', 'http://localhost.example.invalid:54321', ''])('rejects a nonlocal database before creating a service client: %s', url => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url);
    expect(() => createPortOneTestDependencies()).toThrow('PORTONE_TEST_UNAVAILABLE');
    expect(create).not.toHaveBeenCalled();
  });
  it('creates the service adapter for the approved loopback DB with provider access disabled by default', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('PORTONE_TEST_CHECKOUT_ENABLED', 'false');
    const deps = createPortOneTestDependencies();
    expect(deps.config).toBeNull();
    expect(create).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:54321', 'fixture-only-service-key', expect.any(Object));
  });
});
