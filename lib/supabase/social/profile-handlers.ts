import { SupabaseClient, User } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

/**
 * Google 로그인 후 프로필 정보 처리
 *
 * NOTE: Receives `User` directly (not `Session`). The full session is not required —
 * the handler only needs the authenticated user record. See callback-handler.ts for
 * the rationale (avoids fabricating placeholder sessions on the cookie-only path).
 */
export async function handleGoogleProfile(
  supabase: SupabaseClient<Database>,
  user: User,
  params?: Record<string, string>,
): Promise<void> {
  try {
    // 사용자 프로필이 이미 존재하는지 확인
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // ID 토큰이 있는 경우 (콜백에서 제공)
    if (params?.id_token) {
      try {
        // API를 호출하여 ID 토큰을 검증하고 프로필 정보 가져오기
        const response = await fetch("/api/auth/google", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            idToken: params.id_token,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.profile) {
            // 사용자 프로필이 없으면 생성, 있으면 업데이트
            if (!existingProfile) {
              const insertData = {
                id: user.id,
                nickname: data.profile.name || user.email?.split("@")[0] || "User",
                avatar_url: data.profile.avatar || null,
                email: data.profile.email || user.email,
                provider: "google",
                provider_id: data.profile.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };

              const { error: insertError } = await supabase.from("user_profiles").insert(insertData);

              if (insertError) {
                console.error('❌ [Google] 프로필 생성 실패:', insertError);
              }
            } else {
              // 필요한 필드만 업데이트
              await supabase.from("user_profiles").update({
                avatar_url: data.profile.avatar || existingProfile.avatar_url,
                provider: "google",
                provider_id: data.profile.id,
                updated_at: new Date().toISOString(),
              }).eq("id", user.id);
            }
          }
        }
      } catch (error) {
        console.error("Google 프로필 처리 오류:", error);
        // 오류 발생 시 기본 프로필만 사용
      }
    }

    // 최소한의 프로필 정보가 없는 경우 기본 프로필 생성
    if (!existingProfile) {
      const basicProfileData = {
        id: user.id,
        nickname: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        email: user.email,
        avatar_url: null, // JWT 토큰 이미지는 사용하지 않음
        provider: "google",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: basicInsertError } = await supabase.from("user_profiles").insert(basicProfileData);

      if (basicInsertError) {
        console.error('❌ [Google] 기본 프로필 생성 실패:', basicInsertError);
      }
    }
  } catch (error) {
    console.error("Google 프로필 업데이트 오류:", error);
    // 프로필 업데이트 실패해도 로그인 자체는 성공으로 처리
  }
}

/**
 * Apple 로그인 후 프로필 정보 처리
 *
 * NOTE: Receives `User` directly (not `Session`). See `handleGoogleProfile` above.
 */
export async function handleAppleProfile(
  supabase: SupabaseClient<Database>,
  user: User,
  params?: Record<string, string>,
): Promise<void> {
  try {
    // 사용자 프로필이 이미 존재하는지 확인
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      // PGRST116 = 데이터 없음 (정상), 다른 에러는 로깅
      console.error('🍎 [Apple Profile] 기존 프로필 확인 오류:', profileCheckError);
    }

    // Apple은 첫 로그인 시에만 name과 email 정보를 제공합니다.
    // user 정보가 URL 파라미터로 제공된 경우 (첫 로그인)
    let userObject: { name?: { firstName?: string; lastName?: string }; email?: string } | null = null;

    if (params?.user) {
      try {
        userObject = JSON.parse(decodeURIComponent(params.user));

        // localStorage에 저장 (향후 사용)
        if (typeof localStorage !== "undefined" && userObject) {
          localStorage.setItem(
            "apple_user_name",
            JSON.stringify(userObject.name),
          );
          localStorage.setItem(
            "apple_user_email",
            userObject.email || user.email || "",
          );
        }
      } catch (error) {
        console.error("🍎 [Apple Profile] 사용자 데이터 파싱 오류:", error);
      }
    }

    // ID 토큰이 있는 경우 (API 검증 시도)
    if (params?.id_token) {
      try {
        // API를 호출하여 ID 토큰을 검증하고 프로필 정보 가져오기
        const response = await fetch("/api/auth/apple", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id_token: params.id_token,
            user: userObject,
          }),
        });

        if (response.ok) {
          const data = await response.json();

          if (data.success && data.profile) {
            // 사용자 프로필이 없으면 생성, 있으면 업데이트
            if (!existingProfile) {
              const appleInsertData = {
                id: user.id,
                nickname: data.profile.name || userObject?.name?.firstName || user.email?.split("@")[0] || "User",
                avatar_url: null, // Apple은 프로필 이미지를 제공하지 않음
                email: data.profile.email || user.email,
                provider: "apple",
                provider_id: data.profile.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };

              const { error: appleInsertError } = await supabase
                .from("user_profiles")
                .insert(appleInsertData);

              if (appleInsertError) {
                console.error('❌ [Apple Profile] 프로필 생성 실패:', appleInsertError);
              } else {
                return; // 성공적으로 생성했으므로 함수 종료
              }
            } else {
              // 기존 프로필 업데이트
              const { error: updateError } = await supabase
                .from("user_profiles")
                .update({
                  provider: "apple",
                  provider_id: data.profile.id,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", user.id);

              if (updateError) {
                console.error('❌ [Apple Profile] 프로필 업데이트 실패:', updateError);
              } else {
                return; // 성공적으로 업데이트했으므로 함수 종료
              }
            }
          }
        }
      } catch (error) {
        console.error("🍎 [Apple Profile] API 호출 오류:", error);
        // 오류 발생 시 기본 프로필 처리로 진행
      }
    }

    // API 검증 실패 또는 ID 토큰 없음 → 기본 프로필 처리
    if (!existingProfile) {
      // localStorage에서 이전에 저장한 정보 사용
      let name = "";
      if (typeof localStorage !== "undefined") {
        try {
          const savedName = localStorage.getItem("apple_user_name");
          if (savedName) {
            const parsedName = JSON.parse(savedName);
            name = [parsedName.firstName, parsedName.lastName].filter(Boolean).join(" ");
          }
        } catch (e) {
          console.error("🍎 [Apple Profile] 저장된 이름 파싱 오류:", e);
        }
      }

      // 기본 프로필 데이터 생성
      const appleBasicData = {
        id: user.id,
        nickname: name ||
                 userObject?.name?.firstName ||
                 user.user_metadata?.name ||
                 user.user_metadata?.full_name ||
                 user.email?.split("@")[0] ||
                 "User",
        email: user.email,
        avatar_url: null, // Apple은 프로필 이미지 제공 안함
        provider: "apple",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: appleBasicError } = await supabase
        .from("user_profiles")
        .insert(appleBasicData);

      if (appleBasicError) {
        console.error('❌ [Apple Profile] 기본 프로필 생성 실패:', appleBasicError);
      }
    }
  } catch (error) {
    console.error("🍎 [Apple Profile] 처리 중 전체 오류:", error);
    // 프로필 업데이트 실패해도 로그인 자체는 성공으로 처리
  }
}
