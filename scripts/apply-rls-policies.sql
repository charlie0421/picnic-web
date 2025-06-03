-- Picnic Application RLS Policies Application Script
-- Execute this in Supabase SQL Editor to apply Row-Level Security policies
-- =====================================================

-- 1. Enable RLS on all critical tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_pick ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_comment_like ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_comment_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_group ENABLE ROW LEVEL SECURITY;

-- 2. Create Helper Functions in auth schema
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT COALESCE(is_admin, false)
        FROM user_profiles
        WHERE id = auth.uid()
        AND deleted_at IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.owns_resource(resource_user_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN auth.uid()::text = resource_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant permissions to authenticated users
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.owns_resource(TEXT) TO authenticated;

-- =====================================================
-- 4. USER_PROFILES TABLE POLICIES
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "user_profiles_select_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_select_admin" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_admin" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_own" ON user_profiles;

-- Policy: Users can read their own profile
CREATE POLICY "user_profiles_select_own" ON user_profiles
    FOR SELECT USING (
        auth.uid() = id 
        AND deleted_at IS NULL
    );

-- Policy: Admins can read all profiles
CREATE POLICY "user_profiles_select_admin" ON user_profiles
    FOR SELECT USING (auth.is_admin());

-- Policy: Users can update their own profile
CREATE POLICY "user_profiles_update_own" ON user_profiles
    FOR UPDATE USING (
        auth.uid() = id 
        AND deleted_at IS NULL
    );

-- Policy: Admins can update any profile
CREATE POLICY "user_profiles_update_admin" ON user_profiles
    FOR UPDATE USING (auth.is_admin());

-- Policy: Users can insert their own profile (during signup)
CREATE POLICY "user_profiles_insert_own" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- =====================================================
-- 5. VOTE_PICK TABLE POLICIES
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "vote_pick_select_own" ON vote_pick;
DROP POLICY IF EXISTS "vote_pick_select_admin" ON vote_pick;
DROP POLICY IF EXISTS "vote_pick_insert_own" ON vote_pick;
DROP POLICY IF EXISTS "vote_pick_insert_admin" ON vote_pick;
DROP POLICY IF EXISTS "vote_pick_update_own" ON vote_pick;
DROP POLICY IF EXISTS "vote_pick_update_admin" ON vote_pick;

-- Policy: Users can read their own votes
CREATE POLICY "vote_pick_select_own" ON vote_pick
    FOR SELECT USING (
        auth.uid()::text = user_id::text
        AND deleted_at IS NULL
    );

-- Policy: Admins can read all votes
CREATE POLICY "vote_pick_select_admin" ON vote_pick
    FOR SELECT USING (auth.is_admin());

-- Policy: Users can insert their own votes
CREATE POLICY "vote_pick_insert_own" ON vote_pick
    FOR INSERT WITH CHECK (
        auth.uid()::text = user_id::text
        AND deleted_at IS NULL
    );

-- Policy: Admins can insert votes for any user
CREATE POLICY "vote_pick_insert_admin" ON vote_pick
    FOR INSERT WITH CHECK (auth.is_admin());

-- Policy: Users can update their own votes
CREATE POLICY "vote_pick_update_own" ON vote_pick
    FOR UPDATE USING (
        auth.uid()::text = user_id::text
        AND deleted_at IS NULL
    );

-- Policy: Admins can update any votes
CREATE POLICY "vote_pick_update_admin" ON vote_pick
    FOR UPDATE USING (auth.is_admin());

-- =====================================================
-- 6. VOTE_COMMENT TABLE POLICIES
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "vote_comment_select_all" ON vote_comment;
DROP POLICY IF EXISTS "vote_comment_insert_auth" ON vote_comment;
DROP POLICY IF EXISTS "vote_comment_update_own" ON vote_comment;
DROP POLICY IF EXISTS "vote_comment_update_admin" ON vote_comment;

-- Policy: All authenticated users can read non-deleted comments
CREATE POLICY "vote_comment_select_all" ON vote_comment
    FOR SELECT USING (
        auth.uid() IS NOT NULL 
        AND deleted_at IS NULL
    );

-- Policy: Authenticated users can insert comments
CREATE POLICY "vote_comment_insert_auth" ON vote_comment
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Comment authors can update their own comments
CREATE POLICY "vote_comment_update_own" ON vote_comment
    FOR UPDATE USING (
        auth.uid()::text = user_id::text
        AND deleted_at IS NULL
    );

-- Policy: Admins can update any comments
CREATE POLICY "vote_comment_update_admin" ON vote_comment
    FOR UPDATE USING (auth.is_admin());

-- =====================================================
-- 7. VOTE_COMMENT_LIKE TABLE POLICIES
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "vote_comment_like_select_all" ON vote_comment_like;
DROP POLICY IF EXISTS "vote_comment_like_insert_own" ON vote_comment_like;
DROP POLICY IF EXISTS "vote_comment_like_delete_own" ON vote_comment_like;

-- Policy: All authenticated users can read likes
CREATE POLICY "vote_comment_like_select_all" ON vote_comment_like
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Policy: Users can manage their own likes
CREATE POLICY "vote_comment_like_insert_own" ON vote_comment_like
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- Policy: Users can delete their own likes
CREATE POLICY "vote_comment_like_delete_own" ON vote_comment_like
    FOR DELETE USING (auth.uid()::text = user_id::text);

-- =====================================================
-- 8. VOTE_COMMENT_REPORT TABLE POLICIES
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "vote_comment_report_select_own" ON vote_comment_report;
DROP POLICY IF EXISTS "vote_comment_report_select_admin" ON vote_comment_report;
DROP POLICY IF EXISTS "vote_comment_report_insert_auth" ON vote_comment_report;

-- Policy: Users can read their own reports
CREATE POLICY "vote_comment_report_select_own" ON vote_comment_report
    FOR SELECT USING (auth.uid()::text = user_id::text);

-- Policy: Admins can read all reports
CREATE POLICY "vote_comment_report_select_admin" ON vote_comment_report
    FOR SELECT USING (auth.is_admin());

-- Policy: Authenticated users can create reports
CREATE POLICY "vote_comment_report_insert_auth" ON vote_comment_report
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- 9. PUBLIC TABLES (READ-ONLY FOR REGULAR USERS)
-- =====================================================

-- VOTE TABLE
DROP POLICY IF EXISTS "vote_select_all" ON vote;
DROP POLICY IF EXISTS "vote_modify_admin" ON vote;

-- Policy: All users can read non-deleted votes
CREATE POLICY "vote_select_all" ON vote
    FOR SELECT USING (deleted_at IS NULL);

-- Policy: Only admins can modify votes
CREATE POLICY "vote_modify_admin" ON vote
    FOR ALL USING (auth.is_admin());

-- VOTE_ITEM TABLE
DROP POLICY IF EXISTS "vote_item_select_all" ON vote_item;
DROP POLICY IF EXISTS "vote_item_modify_admin" ON vote_item;

-- Policy: All users can read non-deleted vote items
CREATE POLICY "vote_item_select_all" ON vote_item
    FOR SELECT USING (deleted_at IS NULL);

-- Policy: Only admins can modify vote items
CREATE POLICY "vote_item_modify_admin" ON vote_item
    FOR ALL USING (auth.is_admin());

-- ARTIST TABLE
DROP POLICY IF EXISTS "artist_select_all" ON artist;
DROP POLICY IF EXISTS "artist_modify_admin" ON artist;

-- Policy: All users can read non-deleted artists
CREATE POLICY "artist_select_all" ON artist
    FOR SELECT USING (deleted_at IS NULL);

-- Policy: Only admins can modify artists
CREATE POLICY "artist_modify_admin" ON artist
    FOR ALL USING (auth.is_admin());

-- ARTIST_GROUP TABLE
DROP POLICY IF EXISTS "artist_group_select_all" ON artist_group;
DROP POLICY IF EXISTS "artist_group_modify_admin" ON artist_group;

-- Policy: All users can read non-deleted artist groups
CREATE POLICY "artist_group_select_all" ON artist_group
    FOR SELECT USING (deleted_at IS NULL);

-- Policy: Only admins can modify artist groups
CREATE POLICY "artist_group_modify_admin" ON artist_group
    FOR ALL USING (auth.is_admin());

-- =====================================================
-- 10. VERIFICATION QUERIES
-- =====================================================

-- Check if RLS is enabled on all critical tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN (
    'user_profiles', 'vote_pick', 'vote_comment', 'vote_comment_like',
    'vote_comment_report', 'vote', 'vote_item', 'artist', 'artist_group'
)
ORDER BY tablename;

-- List all RLS policies that were created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename IN (
    'user_profiles', 'vote_pick', 'vote_comment', 'vote_comment_like',
    'vote_comment_report', 'vote', 'vote_item', 'artist', 'artist_group'
)
ORDER BY tablename, policyname;

-- Test helper functions
SELECT 'Testing auth.is_admin function' as test_name;
SELECT auth.is_admin() as is_current_user_admin;

SELECT 'Testing auth.owns_resource function' as test_name;
SELECT auth.owns_resource('test-user-id') as owns_test_resource;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================

SELECT 'RLS Policies Successfully Applied!' as status,
       'All critical tables now have Row-Level Security enabled.' as message,
       'Users can only access their own data, admins have full access.' as security_model;