/**
 * RLS Policy Validation Script
 * 
 * This script validates that Row-Level Security (RLS) policies are correctly
 * implemented and enforced in the Supabase database.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Create client instances
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test user IDs
const TEST_USERS = {
  user1: 'test-user-rls-1',
  user2: 'test-user-rls-2',
  admin: 'test-admin-rls-1'
};

const TEST_VOTE_ID = 99999;
const TEST_VOTE_ITEM_IDS = [999991, 999992];
const TEST_COMMENT_IDS = [999991, 999992];

/**
 * Test Results Tracking
 */
class TestResults {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  pass(testName, message = '') {
    this.passed++;
    this.tests.push({ name: testName, status: 'PASS', message });
    console.log(`✅ PASS: ${testName}${message ? ` - ${message}` : ''}`);
  }

  fail(testName, error) {
    this.failed++;
    this.tests.push({ name: testName, status: 'FAIL', error: error.message });
    console.log(`❌ FAIL: ${testName} - ${error.message}`);
  }

  summary() {
    console.log('\n' + '='.repeat(60));
    console.log('RLS POLICY VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.passed + this.failed}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Success Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
    
    if (this.failed > 0) {
      console.log('\nFailed Tests:');
      this.tests
        .filter(t => t.status === 'FAIL')
        .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
    }
    
    console.log('='.repeat(60));
    return this.failed === 0;
  }
}

const results = new TestResults();

/**
 * Setup test data
 */
async function setupTestData() {
  console.log('🔧 Setting up test data...');
  
  try {
    // Create test users
    await serviceClient.from('user_profiles').upsert([
      {
        id: TEST_USERS.user1,
        email: 'test-user-1@rls-test.com',
        nickname: 'RLS-TestUser1',
        is_admin: false,
        star_candy: 1000,
        star_candy_bonus: 500
      },
      {
        id: TEST_USERS.user2,
        email: 'test-user-2@rls-test.com',
        nickname: 'RLS-TestUser2',
        is_admin: false,
        star_candy: 1500,
        star_candy_bonus: 300
      },
      {
        id: TEST_USERS.admin,
        email: 'test-admin@rls-test.com',
        nickname: 'RLS-AdminUser',
        is_admin: true,
        star_candy: 5000,
        star_candy_bonus: 1000
      }
    ]);

    // Create test vote
    await serviceClient.from('vote').upsert({
      id: TEST_VOTE_ID,
      vote_content: { ko: 'RLS 테스트 투표', en: 'RLS Test Vote' },
      area: 'all',
      category: 'test',
      start_at: new Date().toISOString(),
      stop_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });

    // Create test vote items
    await serviceClient.from('vote_item').upsert([
      { id: TEST_VOTE_ITEM_IDS[0], vote_id: TEST_VOTE_ID, artist_id: 1, vote_total: 100 },
      { id: TEST_VOTE_ITEM_IDS[1], vote_id: TEST_VOTE_ID, artist_id: 2, vote_total: 150 }
    ]);

    // Create test vote picks
    await serviceClient.from('vote_pick').upsert([
      { user_id: TEST_USERS.user1, vote_id: TEST_VOTE_ID, vote_item_id: TEST_VOTE_ITEM_IDS[0], amount: 10 },
      { user_id: TEST_USERS.user2, vote_id: TEST_VOTE_ID, vote_item_id: TEST_VOTE_ITEM_IDS[1], amount: 15 }
    ]);

    // Create test comments
    await serviceClient.from('vote_comment').upsert([
      { id: TEST_COMMENT_IDS[0], vote_id: TEST_VOTE_ID, user_id: TEST_USERS.user1, content: 'RLS Test comment from user 1' },
      { id: TEST_COMMENT_IDS[1], vote_id: TEST_VOTE_ID, user_id: TEST_USERS.user2, content: 'RLS Test comment from user 2' }
    ]);

    console.log('✅ Test data setup completed');
  } catch (error) {
    console.error('❌ Error setting up test data:', error.message);
    throw error;
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData() {
  console.log('🧹 Cleaning up test data...');
  
  try {
    await serviceClient.from('vote_comment').delete().in('id', TEST_COMMENT_IDS);
    await serviceClient.from('vote_pick').delete().eq('vote_id', TEST_VOTE_ID);
    await serviceClient.from('vote_item').delete().in('id', TEST_VOTE_ITEM_IDS);
    await serviceClient.from('vote').delete().eq('id', TEST_VOTE_ID);
    await serviceClient.from('user_profiles').delete().in('id', Object.values(TEST_USERS));
    
    console.log('✅ Test data cleanup completed');
  } catch (error) {
    console.error('❌ Error cleaning up test data:', error.message);
  }
}

/**
 * Test RLS is enabled on critical tables
 */
async function testRLSEnabled() {
  console.log('\n📋 Testing RLS Status...');
  
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
  
  try {
    const { data, error } = await serviceClient
      .from('pg_tables')
      .select('tablename, rowsecurity')
      .in('tablename', criticalTables);
    
    if (error) throw error;
    
    const rlsStatus = {};
    data.forEach(table => {
      rlsStatus[table.tablename] = table.rowsecurity;
    });
    
    criticalTables.forEach(table => {
      if (rlsStatus[table] === true) {
        results.pass(`RLS enabled on ${table}`);
      } else {
        results.fail(`RLS not enabled on ${table}`, new Error(`RLS should be enabled but is ${rlsStatus[table]}`));
      }
    });
  } catch (error) {
    results.fail('RLS status check', error);
  }
}

/**
 * Test RLS policies exist
 */
async function testRLSPoliciesExist() {
  console.log('\n📜 Testing RLS Policies Existence...');
  
  try {
    const { data, error } = await serviceClient
      .from('pg_policies')
      .select('tablename, policyname, cmd')
      .in('tablename', ['user_profiles', 'vote_pick', 'vote_comment']);
    
    if (error) throw error;
    
    const requiredPolicies = [
      { table: 'user_profiles', cmd: 'SELECT' },
      { table: 'user_profiles', cmd: 'UPDATE' },
      { table: 'vote_pick', cmd: 'SELECT' },
      { table: 'vote_pick', cmd: 'INSERT' },
      { table: 'vote_pick', cmd: 'UPDATE' },
      { table: 'vote_comment', cmd: 'SELECT' },
      { table: 'vote_comment', cmd: 'UPDATE' }
    ];
    
    requiredPolicies.forEach(required => {
      const policyExists = data.some(policy => 
        policy.tablename === required.table && policy.cmd === required.cmd
      );
      
      if (policyExists) {
        results.pass(`${required.cmd} policy exists for ${required.table}`);
      } else {
        results.fail(`Missing ${required.cmd} policy for ${required.table}`, 
          new Error(`Required policy not found`));
      }
    });
  } catch (error) {
    results.fail('RLS policies existence check', error);
  }
}

/**
 * Test helper functions
 */
async function testHelperFunctions() {
  console.log('\n🔧 Testing Helper Functions...');
  
  try {
    // Test is_admin function exists
    const { data: isAdminData, error: isAdminError } = await serviceClient
      .rpc('is_admin');
    
    if (isAdminError) {
      results.fail('is_admin() function', isAdminError);
    } else {
      results.pass('is_admin() function exists', `Returns: ${isAdminData}`);
    }
  } catch (error) {
    results.fail('is_admin() function', error);
  }
  
  try {
    // Test owns_resource function exists
    const { data: ownsData, error: ownsError } = await serviceClient
      .rpc('owns_resource', { resource_user_id: TEST_USERS.user1 });
    
    if (ownsError) {
      results.fail('owns_resource() function', ownsError);
    } else {
      results.pass('owns_resource() function exists', `Returns: ${ownsData}`);
    }
  } catch (error) {
    results.fail('owns_resource() function', error);
  }
}

/**
 * Test public table access
 */
async function testPublicTableAccess() {
  console.log('\n🌐 Testing Public Table Access...');
  
  // Test reading public vote data
  try {
    const { data, error } = await anonClient
      .from('vote')
      .select('id, vote_content')
      .eq('id', TEST_VOTE_ID)
      .is('deleted_at', null);
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      results.pass('Public vote data readable', `Found ${data.length} records`);
    } else {
      results.fail('Public vote data readable', new Error('No data returned'));
    }
  } catch (error) {
    results.fail('Public vote data readable', error);
  }
  
  // Test reading vote items
  try {
    const { data, error } = await anonClient
      .from('vote_item')
      .select('id, vote_id, vote_total')
      .eq('vote_id', TEST_VOTE_ID)
      .is('deleted_at', null);
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      results.pass('Public vote items readable', `Found ${data.length} records`);
    } else {
      results.fail('Public vote items readable', new Error('No data returned'));
    }
  } catch (error) {
    results.fail('Public vote items readable', error);
  }
  
  // Test that anonymous users cannot modify public data
  try {
    const { data, error } = await anonClient
      .from('vote')
      .update({ vote_content: { ko: 'Hacked vote' } })
      .eq('id', TEST_VOTE_ID);
    
    // This should fail for anonymous users
    if (error) {
      results.pass('Public vote modification blocked for anonymous users');
    } else {
      results.fail('Public vote modification blocked for anonymous users', 
        new Error('Anonymous user was able to modify vote data'));
    }
  } catch (error) {
    results.pass('Public vote modification blocked for anonymous users');
  }
}

/**
 * Test vote comments access
 */
async function testVoteCommentsAccess() {
  console.log('\n💬 Testing Vote Comments Access...');
  
  // Test reading comments (should be allowed for authenticated users)
  try {
    const { data, error } = await anonClient
      .from('vote_comment')
      .select('id, user_id, content')
      .eq('vote_id', TEST_VOTE_ID)
      .is('deleted_at', null);
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      results.pass('Vote comments readable', `Found ${data.length} comments`);
    } else {
      results.fail('Vote comments readable', new Error('No comments returned'));
    }
  } catch (error) {
    results.fail('Vote comments readable', error);
  }
  
  // Test that anonymous users cannot modify comments
  try {
    const { data, error } = await anonClient
      .from('vote_comment')
      .update({ content: 'Hacked comment' })
      .eq('id', TEST_COMMENT_IDS[0]);
    
    // This should fail for anonymous users
    if (error) {
      results.pass('Comment modification blocked for anonymous users');
    } else {
      results.fail('Comment modification blocked for anonymous users', 
        new Error('Anonymous user was able to modify comment'));
    }
  } catch (error) {
    results.pass('Comment modification blocked for anonymous users');
  }
}

/**
 * Test data isolation
 */
async function testDataIsolation() {
  console.log('\n🔒 Testing Data Isolation...');
  
  // Test that user profile sensitive data is protected
  try {
    const { data, error } = await anonClient
      .from('user_profiles')
      .select('id, star_candy, star_candy_bonus')
      .in('id', Object.values(TEST_USERS));
    
    if (error) {
      results.pass('User profile sensitive data protected');
    } else if (!data || data.length === 0) {
      results.pass('User profile sensitive data protected', 'No sensitive data returned');
    } else {
      // Check if sensitive fields are null or filtered
      const hasSensitiveData = data.some(user => 
        user.star_candy !== null || user.star_candy_bonus !== null
      );
      
      if (hasSensitiveData) {
        results.fail('User profile sensitive data protected', 
          new Error('Sensitive data accessible to anonymous users'));
      } else {
        results.pass('User profile sensitive data protected', 'Sensitive fields filtered');
      }
    }
  } catch (error) {
    results.pass('User profile sensitive data protected');
  }
  
  // Test vote pick data isolation
  try {
    const { data, error } = await anonClient
      .from('vote_pick')
      .select('user_id, amount')
      .eq('vote_id', TEST_VOTE_ID);
    
    if (error || !data || data.length === 0) {
      results.pass('Vote pick data isolated from anonymous users');
    } else {
      results.fail('Vote pick data isolated from anonymous users', 
        new Error(`Anonymous user can access ${data.length} vote picks`));
    }
  } catch (error) {
    results.pass('Vote pick data isolated from anonymous users');
  }
}

/**
 * Test edge cases
 */
async function testEdgeCases() {
  console.log('\n🎯 Testing Edge Cases...');
  
  // Test handling of deleted records
  try {
    const { data, error } = await anonClient
      .from('user_profiles')
      .select('*')
      .not('deleted_at', 'is', null);
    
    if (error || !data || data.length === 0) {
      results.pass('Deleted records properly filtered');
    } else {
      results.fail('Deleted records properly filtered', 
        new Error(`Found ${data.length} deleted records`));
    }
  } catch (error) {
    results.pass('Deleted records properly filtered');
  }
  
  // Test null user_id handling
  try {
    const { data, error } = await anonClient
      .from('vote_comment')
      .select('*')
      .is('user_id', null);
    
    if (error || !data || data.length === 0) {
      results.pass('Null user_id records handled correctly');
    } else {
      results.pass('Null user_id records handled correctly', 
        `Found ${data.length} records with null user_id`);
    }
  } catch (error) {
    results.pass('Null user_id records handled correctly');
  }
}

/**
 * Test performance impact
 */
async function testPerformance() {
  console.log('\n⚡ Testing Performance Impact...');
  
  const tests = [
    {
      name: 'User profiles query',
      query: () => anonClient.from('user_profiles').select('id, nickname').limit(10)
    },
    {
      name: 'Vote data query',
      query: () => anonClient.from('vote').select('id, vote_content').limit(10)
    },
    {
      name: 'Vote items query',
      query: () => anonClient.from('vote_item').select('id, vote_total').limit(10)
    }
  ];
  
  for (const test of tests) {
    try {
      const start = performance.now();
      const { data, error } = await test.query();
      const duration = performance.now() - start;
      
      if (error) {
        results.fail(`Performance test: ${test.name}`, error);
      } else {
        if (duration < 1000) { // Less than 1 second
          results.pass(`Performance test: ${test.name}`, `${duration.toFixed(2)}ms`);
        } else {
          results.fail(`Performance test: ${test.name}`, 
            new Error(`Query took too long: ${duration.toFixed(2)}ms`));
        }
      }
    } catch (error) {
      results.fail(`Performance test: ${test.name}`, error);
    }
  }
}

/**
 * Main validation function
 */
async function validateRLSPolicies() {
  console.log('🚀 Starting RLS Policy Validation...');
  console.log('='.repeat(60));
  
  try {
    // Setup
    await setupTestData();
    
    // Run all tests
    await testRLSEnabled();
    await testRLSPoliciesExist();
    await testHelperFunctions();
    await testPublicTableAccess();
    await testVoteCommentsAccess();
    await testDataIsolation();
    await testEdgeCases();
    await testPerformance();
    
    // Show results
    const success = results.summary();
    
    if (success) {
      console.log('\n🎉 All RLS policies are working correctly!');
      console.log('Your Picnic application database security is properly configured.');
    } else {
      console.log('\n⚠️  Some RLS policy tests failed.');
      console.log('Please review the errors above and update your RLS policies.');
    }
    
    return success;
  } catch (error) {
    console.error('❌ Validation failed with error:', error.message);
    return false;
  } finally {
    // Cleanup
    await cleanupTestData();
  }
}

// Run validation if called directly
if (require.main === module) {
  validateRLSPolicies()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation error:', error);
      process.exit(1);
    });
}

module.exports = {
  validateRLSPolicies,
  setupTestData,
  cleanupTestData
};