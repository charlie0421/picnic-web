-- Picnic Application Row-Level Security (RLS) Policies
-- This script implements comprehensive RLS policies for all relevant tables
-- Execute this script in Supabase SQL Editor

-- =====================================================
-- 1. USER_PROFILES TABLE RLS POLICIES
-- =====================================================

-- Enable RLS on user_profiles table
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "user_profiles_select_own" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

-- Policy: Admins can read all profiles
CREATE POLICY "user_profiles_select_admin" ON user_profiles
    FOR SELECT USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Policy: Public fields visible to authenticated users (nickname, avatar_url)
CREATE POLICY "user_profiles_select_public" ON user_profiles
    FOR SELECT USING (
        auth.uid() IS NOT NULL 
        AND deleted_at IS NULL
    );

-- Policy: Users can update their own profile
CREATE POLICY "user_profiles_update_own" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Policy: Admins can update any profile
CREATE POLICY "user_profiles_update_admin" ON user_profiles
    FOR UPDATE USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Policy: Users can insert their own profile (during signup)
CREATE POLICY "user_profiles_insert_own" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Policy: Only admins can delete profiles
CREATE POLICY "user_profiles_delete_admin" ON user_profiles
    FOR DELETE USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- =====================================================
-- 2. VOTE_PICK TABLE RLS POLICIES
-- =====================================================

-- Enable RLS on vote_pick table
ALTER TABLE vote_pick ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own votes
CREATE POLICY "vote_pick_select_own" ON vote_pick
    FOR SELECT USING (auth.uid()::text = user_id::text);

-- Policy: Admins can read all votes
CREATE POLICY "vote_pick_select_admin" ON vote_pick
    FOR SELECT USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Policy: Users can insert their own votes
CREATE POLICY "vote_pick_insert_own" ON vote_pick
    FOR INSERT WITH CHECK (
        auth.uid()::text = user_id::text
        AND deleted_at IS NULL
    );

-- Policy: Admins can insert votes for any user
CREATE POLICY "vote_pick_insert_admin" ON vote_pick
    FOR INSERT WITH CHECK (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Policy: Users can update their own votes
CREATE POLICY "vote_pick_update_own" ON vote_pick
    FOR UPDATE USING (
        auth.uid()::text = user_id::text
        AND deleted_at IS NULL
    );

-- Policy: Admins can update any votes
CREATE POLICY "vote_pick_update_admin" ON vote_pick
    FOR UPDATE USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Policy: Users can delete their own votes
CREATE POLICY "vote_pick_delete_own" ON vote_pick
    FOR DELETE USING (auth.uid()::text = user_id::text);

-- Policy: Admins can delete any votes
CREATE POLICY "vote_pick_delete_admin" ON vote_pick
    FOR DELETE USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- =====================================================
-- 3. VOTE_COMMENT TABLE RLS POLICIES
-- =====================================================

-- Enable RLS on vote_comment table
ALTER TABLE vote_comment ENABLE ROW LEVEL SECURITY;

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
    FOR UPDATE USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Policy: Comment authors can delete their own comments
CREATE POLICY "vote_comment_delete_own" ON vote_comment
    FOR DELETE USING (auth.uid()::text = user_id::text);

-- Policy: Admins can delete any comments
CREATE POLICY "vote_comment_delete_admin" ON vote_comment
    FOR DELETE USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- =====================================================
-- 4. VOTE_COMMENT_LIKE TABLE RLS POLICIES
-- =====================================================

-- Enable RLS on vote_comment_like table
ALTER TABLE vote_comment_like ENABLE ROW LEVEL SECURITY;

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
-- 5. VOTE_COMMENT_REPORT TABLE RLS POLICIES
-- =====================================================

-- Enable RLS on vote_comment_report table
ALTER TABLE vote_comment_report ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own reports
CREATE POLICY "vote_comment_report_select_own" ON vote_comment_report
    FOR SELECT USING (auth.uid()::text = user_id::text);

-- Policy: Admins can read all reports
CREATE POLICY "vote_comment_report_select_admin" ON vote_comment_report
    FOR SELECT USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Policy: Authenticated users can create reports
CREATE POLICY "vote_comment_report_insert_auth" ON vote_comment_report
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Only admins can update reports (status changes)
CREATE POLICY "vote_comment_report_update_admin" ON vote_comment_report
    FOR UPDATE USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- =====================================================
-- 6. PUBLIC TABLES (READ-ONLY FOR REGULAR USERS)
-- =====================================================

-- Enable RLS on vote table
ALTER TABLE vote ENABLE ROW LEVEL SECURITY;

-- Policy: All users can read non-deleted votes
CREATE POLICY "vote_select_all" ON vote
    FOR SELECT USING (deleted_at IS NULL);

-- Policy: Only admins can modify votes
CREATE POLICY "vote_modify_admin" ON vote
    FOR ALL USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Enable RLS on vote_item table
ALTER TABLE vote_item ENABLE ROW LEVEL SECURITY;

-- Policy: All users can read non-deleted vote items
CREATE POLICY "vote_item_select_all" ON vote_item
    FOR SELECT USING (deleted_at IS NULL);

-- Policy: Only admins can modify vote items
CREATE POLICY "vote_item_modify_admin" ON vote_item
    FOR ALL USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Enable RLS on artist table
ALTER TABLE artist ENABLE ROW LEVEL SECURITY;

-- Policy: All users can read non-deleted artists
CREATE POLICY "artist_select_all" ON artist
    FOR SELECT USING (deleted_at IS NULL);

-- Policy: Only admins can modify artists
CREATE POLICY "artist_modify_admin" ON artist
    FOR ALL USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- Enable RLS on artist_group table
ALTER TABLE artist_group ENABLE ROW LEVEL SECURITY;

-- Policy: All users can read non-deleted artist groups
CREATE POLICY "artist_group_select_all" ON artist_group
    FOR SELECT USING (deleted_at IS NULL);

-- Policy: Only admins can modify artist groups
CREATE POLICY "artist_group_modify_admin" ON artist_group
    FOR ALL USING (
        (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
    );

-- =====================================================
-- 7. USER_BLOCKS TABLE RLS POLICIES
-- =====================================================

-- Enable RLS on user_blocks table (if exists)
-- ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own block list
-- CREATE POLICY "user_blocks_own" ON user_blocks
--     FOR ALL USING (auth.uid()::text = user_id::text);

-- Policy: Admins can read all blocks
-- CREATE POLICY "user_blocks_admin" ON user_blocks
--     FOR SELECT USING (
--         (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
--     );

-- =====================================================
-- 8. REWARD AND BONUS TABLES RLS POLICIES
-- =====================================================

-- Enable RLS on vote_share_bonus table (if exists)
-- ALTER TABLE vote_share_bonus ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own bonuses
-- CREATE POLICY "vote_share_bonus_select_own" ON vote_share_bonus
--     FOR SELECT USING (auth.uid()::text = user_id::text);

-- Policy: Admins can read all bonuses
-- CREATE POLICY "vote_share_bonus_select_admin" ON vote_share_bonus
--     FOR SELECT USING (
--         (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
--     );

-- Policy: System can insert bonuses (for automated processes)
-- CREATE POLICY "vote_share_bonus_insert_system" ON vote_share_bonus
--     FOR INSERT WITH CHECK (
--         auth.uid() IS NOT NULL
--         AND (
--             auth.uid()::text = user_id::text
--             OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = true
--         )
--     );

-- =====================================================
-- 9. HELPER FUNCTIONS FOR RLS
-- =====================================================

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT COALESCE(is_admin, false)
        FROM user_profiles
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user owns a resource
CREATE OR REPLACE FUNCTION auth.owns_resource(resource_user_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN auth.uid()::text = resource_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 10. GRANT NECESSARY PERMISSIONS
-- =====================================================

-- Grant usage on auth schema to authenticated users
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.owns_resource(TEXT) TO authenticated;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Test queries to verify RLS policies work correctly
-- Run these after applying the policies:

-- 1. Test user can only see their own vote_pick records
-- SELECT * FROM vote_pick; -- Should only return current user's votes

-- 2. Test user can see all public vote information
-- SELECT * FROM vote WHERE deleted_at IS NULL; -- Should return all active votes

-- 3. Test user can only see non-deleted comments
-- SELECT * FROM vote_comment; -- Should only return non-deleted comments

-- 4. Test admin functions (run as admin user)
-- SELECT auth.is_admin(); -- Should return true for admin users

-- =====================================================
-- NOTES
-- =====================================================

-- 1. These policies assume the user_profiles.is_admin column exists and is properly maintained
-- 2. Some table names may need to be adjusted based on actual schema
-- 3. The auth.uid() function is used to get the current authenticated user's ID
-- 4. Policies use deleted_at IS NULL to exclude soft-deleted records
-- 5. Admin users have full access to all data for management purposes
-- 6. Regular users have limited access based on ownership and public visibility rules
-- 7. Test thoroughly in a development environment before applying to production