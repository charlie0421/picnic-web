-- Test Script for Row-Level Security (RLS) Policies
-- Run this script after applying rls-policies.sql to verify correct implementation
-- Execute in Supabase SQL Editor

-- =====================================================
-- PREREQUISITE: Create Test Users and Data
-- =====================================================

-- Create test user profiles (run as service_role)
-- Note: In production, users would be created through auth.users first

-- Test User 1 (Regular User)
INSERT INTO user_profiles (id, email, nickname, is_admin, star_candy, star_candy_bonus)
VALUES 
  ('test-user-1', 'user1@test.com', 'TestUser1', false, 1000, 500)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  nickname = EXCLUDED.nickname,
  is_admin = EXCLUDED.is_admin;

-- Test User 2 (Regular User)
INSERT INTO user_profiles (id, email, nickname, is_admin, star_candy, star_candy_bonus)
VALUES 
  ('test-user-2', 'user2@test.com', 'TestUser2', false, 1500, 300)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  nickname = EXCLUDED.nickname,
  is_admin = EXCLUDED.is_admin;

-- Test User 3 (Admin User)
INSERT INTO user_profiles (id, email, nickname, is_admin, star_candy, star_candy_bonus)
VALUES 
  ('test-admin-1', 'admin@test.com', 'AdminUser', true, 5000, 1000)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  nickname = EXCLUDED.nickname,
  is_admin = EXCLUDED.is_admin;

-- Create test vote data
INSERT INTO vote (id, vote_content, area, category, start_at, stop_at)
VALUES 
  (999, '{"ko": "테스트 투표", "en": "Test Vote"}', 'all', 'test', NOW(), NOW() + INTERVAL '7 days')
ON CONFLICT (id) DO UPDATE SET
  vote_content = EXCLUDED.vote_content,
  area = EXCLUDED.area,
  category = EXCLUDED.category;

-- Create test vote items
INSERT INTO vote_item (id, vote_id, artist_id, vote_total)
VALUES 
  (9991, 999, 1, 100),
  (9992, 999, 2, 150)
ON CONFLICT (id) DO UPDATE SET
  vote_total = EXCLUDED.vote_total;

-- Create test vote picks
INSERT INTO vote_pick (user_id, vote_id, vote_item_id, amount)
VALUES 
  ('test-user-1', 999, 9991, 10),
  ('test-user-2', 999, 9992, 15)
ON CONFLICT (user_id, vote_id, vote_item_id) DO UPDATE SET
  amount = EXCLUDED.amount;

-- Create test comments
INSERT INTO vote_comment (id, vote_id, user_id, content)
VALUES 
  (9991, 999, 'test-user-1', 'Test comment from user 1'),
  (9992, 999, 'test-user-2', 'Test comment from user 2')
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content;

-- =====================================================
-- RLS POLICY TESTS
-- =====================================================

-- Test 1: USER_PROFILES Table Tests
-- =====================================================

-- Simulate auth.uid() = 'test-user-1'
SET LOCAL row_security = on;
-- Note: In real tests, you would authenticate as different users

-- Test: User can see their own profile
-- Expected: Should return 1 row for test-user-1
SELECT 'TEST 1.1: User Profile - Own Record' as test_name;
-- This would work when auth.uid() = 'test-user-1'
-- SELECT id, nickname, is_admin FROM user_profiles WHERE id = 'test-user-1';

-- Test: User should not see other users' sensitive data (star_candy)
-- Expected: RLS should filter based on policies
SELECT 'TEST 1.2: User Profile - Privacy Protection' as test_name;
-- SELECT id, nickname, star_candy FROM user_profiles;

-- Test: Admin can see all profiles
-- Expected: Should return all profiles when auth.uid() is admin
SELECT 'TEST 1.3: User Profile - Admin Access' as test_name;
-- This would work when auth.uid() = 'test-admin-1'
-- SELECT id, nickname, is_admin FROM user_profiles;

-- Test 2: VOTE_PICK Table Tests
-- =====================================================

-- Test: User can only see their own votes
-- Expected: Should only return votes for current user
SELECT 'TEST 2.1: Vote Pick - Own Records Only' as test_name;
-- SELECT user_id, vote_id, amount FROM vote_pick WHERE user_id = auth.uid()::text;

-- Test: User cannot see other users' votes
-- Expected: Should return empty or only current user's votes
SELECT 'TEST 2.2: Vote Pick - Privacy Protection' as test_name;
-- SELECT user_id, vote_id, amount FROM vote_pick;

-- Test: Admin can see all votes
-- Expected: Should return all vote records when user is admin
SELECT 'TEST 2.3: Vote Pick - Admin Access' as test_name;
-- This would work when auth.uid() = 'test-admin-1'
-- SELECT user_id, vote_id, amount FROM vote_pick;

-- Test 3: VOTE_COMMENT Table Tests
-- =====================================================

-- Test: All authenticated users can read non-deleted comments
-- Expected: Should return all non-deleted comments
SELECT 'TEST 3.1: Vote Comments - Public Reading' as test_name;
-- SELECT id, user_id, content FROM vote_comment WHERE deleted_at IS NULL;

-- Test: User can only update their own comments
-- Expected: Update should succeed for own comments only
SELECT 'TEST 3.2: Vote Comments - Own Update Rights' as test_name;
-- UPDATE vote_comment SET content = 'Updated content' 
-- WHERE id = 9991 AND user_id = auth.uid()::text;

-- Test 4: PUBLIC TABLES Tests (vote, vote_item, artist)
-- =====================================================

-- Test: All users can read public vote data
-- Expected: Should return all non-deleted votes
SELECT 'TEST 4.1: Public Tables - Vote Data' as test_name;
SELECT id, vote_content FROM vote WHERE deleted_at IS NULL AND id = 999;

-- Test: Regular users cannot modify public data
-- Expected: Should fail for non-admin users
SELECT 'TEST 4.2: Public Tables - Modification Protection' as test_name;
-- This should fail for regular users:
-- UPDATE vote SET vote_content = '{"ko": "Modified"}' WHERE id = 999;

-- Test: Admin can modify public data
-- Expected: Should succeed for admin users
SELECT 'TEST 4.3: Public Tables - Admin Modification' as test_name;
-- This should work when auth.uid() = 'test-admin-1':
-- UPDATE vote SET updated_at = NOW() WHERE id = 999;

-- =====================================================
-- HELPER FUNCTION TESTS
-- =====================================================

-- Test auth.is_admin() function
SELECT 'TEST 5.1: Helper Functions - is_admin()' as test_name;
-- SELECT auth.is_admin() as is_current_user_admin;

-- Test auth.owns_resource() function
SELECT 'TEST 5.2: Helper Functions - owns_resource()' as test_name;
-- SELECT auth.owns_resource('test-user-1') as owns_user1_resource;

-- =====================================================
-- SECURITY VALIDATION TESTS
-- =====================================================

-- Test: Verify RLS is enabled on all critical tables
SELECT 'TEST 6.1: RLS Status Check' as test_name;
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN (
    'user_profiles', 'vote_pick', 'vote_comment', 'vote_comment_like',
    'vote', 'vote_item', 'artist', 'artist_group'
)
ORDER BY tablename;

-- Test: List all RLS policies
SELECT 'TEST 6.2: RLS Policies List' as test_name;
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename IN (
    'user_profiles', 'vote_pick', 'vote_comment', 'vote_comment_like',
    'vote', 'vote_item', 'artist', 'artist_group'
)
ORDER BY tablename, policyname;

-- =====================================================
-- NEGATIVE SECURITY TESTS
-- =====================================================

-- Test: Try to access restricted data
SELECT 'TEST 7.1: Security - Unauthorized Access Attempt' as test_name;
-- These should fail or return filtered results:

-- Attempt to see all users' vote picks (should be filtered by RLS)
-- SELECT COUNT(*) as total_vote_picks FROM vote_pick;

-- Attempt to see other users' star_candy (should be filtered)
-- SELECT id, star_candy FROM user_profiles WHERE id != auth.uid();

-- Attempt to modify other users' data (should fail)
-- UPDATE user_profiles SET star_candy = 99999 WHERE id != auth.uid();

-- =====================================================
-- PERFORMANCE TESTS
-- =====================================================

-- Test: Check if RLS policies impact performance significantly
SELECT 'TEST 8.1: Performance - Query Execution Plans' as test_name;

-- Explain query plans for common operations
EXPLAIN (ANALYZE, BUFFERS) 
SELECT id, nickname FROM user_profiles WHERE deleted_at IS NULL;

EXPLAIN (ANALYZE, BUFFERS)
SELECT vote_id, SUM(amount) as total_votes 
FROM vote_pick 
WHERE deleted_at IS NULL 
GROUP BY vote_id;

-- =====================================================
-- CLEANUP TEST DATA
-- =====================================================

-- Uncomment to clean up test data after testing
-- DELETE FROM vote_comment WHERE id IN (9991, 9992);
-- DELETE FROM vote_pick WHERE vote_id = 999;
-- DELETE FROM vote_item WHERE id IN (9991, 9992);
-- DELETE FROM vote WHERE id = 999;
-- DELETE FROM user_profiles WHERE id IN ('test-user-1', 'test-user-2', 'test-admin-1');

-- =====================================================
-- MANUAL TESTING INSTRUCTIONS
-- =====================================================

/*
MANUAL TESTING STEPS:

1. Apply the RLS policies using rls-policies.sql
2. Run this test script to create test data
3. Use Supabase dashboard to switch between different users:
   - Log in as test-user-1 and run SELECT queries
   - Log in as test-user-2 and run SELECT queries  
   - Log in as test-admin-1 and run SELECT queries
4. Verify that:
   - Users can only see their own vote_pick records
   - Users can see all public vote data
   - Users can only modify their own comments
   - Admins can see and modify everything
   - Unauthorized operations are blocked

5. Test edge cases:
   - Deleted records are properly filtered
   - Null user_id fields are handled correctly
   - Invalid user IDs are rejected

6. Performance testing:
   - Run EXPLAIN on common queries to check overhead
   - Test with larger datasets if available

7. Security testing:
   - Try to bypass RLS using SQL injection techniques
   - Test with malformed auth.uid() values
   - Verify that service_role can still access everything
*/

SELECT 'RLS Policy Tests Completed - Review results above' as final_message;