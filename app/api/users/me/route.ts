import { NextResponse, NextRequest } from 'next/server';
import {
  createSupabaseServerClient,
  getServerUser,
} from '@/lib/supabase/server';
import { SupabasePostgrestError, SupabaseAuthError } from '@/lib/supabase/error';

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      throw new SupabaseAuthError('Authentication required.');
    }

    const supabase = await createSupabaseServerClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      throw new SupabasePostgrestError(error.message, {
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('[/api/users/me] error:', error);
    let status = 500;
    if (error instanceof SupabaseAuthError) {
      status = 401;
    } else if (error instanceof SupabasePostgrestError) {
      status = 400;
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      throw new SupabaseAuthError('Authentication required.');
    }

    const supabase = await createSupabaseServerClient();
    const body = await request.json();

    // 업데이트 가능한 필드만 허용 (Whitelist)
    const allowedUpdates: { [key: string]: any } = {};
    if (body.nickname !== undefined) {
      allowedUpdates.nickname = body.nickname;
    }
    if (body.avatar_url !== undefined) {
      allowedUpdates.avatar_url = body.avatar_url;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No updatable fields provided.' },
        { status: 400 }
      );
    }

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(allowedUpdates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      throw new SupabasePostgrestError(error.message, {
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }

    return NextResponse.json(updatedProfile);
  } catch (error) {
    console.error('[/api/users/me PATCH] error:', error);
    let status = 500;
    if (error instanceof SupabaseAuthError) {
      status = 401;
    } else if (error instanceof SupabasePostgrestError) {
      status = 400;
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status }
    );
  }
} 