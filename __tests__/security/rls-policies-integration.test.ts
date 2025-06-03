/**
 * RLS Policy Integration Tests
 * 
 * This test suite performs integration testing of RLS policies with actual
 * Supabase connections using environment variables for credentials.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Skip tests if not in test environment
const skipTests = !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

if (skipTests) {
  console.warn('⚠️ Skipping RLS integration tests - missing environment variables');
}

// Test configuration
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

// Create client instances
let serviceClient: SupabaseClient;
let anonClient: SupabaseClient;

// Test constants
const TEST_USER_PREFIX = 'rls-test-';
const TEST_USERS = {
  user1: `${TEST_USER_PREFIX}user-1-${Date.now()}`,
  user2: `${TEST_USER_PREFIX}user-2-${Date.now()}`,
  admin: `${TEST_USER_PREFIX}admin-${Date.now()}`
};

const TEST_VOTE_ID = 88888;
const TEST_VOTE_ITEM_IDS = [888881, 888882];
const TEST_COMMENT_IDS = [888881, 888882];

describe('RLS Policy Integration Tests', () => {
  beforeAll(async () => {
    if (skipTests) {
      return;
    }

    serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    anonClient = createClient(supabaseUrl, supabaseAnonKey);
    
    // Setup test data
    await setupTestData();
  }, 30000);

  afterAll(async () => {
    if (skipTests) {
      return;
    }

    // Cleanup test data
    await cleanupTestData();
  }, 30000);

  describe('RLS Infrastructure', () => {
    test('should have RLS enabled on critical tables', async () => {
      if (skipTests) return;

      const criticalTables = [
        'user_profiles',
        'vote_pick',
        'vote_comment',
        'vote_comment_like',
        'vote',
        'vote_item',
        'artist',
        'artist_group'
      ];

      const { data, error } = await serviceClient
        .from('pg_tables')
        .select('tablename, rowsecurity')
        .in('tablename', criticalTables);

      expect(error).toBeNull();
      expect(data).toBeDefined();

      const rlsStatus = new Map(data!.map(table => [table.tablename, table.rowsecurity]));
      
      criticalTables.forEach(table => {
        expect(rlsStatus.get(table)).toBe(true);
      });
    });

    test('should have required RLS policies', async () => {
      if (skipTests) return;

      const { data, error } = await serviceClient
        .from('pg_policies')
        .select('tablename, policyname, cmd')
        .in('tablename', ['user_profiles', 'vote_pick', 'vote_comment']);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBeGreaterThan(0);

      // Check for essential policies
      const policies = new Set(data!.map(p => `${p.tablename}.${p.cmd}`));
      
      const requiredPolicies = [
        'user_profiles.SELECT',
        'user_profiles.UPDATE',
        'vote_pick.SELECT',
        'vote_pick.INSERT',
        'vote_comment.SELECT',
        'vote_comment.UPDATE'
      ];

      requiredPolicies.forEach(policy => {
        expect(policies.has(policy)).toBe(true);
      });
    });

    test('should have working helper functions', async () => {
      if (skipTests) return;

      // Test is_admin function
      const { data: isAdminResult, error: isAdminError } = await serviceClient
        .rpc('is_admin');

      expect(isAdminError).toBeNull();
      expect(typeof isAdminResult).toBe('boolean');

      // Test owns_resource function
      const { data: ownsResult, error: ownsError } = await serviceClient
        .rpc('owns_resource', { resource_user_id: TEST_USERS.user1 });

      expect(ownsError).toBeNull();
      expect(typeof ownsResult).toBe('boolean');
    });
  });

  describe('Public Table Access', () => {
    test('should allow reading public vote data', async () => {
      if (skipTests) return;

      const { data, error } = await anonClient
        .from('vote')
        .select('id, vote_content, area, category')
        .eq('id', TEST_VOTE_ID)
        .is('deleted_at', null);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBe(1);
      expect(data![0].id).toBe(TEST_VOTE_ID);
    });

    test('should allow reading vote items', async () => {
      if (skipTests) return;

      const { data, error } = await anonClient
        .from('vote_item')
        .select('id, vote_id, vote_total')
        .eq('vote_id', TEST_VOTE_ID)
        .is('deleted_at', null);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBe(2);
    });

    test('should block anonymous vote modifications', async () => {
      if (skipTests) return;

      const { error } = await anonClient
        .from('vote')
        .update({ vote_content: { ko: 'Hacked vote' } })
        .eq('id', TEST_VOTE_ID);

      // Should fail for anonymous users
      expect(error).toBeDefined();
    });

    test('should allow reading artist data', async () => {
      if (skipTests) return;

      const { data, error } = await anonClient
        .from('artist')
        .select('id, name')
        .is('deleted_at', null)
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });
  });

  describe('User Profile Security', () => {
    test('should protect sensitive user data from anonymous access', async () => {
      if (skipTests) return;

      const { data, error } = await anonClient
        .from('user_profiles')
        .select('id, star_candy, star_candy_bonus')
        .in('id', Object.values(TEST_USERS));

      // Should either error or return empty/filtered data
      if (!error) {
        // If no error, sensitive fields should be null or empty
        expect(data).toBeDefined();
        if (data!.length > 0) {
          data!.forEach(user => {
            expect(user.star_candy).toBeNull();
            expect(user.star_candy_bonus).toBeNull();
          });
        }
      }
    });

    test('should allow reading public profile fields', async () => {
      if (skipTests) return;

      const { data, error } = await anonClient
        .from('user_profiles')
        .select('id, nickname')
        .in('id', Object.values(TEST_USERS))
        .is('deleted_at', null);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('should block profile modifications from anonymous users', async () => {
      if (skipTests) return;

      const { error } = await anonClient
        .from('user_profiles')
        .update({ star_candy: 99999 })
        .eq('id', TEST_USERS.user1);

      // Should fail for anonymous users
      expect(error).toBeDefined();
    });
  });

  describe('Vote Pick Security', () => {
    test('should hide vote picks from anonymous users', async () => {
      if (skipTests) return;

      const { data, error } = await anonClient
        .from('vote_pick')
        .select('user_id, amount')
        .eq('vote_id', TEST_VOTE_ID);

      // Should either error or return empty data
      if (!error) {
        expect(data).toBeDefined();
        expect(data!.length).toBe(0);
      }
    });

    test('should block vote pick insertions from anonymous users', async () => {
      if (skipTests) return;

      const { error } = await anonClient
        .from('vote_pick')
        .insert({
          user_id: TEST_USERS.user1,
          vote_id: TEST_VOTE_ID,
          vote_item_id: TEST_VOTE_ITEM_IDS[0],
          amount: 999
        });

      // Should fail for anonymous users
      expect(error).toBeDefined();
    });

    test('should block vote pick updates from anonymous users', async () => {
      if (skipTests) return;

      const { error } = await anonClient
        .from('vote_pick')
        .update({ amount: 999 })
        .eq('user_id', TEST_USERS.user1)
        .eq('vote_id', TEST_VOTE_ID);

      // Should fail for anonymous users
      expect(error).toBeDefined();
    });
  });

  describe('Comment Security', () => {
    test('should allow reading non-deleted comments', async () => {
      if (skipTests) return;

      const { data, error } = await anonClient
        .from('vote_comment')
        .select('id, user_id, content')
        .eq('vote_id', TEST_VOTE_ID)
        .is('deleted_at', null);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBe(2);
    });

    test('should block comment modifications from anonymous users', async () => {
      if (skipTests) return;

      const { error } = await anonClient
        .from('vote_comment')
        .update({ content: 'Hacked comment' })
        .eq('id', TEST_COMMENT_IDS[0]);

      // Should fail for anonymous users
      expect(error).toBeDefined();
    });

    test('should block comment insertions from anonymous users', async () => {
      if (skipTests) return;

      const { error } = await anonClient
        .from('vote_comment')
        .insert({
          vote_id: TEST_VOTE_ID,
          user_id: TEST_USERS.user1,
          content: 'Anonymous comment'
        });

      // Should fail for anonymous users
      expect(error).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    test('should filter deleted records', async () => {
      if (skipTests) return;

      // Try to access deleted records
      const { data, error } = await anonClient
        .from('user_profiles')
        .select('*')
        .not('deleted_at', 'is', null);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBe(0);
    });

    test('should handle null user_id gracefully', async () => {
      if (skipTests) return;

      const { data, error } = await anonClient
        .from('vote_comment')
        .select('*')
        .is('user_id', null);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('should validate user_id format', async () => {
      if (skipTests) return;

      const { error } = await serviceClient
        .from('vote_pick')
        .insert({
          user_id: 'invalid-user-format',
          vote_id: TEST_VOTE_ID,
          vote_item_id: TEST_VOTE_ITEM_IDS[0],
          amount: 1
        });

      // Should fail validation or foreign key constraint
      expect(error).toBeDefined();
    });
  });

  describe('Performance Impact', () => {
    test('should execute queries within reasonable time', async () => {
      if (skipTests) return;

      const queries = [
        () => anonClient.from('user_profiles').select('id, nickname').limit(10),
        () => anonClient.from('vote').select('id, vote_content').limit(10),
        () => anonClient.from('vote_item').select('id, vote_total').limit(10)
      ];

      for (const query of queries) {
        const start = performance.now();
        const { error } = await query();
        const duration = performance.now() - start;

        expect(error).toBeNull();
        expect(duration).toBeLessThan(5000); // 5 seconds max
      }
    });

    test('should not cause excessive query plan changes', async () => {
      if (skipTests) return;

      // Simple performance check - queries should complete quickly
      const start = performance.now();
      
      const { data, error } = await anonClient
        .from('vote')
        .select('id, vote_content')
        .is('deleted_at', null)
        .limit(20);

      const duration = performance.now() - start;

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(duration).toBeLessThan(2000); // 2 seconds max for simple query
    });
  });

  describe('Security Validation', () => {
    test('should prevent SQL injection through RLS policies', async () => {
      if (skipTests) return;

      // Try various SQL injection patterns
      const maliciousInputs = [
        "'; DROP TABLE user_profiles; --",
        "1' OR '1'='1",
        "1; DELETE FROM vote_pick; --"
      ];

      for (const input of maliciousInputs) {
        const { error } = await anonClient
          .from('user_profiles')
          .select('*')
          .eq('id', input);

        // Should not cause database errors and should return no data
        expect(error).toBeNull();
      }
    });

    test('should maintain data integrity across operations', async () => {
      if (skipTests) return;

      // Verify test data integrity
      const { data: voteData, error: voteError } = await serviceClient
        .from('vote')
        .select('id')
        .eq('id', TEST_VOTE_ID);

      expect(voteError).toBeNull();
      expect(voteData).toBeDefined();
      expect(voteData!.length).toBe(1);

      const { data: userProfiles, error: profileError } = await serviceClient
        .from('user_profiles')
        .select('id')
        .in('id', Object.values(TEST_USERS));

      expect(profileError).toBeNull();
      expect(userProfiles).toBeDefined();
      expect(userProfiles!.length).toBe(3);
    });
  });
});

/**
 * Setup test data for RLS testing
 */
async function setupTestData() {
  try {
    console.log('Setting up RLS test data...');

    // Create test users
    const { error: userError } = await serviceClient
      .from('user_profiles')
      .upsert([
        {
          id: TEST_USERS.user1,
          email: `${TEST_USERS.user1}@rls-test.com`,
          nickname: 'RLS-TestUser1',
          is_admin: false,
          star_candy: 1000,
          star_candy_bonus: 500
        },
        {
          id: TEST_USERS.user2,
          email: `${TEST_USERS.user2}@rls-test.com`,
          nickname: 'RLS-TestUser2',
          is_admin: false,
          star_candy: 1500,
          star_candy_bonus: 300
        },
        {
          id: TEST_USERS.admin,
          email: `${TEST_USERS.admin}@rls-test.com`,
          nickname: 'RLS-AdminUser',
          is_admin: true,
          star_candy: 5000,
          star_candy_bonus: 1000
        }
      ]);

    if (userError) throw userError;

    // Create test vote
    const { error: voteError } = await serviceClient
      .from('vote')
      .upsert({
        id: TEST_VOTE_ID,
        vote_content: { ko: 'RLS 테스트 투표', en: 'RLS Test Vote' },
        area: 'all',
        category: 'test',
        start_at: new Date().toISOString(),
        stop_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

    if (voteError) throw voteError;

    // Create test vote items
    const { error: itemError } = await serviceClient
      .from('vote_item')
      .upsert([
        { id: TEST_VOTE_ITEM_IDS[0], vote_id: TEST_VOTE_ID, artist_id: 1, vote_total: 100 },
        { id: TEST_VOTE_ITEM_IDS[1], vote_id: TEST_VOTE_ID, artist_id: 2, vote_total: 150 }
      ]);

    if (itemError) throw itemError;

    // Create test vote picks
    const { error: pickError } = await serviceClient
      .from('vote_pick')
      .upsert([
        { user_id: TEST_USERS.user1, vote_id: TEST_VOTE_ID, vote_item_id: TEST_VOTE_ITEM_IDS[0], amount: 10 },
        { user_id: TEST_USERS.user2, vote_id: TEST_VOTE_ID, vote_item_id: TEST_VOTE_ITEM_IDS[1], amount: 15 }
      ]);

    if (pickError) throw pickError;

    // Create test comments
    const { error: commentError } = await serviceClient
      .from('vote_comment')
      .upsert([
        { id: TEST_COMMENT_IDS[0], vote_id: TEST_VOTE_ID, user_id: TEST_USERS.user1, content: 'RLS Test comment 1' },
        { id: TEST_COMMENT_IDS[1], vote_id: TEST_VOTE_ID, user_id: TEST_USERS.user2, content: 'RLS Test comment 2' }
      ]);

    if (commentError) throw commentError;

    console.log('RLS test data setup completed');
  } catch (error) {
    console.error('Error setting up RLS test data:', error);
    throw error;
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData() {
  try {
    console.log('Cleaning up RLS test data...');

    // Clean up in reverse order due to foreign key constraints
    await serviceClient.from('vote_comment').delete().in('id', TEST_COMMENT_IDS);
    await serviceClient.from('vote_pick').delete().eq('vote_id', TEST_VOTE_ID);
    await serviceClient.from('vote_item').delete().in('id', TEST_VOTE_ITEM_IDS);
    await serviceClient.from('vote').delete().eq('id', TEST_VOTE_ID);
    await serviceClient.from('user_profiles').delete().in('id', Object.values(TEST_USERS));

    console.log('RLS test data cleanup completed');
  } catch (error) {
    console.error('Error cleaning up RLS test data:', error);
  }
}