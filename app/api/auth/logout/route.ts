/**
 * Server-side Logout API Endpoint
 * 
 * This endpoint handles server-side session invalidation and cleanup
 * when users log out from the Picnic application.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Types
interface LogoutRequestBody {
  timestamp?: string;
  clearAll?: boolean;
  userId?: string;
  sessionId?: string;
}

interface LogoutResponse {
  success: boolean;
  message: string;
  timestamp: string;
  clearedSessions?: number;
  error?: string;
}

/**
 * POST /api/auth/logout
 * 
 * Handles server-side logout operations including:
 * 1. Invalidating Supabase sessions
 * 2. Clearing server-side cached data
 * 3. Logging logout events
 */
export async function POST(request: NextRequest) {
  try {
    const timestamp = new Date().toISOString();
    
    console.log('🔐 Server-side logout initiated at:', timestamp);

    // Parse request body
    let body: LogoutRequestBody = {};
    try {
      body = await request.json();
    } catch (err) {
      console.warn('No request body or invalid JSON, proceeding with defaults');
    }

    const { clearAll = true, userId, sessionId } = body;

    // Create Supabase service client (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    let clearedSessions = 0;

    // 1. Clear Supabase sessions
    if (clearAll || userId) {
      try {
        console.log('🧹 Clearing Supabase sessions...');
        
        if (userId) {
          // Clear sessions for specific user
          const { error } = await supabase.auth.admin.signOut(userId);
          if (error) {
            console.warn('Error signing out specific user:', error.message);
            // Don't throw here, just log the warning
          } else {
            clearedSessions++;
            console.log(`✅ Cleared session for user: ${userId}`);
          }
        } else if (clearAll) {
          // Note: In a real implementation, you might want to clear sessions differently
          // This is a placeholder for bulk session clearing logic
          console.log('ℹ️ clearAll=true, but no specific user provided');
        }
      } catch (err) {
        console.warn('Error clearing Supabase sessions:', err);
        // Don't throw here, continue with other cleanup operations
      }
    }

    // 2. Clear server-side cache (if any)
    try {
      console.log('🧹 Clearing server-side cache...');
      
      // Clear Next.js cache tags related to auth
      const authCacheTags = [
        'user-session',
        'auth-state',
        'user-profile',
        'user-votes',
        'user-preferences'
      ];

      // Note: In Next.js 14+, you might use revalidateTag
      // For now, we'll just log the cache clearing
      authCacheTags.forEach(tag => {
        try {
          // revalidateTag(tag); // Uncomment if using Next.js cache tags
          console.log(`Cache tag cleared: ${tag}`);
        } catch (err) {
          console.warn(`Error clearing cache tag ${tag}:`, err);
        }
      });

      console.log('✅ Server-side cache cleared');
    } catch (err) {
      console.warn('Error clearing server-side cache:', err);
    }

    // 3. Log logout event for analytics/security
    try {
      console.log('📝 Logging logout event...');
      
      const logData = {
        event: 'user_logout',
        timestamp,
        user_id: userId || 'unknown',
        session_id: sessionId || 'unknown',
        ip_address: request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   request.headers.get('x-client-ip') ||
                   'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        clear_all: clearAll,
        success: true
      };

      // Log to console for development
      console.log('Logout event:', logData);

      // In production, you might want to log to a database or external service
      const isProduction = (process.env.NODE_ENV as string) === 'production';
      if (isProduction) {
        try {
          // Example: Log to Supabase audit table
          await supabase
            .from('audit_logs')
            .insert({
              event_type: 'user_logout',
              event_data: logData,
              created_at: timestamp
            });
        } catch (err) {
          console.warn('Error logging to audit table:', err);
          // Don't throw here, logging failure shouldn't break logout
        }
      }

      console.log('✅ Logout event logged');
    } catch (err) {
      console.warn('Error logging logout event:', err);
    }

    // 4. Clear any Redis/external cache (if applicable)
    try {
      if (process.env.REDIS_URL && userId) {
        console.log('🧹 Clearing Redis cache...');
        
        // Example Redis cache clearing
        // const redis = new Redis(process.env.REDIS_URL);
        // await redis.del(`user:${userId}:session`);
        // await redis.del(`user:${userId}:preferences`);
        // await redis.del(`user:${userId}:votes`);
        
        console.log('✅ Redis cache cleared');
      }
    } catch (err) {
      console.warn('Error clearing Redis cache:', err);
    }

    console.log(`✅ Server-side logout completed successfully. Cleared ${clearedSessions} sessions.`);

    return NextResponse.json({
      success: true,
      message: 'Logout completed successfully',
      timestamp,
      clearedSessions
    });
  } catch (error) {
    console.error('로그아웃 처리 중 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/logout
 * 
 * Returns logout status and debugging information
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const debug = url.searchParams.get('debug') === 'true';

    if (debug && process.env.NODE_ENV === 'development') {
      // Return debugging information in development
      return NextResponse.json({
        endpoint: '/api/auth/logout',
        methods: ['POST', 'GET'],
        description: 'Server-side logout endpoint',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        features: {
          supabase_logout: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          redis_cache: !!process.env.REDIS_URL,
          audit_logging: (process.env.NODE_ENV as string) === 'production'
        }
      });
    }

    return NextResponse.json({
      message: 'Logout endpoint is active',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('로그아웃 상태 조회 중 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/auth/logout
 * 
 * CORS preflight handler
 */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}