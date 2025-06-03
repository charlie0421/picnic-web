#!/usr/bin/env node

/**
 * RLS 정책 적용 스크립트
 * 
 * 이 스크립트는 중요한 테이블들에 대해 RLS 정책을 체계적으로 적용합니다.
 * Supabase Dashboard의 SQL Editor에서 실행할 수 있는 SQL 문을 생성합니다.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * RLS 정책 적용 및 검증
 */
async function applyRLSPolicies() {
  console.log('🔐 [RLS] RLS 정책 적용 및 검증 시작...');

  // 환경 변수 확인
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ [RLS] 필요한 환경 변수가 설정되지 않았습니다:');
    console.error('- NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ 설정됨' : '❌ 없음');
    console.error('- SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✅ 설정됨' : '❌ 없음');
    console.log('\n💡 [RLS] .env 파일에 다음 변수들을 설정해주세요:');
    console.log('NEXT_PUBLIC_SUPABASE_URL=your_supabase_url');
    console.log('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
    process.exit(1);
  }

  // Service Role 클라이언트 생성
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // 현재 RLS 상태 확인
    console.log('\n🔍 [RLS] 현재 RLS 상태 확인...');
    await checkCurrentRLSStatus(supabase);

    // SQL 스크립트 파일 생성
    console.log('\n📝 [RLS] SQL 스크립트 파일 생성...');
    await generateApplicableSQL();

    // Helper 함수 확인
    console.log('\n� [RLS] Helper 함수 확인...');
    await checkHelperFunctions(supabase);

    console.log('\n✅ [RLS] RLS 정책 준비 완료!');
    console.log('\n� [RLS] 다음 단계를 따라주세요:');
    console.log('1. scripts/apply-rls-policies.sql 파일이 생성되었습니다.');
    console.log('2. Supabase Dashboard > SQL Editor로 이동하세요.');
    console.log('3. 생성된 SQL 파일의 내용을 복사하여 실행하세요.');
    console.log('4. 실행 후 이 스크립트를 다시 실행하여 적용 상태를 확인하세요.');

  } catch (error) {
    console.error('❌ [RLS] RLS 정책 처리 중 오류:', error);
    process.exit(1);
  }
}

/**
 * 현재 RLS 상태 확인
 */
async function checkCurrentRLSStatus(supabase) {
  const criticalTables = [
    'user_profiles',
    'vote_pick', 
    'vote_comment',
    'vote_comment_like',
    'vote_comment_report',
    'vote',
    'vote_item',
    'artist',
    'artist_group',
    'vote_share_bonus'
  ];

  console.log('� [RLS] 중요 테이블들의 현재 RLS 상태:');
  
  for (const tableName of criticalTables) {
    try {
      const { data, error } = await supabase
        .from('pg_tables')
        .select('tablename, rowsecurity')
        .eq('tablename', tableName)
        .single();

      if (error) {
        console.log(`   ${tableName}: ❓ 확인 불가 (${error.message})`);
      } else if (data) {
        const status = data.rowsecurity ? '✅ RLS 활성화됨' : '❌ RLS 비활성화됨';
        console.log(`   ${tableName}: ${status}`);
      } else {
        console.log(`   ${tableName}: ❓ 테이블 없음`);
      }
    } catch (err) {
      console.log(`   ${tableName}: ❓ 확인 오류 (${err.message})`);
    }
  }

  // 기존 정책 개수 확인
  try {
    const { data: policies, error: policiesError } = await supabase
      .from('pg_policies')
      .select('tablename, policyname')
      .in('tablename', criticalTables);

    if (!policiesError && policies) {
      console.log(`\n📋 [RLS] 현재 적용된 정책 개수: ${policies.length}개`);
      
      const policiesByTable = policies.reduce((acc, policy) => {
        acc[policy.tablename] = (acc[policy.tablename] || 0) + 1;
        return acc;
      }, {});

      Object.entries(policiesByTable).forEach(([table, count]) => {
        console.log(`   ${table}: ${count}개 정책`);
      });
    }
  } catch (err) {
    console.log('⚠️ [RLS] 기존 정책 조회 실패:', err.message);
  }
}

/**
 * Helper 함수 확인
 */
async function checkHelperFunctions(supabase) {
  const helperFunctions = [
    { name: 'is_admin', params: {} },
    { name: 'owns_resource', params: { resource_user_id: 'test-user' } }
  ];
  
  for (const { name, params } of helperFunctions) {
    try {
      const { data, error } = await supabase.rpc(name, params);
      
      if (error) {
        console.log(`   ${name}: ❌ 함수 없음 (${error.message})`);
      } else {
        console.log(`   ${name}: ✅ 함수 존재하고 작동함`);
      }
    } catch (err) {
      console.log(`   ${name}: ❌ 함수 테스트 실패 (${err.message})`);
    }
  }
}

/**
 * 실행 가능한 SQL 스크립트 생성
 */
async function generateApplicableSQL() {
  const sqlFilePath = path.join(__dirname, 'apply-rls-policies.sql');
  
  const sqlContent = `-- Picnic Application RLS Policies Application Script
-- Generated automatically - Execute this in Supabase SQL Editor
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

-- 2. Helper Functions
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

CREATE OR REPLACE FUNCTION auth.owns_resource(resource_user_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN auth.uid()::text = resource_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant permissions
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.owns_resource(TEXT) TO authenticated;

-- 4. USER_PROFILES policies
DROP POLICY IF EXISTS "user_profiles_select_own" ON user_profiles;
CREATE POLICY "user_profiles_select_own" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "user_profiles_select_admin" ON user_profiles;
CREATE POLICY "user_profiles_select_admin" ON user_profiles
    FOR SELECT USING (auth.is_admin());

DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;
CREATE POLICY "user_profiles_update_own" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "user_profiles_update_admin" ON user_profiles;
CREATE POLICY "user_profiles_update_admin" ON user_profiles
    FOR UPDATE USING (auth.is_admin());

DROP POLICY IF EXISTS "user_profiles_insert_own" ON user_profiles;
CREATE POLICY "user_profiles_insert_own" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 5. VOTE_PICK policies
DROP POLICY IF EXISTS "vote_pick_select_own" ON vote_pick;
CREATE POLICY "vote_pick_select_own" ON vote_pick
    FOR SELECT USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "vote_pick_select_admin" ON vote_pick;
CREATE POLICY "vote_pick_select_admin" ON vote_pick
    FOR SELECT USING (auth.is_admin());

DROP POLICY IF EXISTS "vote_pick_insert_own" ON vote_pick;
CREATE POLICY "vote_pick_insert_own" ON vote_pick
    FOR INSERT WITH CHECK (
        auth.uid()::text = user_id::text
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS "vote_pick_insert_admin" ON vote_pick;
CREATE POLICY "vote_pick_insert_admin" ON vote_pick
    FOR INSERT WITH CHECK (auth.is_admin());

DROP POLICY IF EXISTS "vote_pick_update_own" ON vote_pick;
CREATE POLICY "vote_pick_update_own" ON vote_pick
    FOR UPDATE USING (
        auth.uid()::text = user_id::text
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS "vote_pick_update_admin" ON vote_pick;
CREATE POLICY "vote_pick_update_admin" ON vote_pick
    FOR UPDATE USING (auth.is_admin());

-- 6. VOTE_COMMENT policies
DROP POLICY IF EXISTS "vote_comment_select_all" ON vote_comment;
CREATE POLICY "vote_comment_select_all" ON vote_comment
    FOR SELECT USING (
        auth.uid() IS NOT NULL 
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS "vote_comment_insert_auth" ON vote_comment;
CREATE POLICY "vote_comment_insert_auth" ON vote_comment
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "vote_comment_update_own" ON vote_comment;
CREATE POLICY "vote_comment_update_own" ON vote_comment
    FOR UPDATE USING (
        auth.uid()::text = user_id::text
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS "vote_comment_update_admin" ON vote_comment;
CREATE POLICY "vote_comment_update_admin" ON vote_comment
    FOR UPDATE USING (auth.is_admin());

-- 7. PUBLIC TABLES (READ-ONLY for regular users)
DROP POLICY IF EXISTS "vote_select_all" ON vote;
CREATE POLICY "vote_select_all" ON vote
    FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "vote_modify_admin" ON vote;
CREATE POLICY "vote_modify_admin" ON vote
    FOR ALL USING (auth.is_admin());

DROP POLICY IF EXISTS "vote_item_select_all" ON vote_item;
CREATE POLICY "vote_item_select_all" ON vote_item
    FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "vote_item_modify_admin" ON vote_item;
CREATE POLICY "vote_item_modify_admin" ON vote_item
    FOR ALL USING (auth.is_admin());

DROP POLICY IF EXISTS "artist_select_all" ON artist;
CREATE POLICY "artist_select_all" ON artist
    FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "artist_modify_admin" ON artist;
CREATE POLICY "artist_modify_admin" ON artist
    FOR ALL USING (auth.is_admin());

DROP POLICY IF EXISTS "artist_group_select_all" ON artist_group;
CREATE POLICY "artist_group_select_all" ON artist_group
    FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "artist_group_modify_admin" ON artist_group;
CREATE POLICY "artist_group_modify_admin" ON artist_group
    FOR ALL USING (auth.is_admin());

-- 8. VOTE_COMMENT_LIKE policies
DROP POLICY IF EXISTS "vote_comment_like_select_all" ON vote_comment_like;
CREATE POLICY "vote_comment_like_select_all" ON vote_comment_like
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "vote_comment_like_insert_own" ON vote_comment_like;
CREATE POLICY "vote_comment_like_insert_own" ON vote_comment_like
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "vote_comment_like_delete_own" ON vote_comment_like;
CREATE POLICY "vote_comment_like_delete_own" ON vote_comment_like
    FOR DELETE USING (auth.uid()::text = user_id::text);

-- 9. VOTE_COMMENT_REPORT policies
DROP POLICY IF EXISTS "vote_comment_report_select_own" ON vote_comment_report;
CREATE POLICY "vote_comment_report_select_own" ON vote_comment_report
    FOR SELECT USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "vote_comment_report_select_admin" ON vote_comment_report;
CREATE POLICY "vote_comment_report_select_admin" ON vote_comment_report
    FOR SELECT USING (auth.is_admin());

DROP POLICY IF EXISTS "vote_comment_report_insert_auth" ON vote_comment_report;
CREATE POLICY "vote_comment_report_insert_auth" ON vote_comment_report
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Completed! 
-- Please verify the policies were applied correctly by running:
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables 
-- WHERE tablename IN ('user_profiles', 'vote_pick', 'vote_comment', 'vote', 'vote_item', 'artist', 'artist_group');
`;

  fs.writeFileSync(sqlFilePath, sqlContent, 'utf8');
  console.log(`📁 [RLS] SQL 스크립트 파일 생성됨: ${sqlFilePath}`);
}

/**
 * 적용 후 검증 함수
 */
async function verifyRLSApplication() {
  console.log('🔍 [RLS] RLS 정책 적용 검증 시작...');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ [RLS] 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  await checkCurrentRLSStatus(supabase);
  await checkHelperFunctions(supabase);

  console.log('\n✅ [RLS] RLS 정책 검증 완료!');
}

// 명령행 인수 처리
const args = process.argv.slice(2);
const command = args[0];

if (command === 'verify') {
  verifyRLSApplication()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ [RLS] 검증 실패:', error);
      process.exit(1);
    });
} else if (require.main === module) {
  applyRLSPolicies()
    .then(() => {
      console.log('\n💡 [RLS] 팁: 정책 적용 후 검증하려면 다음 명령어를 실행하세요:');
      console.log('node scripts/apply-rls-policies.js verify');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ [RLS] 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { applyRLSPolicies, verifyRLSApplication };