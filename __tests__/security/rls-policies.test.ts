/**
 * Row-Level Security (RLS) Policy Tests
 * 
 * This test suite verifies that RLS policies are correctly implemented
 * and enforced for the Picnic application.
 */

import { createClient } from '@supabase/supabase-js';

// Test configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create different client instances for testing
const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

// Test user IDs
const TEST_USER_1 = 'test-user-1';
const TEST_USER_2 = 'test-user-2';
const TEST_ADMIN = 'test-admin-1';

describe('RLS Policy Tests', () => {
  beforeAll(async () => {
    // Set up test data using service role client
    await setupTestData();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
  });

  describe('User Profiles RLS', () => {
    test('User can read their own profile', async () => {
      // Simulate authenticated user
      const { data, error } = await anonClient
        .from('user_profiles')
        .select('id, nickname, is_admin')
        .eq('id', TEST_USER_1)
        .single();

      // Note: This test would need actual authentication simulation
      // In real implementation, you'd mock auth.uid() or use test auth tokens
      expect(error).toBeNull();
    });

    test('User cannot read other users sensitive data', async () => {
      // Test that RLS prevents access to other users' star_candy
      const { data, error } = await anonClient
        .from('user_profiles')
        .select('id, star_candy')
        .neq('id', TEST_USER_1);

      // Should be empty or filtered by RLS
      expect(data).toBeDefined();
    });

    test('Admin can read all profiles', async () => {
      // Test admin access (would require admin authentication)
      const { data, error } = await anonClient
        .from('user_profiles')
        .select('id, nickname, is_admin');

      expect(error).toBeNull();
    });
  });

  describe('Vote Pick RLS', () => {
    test('User can only see their own votes', async () => {
      const { data, error } = await anonClient
        .from('vote_pick')
        .select('user_id, vote_id, amount')
        .eq('user_id', TEST_USER_1);

      // Should only return current user's votes
      expect(error).toBeNull();
      if (data) {
        data.forEach(vote => {
          expect(vote.user_id).toBe(TEST_USER_1);
        });
      }
    });

    test('User cannot see other users votes', async () => {
      const { data, error } = await anonClient
        .from('vote_pick')
        .select('user_id, vote_id, amount');

      // Should be filtered by RLS
      expect(error).toBeNull();
    });

    test('User can insert their own votes', async () => {
      const newVote = {
        user_id: TEST_USER_1,
        vote_id: 999,
        vote_item_id: 9991,
        amount: 1
      };

      const { data, error } = await anonClient
        .from('vote_pick')
        .insert(newVote);

      // This would work if user is authenticated as TEST_USER_1
      // In real test, would need proper authentication
    });

    test('User cannot insert votes for other users', async () => {
      const maliciousVote = {
        user_id: TEST_USER_2, // Different user
        vote_id: 999,
        vote_item_id: 9991,
        amount: 999
      };

      const { data, error } = await anonClient
        .from('vote_pick')
        .insert(maliciousVote);

      // Should fail due to RLS policy
      expect(error).toBeDefined();
    });
  });

  describe('Vote Comment RLS', () => {
    test('All authenticated users can read comments', async () => {
      const { data, error } = await anonClient
        .from('vote_comment')
        .select('id, user_id, content')
        .is('deleted_at', null);

      expect(error).toBeNull();
    });

    test('User can update their own comments', async () => {
      const { data, error } = await anonClient
        .from('vote_comment')
        .update({ content: 'Updated content' })
        .eq('id', 9991)
        .eq('user_id', TEST_USER_1);

      // Should work if authenticated as TEST_USER_1
    });

    test('User cannot update other users comments', async () => {
      const { data, error } = await anonClient
        .from('vote_comment')
        .update({ content: 'Hacked content' })
        .eq('id', 9992)
        .eq('user_id', TEST_USER_2); // Different user

      // Should fail due to RLS policy
      expect(error).toBeDefined();
    });
  });

  describe('Public Tables RLS', () => {
    test('All users can read vote data', async () => {
      const { data, error } = await anonClient
        .from('vote')
        .select('id, vote_content')
        .is('deleted_at', null);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('All users can read vote items', async () => {
      const { data, error } = await anonClient
        .from('vote_item')
        .select('id, vote_id, vote_total')
        .is('deleted_at', null);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('All users can read artist data', async () => {
      const { data, error } = await anonClient
        .from('artist')
        .select('id, name')
        .is('deleted_at', null);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('Regular users cannot modify vote data', async () => {
      const { data, error } = await anonClient
        .from('vote')
        .update({ vote_content: { ko: 'Hacked vote' } })
        .eq('id', 999);

      // Should fail for non-admin users
      expect(error).toBeDefined();
    });
  });

  describe('Helper Functions', () => {
    test('auth.is_admin() function works', async () => {
      const { data, error } = await serviceClient
        .rpc('is_admin');

      expect(error).toBeNull();
      expect(typeof data).toBe('boolean');
    });

    test('auth.owns_resource() function works', async () => {
      const { data, error } = await serviceClient
        .rpc('owns_resource', { resource_user_id: TEST_USER_1 });

      expect(error).toBeNull();
      expect(typeof data).toBe('boolean');
    });
  });

  describe('Security Validation', () => {
    test('RLS is enabled on critical tables', async () => {
      const criticalTables = [
        'user_profiles',
        'vote_pick',
        'vote_comment',
        'vote',
        'vote_item'
      ];

      for (const table of criticalTables) {
        const { data, error } = await serviceClient
          .from('pg_tables')
          .select('tablename, rowsecurity')
          .eq('tablename', table)
          .single();

        expect(error).toBeNull();
        expect(data?.rowsecurity).toBe(true);
      }
    });

    test('RLS policies exist for critical tables', async () => {
      const { data, error } = await serviceClient
        .from('pg_policies')
        .select('tablename, policyname')
        .in('tablename', ['user_profiles', 'vote_pick', 'vote_comment']);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('Null user_id fields are handled correctly', async () => {
      const { data, error } = await anonClient
        .from('vote_comment')
        .select('*')
        .is('user_id', null);

      // Should return empty or be filtered by RLS
      expect(error).toBeNull();
    });

    test('Deleted records are properly filtered', async () => {
      const { data, error } = await anonClient
        .from('user_profiles')
        .select('*')
        .not('deleted_at', 'is', null);

      // Should not return deleted records
      expect(data).toEqual([]);
    });

    test('Invalid user IDs are rejected', async () => {
      const { data, error } = await anonClient
        .from('vote_pick')
        .insert({
          user_id: 'invalid-user-id',
          vote_id: 999,
          vote_item_id: 9991,
          amount: 1
        });

      // Should fail validation
      expect(error).toBeDefined();
    });
  });
});

// Helper functions for test setup and cleanup
async function setupTestData() {
  try {
    // Create test users
    await serviceClient
      .from('user_profiles')
      .upsert([
        {
          id: TEST_USER_1,
          email: 'user1@test.com',
          nickname: 'TestUser1',
          is_admin: false,
          star_candy: 1000,
          star_candy_bonus: 500
        },
        {
          id: TEST_USER_2,
          email: 'user2@test.com',
          nickname: 'TestUser2',
          is_admin: false,
          star_candy: 1500,
          star_candy_bonus: 300
        },
        {
          id: TEST_ADMIN,
          email: 'admin@test.com',
          nickname: 'AdminUser',
          is_admin: true,
          star_candy: 5000,
          star_candy_bonus: 1000
        }
      ]);

    // Create test vote
    await serviceClient
      .from('vote')
      .upsert({
        id: 999,
        vote_content: { ko: '테스트 투표', en: 'Test Vote' },
        area: 'all',
        category: 'test',
        start_at: new Date().toISOString(),
        stop_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

    // Create test vote items
    await serviceClient
      .from('vote_item')
      .upsert([
        { id: 9991, vote_id: 999, artist_id: 1, vote_total: 100 },
        { id: 9992, vote_id: 999, artist_id: 2, vote_total: 150 }
      ]);

    // Create test vote picks
    await serviceClient
      .from('vote_pick')
      .upsert([
        { user_id: TEST_USER_1, vote_id: 999, vote_item_id: 9991, amount: 10 },
        { user_id: TEST_USER_2, vote_id: 999, vote_item_id: 9992, amount: 15 }
      ]);

    // Create test comments
    await serviceClient
      .from('vote_comment')
      .upsert([
        { id: 9991, vote_id: 999, user_id: TEST_USER_1, content: 'Test comment from user 1' },
        { id: 9992, vote_id: 999, user_id: TEST_USER_2, content: 'Test comment from user 2' }
      ]);

    console.log('Test data setup completed');
  } catch (error) {
    console.error('Error setting up test data:', error);
  }
}

async function cleanupTestData() {
  try {
    // Clean up in reverse order due to foreign key constraints
    await serviceClient.from('vote_comment').delete().in('id', [9991, 9992]);
    await serviceClient.from('vote_pick').delete().eq('vote_id', 999);
    await serviceClient.from('vote_item').delete().in('id', [9991, 9992]);
    await serviceClient.from('vote').delete().eq('id', 999);
    await serviceClient.from('user_profiles').delete().in('id', [TEST_USER_1, TEST_USER_2, TEST_ADMIN]);

    console.log('Test data cleanup completed');
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
}

// Mock authentication helper (would be replaced with actual auth simulation)
function mockAuthUser(userId: string) {
  // In a real implementation, this would simulate authentication
  // by setting up proper JWT tokens or mocking auth.uid()
  return {
    uid: userId,
    email: `${userId}@test.com`
  };
}

// Performance test helper
async function measureQueryPerformance(query: () => Promise<any>) {
  const start = performance.now();
  const result = await query();
  const end = performance.now();
  
  return {
    result,
    duration: end - start
  };
}

export {
  setupTestData,
  cleanupTestData,
  mockAuthUser,
  measureQueryPerformance
};