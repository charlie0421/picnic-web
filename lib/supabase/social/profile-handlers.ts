import { SupabaseClient, User } from "@supabase/supabase-js";
import { logError } from '@/utils/log-error';
import { Database } from "@/types/supabase";

/**
 * 소셜 로그인 후 프로필 처리.
 *
 * ## 하지 않는 것 — 기존 프로필은 갱신하지 않는다
 *
 * `user_profiles.nickname` 과 `avatar_url` 은 **사용자 소유 데이터**다. 앱에서 직접
 * 바꾼다 — 닉네임은 `update-nickname` Edge Function, 아바타는 `avatars` 스토리지
 * 업로드 후 `avatar_url` 갱신(picnic_lib `my_profile.dart`). 로그인할 때마다 소셜
 * 계정 값으로 덮으면 사용자가 설정한 사진과 이름이 사라진다.
 *
 * ## 하는 것 — 프로필이 없을 때만 만든다
 *
 * 정상 경로에서는 DB 트리거 `handle_new_user()` 가 auth.users 삽입 시 프로필을
 * 만든다. 여기 insert 는 그게 실패했을 때를 위한 폴백이다.
 *
 * ## 제거된 죽은 경로 (2026-08-18)
 *
 * 이전 구현은 `fetch("/api/auth/google")` 로 자기 API 를 호출해 프로필을 받아
 * 갱신하려 했으나 실제로는 한 번도 동작하지 않았다:
 *
 * 1. 이 코드는 **서버**에서 돈다(`app/api/auth/exchange-code/route.ts` → `handleCallback`).
 *    상대 URL fetch 는 Node 에서 `Failed to parse URL` 로 throw 되고 catch 가 삼켰다.
 * 2. Google 은 애초에 도달하지 못했다 — `exchange-code` 가 `id_token` 을
 *    **apple 일 때만** params 에 담는다.
 * 3. `user_profiles` 에 없는 `provider`/`provider_id` 컬럼을 써서, 설령 실행됐어도
 *    PostgREST 가 `42703` 을 반환했다.
 * 4. `localStorage` 를 참조하는 분기도 있었다 — 서버에는 존재하지 않아 항상 건너뛴다.
 *
 * 소셜 프로필 갱신이 필요해지면 이 파일이 아니라 **사용자가 명시적으로 실행하는
 * 동작**으로 만들어야 한다. 참고로 Apple 은 `user_metadata` 에 아바타를 주지 않고
 * 이름도 최초 인증 때만 준다(실측: apple 26명 전원 `avatar_url` 없음).
 */

/** 소셜 프로필에서 얻을 수 있는 최선의 표시 이름. */
function resolveNickname(user: User, fallbackName?: string): string {
  return (
    fallbackName ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "User"
  );
}

/** 프로필 생성 폴백. 트리거가 이미 만들었으면 호출되지 않는다. */
async function insertProfileIfMissing(
  supabase: SupabaseClient<Database>,
  user: User,
  logPrefix: string,
  fields: { nickname: string; avatarUrl: string | null },
): Promise<void> {
  const { data: existingProfile, error: checkError } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (checkError) {
    logError(`${logPrefix} 기존 프로필 확인 오류:`, checkError);
    return;
  }

  // 이미 있으면 아무것도 하지 않는다 — 위 주석의 "갱신하지 않는다" 참조.
  if (existingProfile) return;

  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("user_profiles").insert({
    id: user.id,
    nickname: fields.nickname,
    email: user.email,
    avatar_url: fields.avatarUrl,
    created_at: now,
    updated_at: now,
  });

  if (insertError) {
    logError(`${logPrefix} 프로필 생성 실패:`, insertError);
  }
}

/**
 * Google 로그인 후 프로필 처리.
 *
 * NOTE: Receives `User` directly (not `Session`). The full session is not required —
 * the handler only needs the authenticated user record. See callback-handler.ts for
 * the rationale (avoids fabricating placeholder sessions on the cookie-only path).
 */
export async function handleGoogleProfile(
  supabase: SupabaseClient<Database>,
  user: User,
  _params?: Record<string, string>,
): Promise<void> {
  try {
    await insertProfileIfMissing(supabase, user, "❌ [Google]", {
      nickname: resolveNickname(user),
      // Google 은 user_metadata 에 avatar_url·picture 를 준다 (실측 확인).
      // 생성 시점에만 쓰므로 사용자가 설정한 값을 덮지 않는다.
      avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    });
  } catch (error) {
    // 프로필 처리 실패해도 로그인 자체는 성공으로 처리한다.
    logError("Google 프로필 처리 오류:", error);
  }
}

/**
 * Apple 로그인 후 프로필 처리.
 *
 * NOTE: Receives `User` directly (not `Session`). See `handleGoogleProfile` above.
 */
export async function handleAppleProfile(
  supabase: SupabaseClient<Database>,
  user: User,
  params?: Record<string, string>,
): Promise<void> {
  try {
    // Apple 은 최초 인증 때만 이름을 준다. 그때는 콜백 URL 의 user 파라미터로 온다.
    let firstAuthName: string | undefined;
    if (params?.user) {
      try {
        const parsed = JSON.parse(decodeURIComponent(params.user)) as {
          name?: { firstName?: string; lastName?: string };
        };
        firstAuthName =
          [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ") ||
          undefined;
      } catch (error) {
        logError("🍎 [Apple] 사용자 데이터 파싱 오류:", error);
      }
    }

    await insertProfileIfMissing(supabase, user, "❌ [Apple]", {
      nickname: resolveNickname(user, firstAuthName),
      // Apple 은 프로필 이미지를 제공하지 않는다.
      avatarUrl: null,
    });
  } catch (error) {
    logError("🍎 [Apple] 프로필 처리 오류:", error);
  }
}
