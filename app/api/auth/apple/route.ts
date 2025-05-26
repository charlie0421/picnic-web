import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import {
  SocialAuthError,
  SocialAuthErrorCode,
} from "@/lib/supabase/social/types";
import {
  normalizeAppleProfile,
  parseAppleIdentityToken,
} from "@/lib/supabase/social/apple";
import * as jose from "jose"; // jose 라이브러리 필요 (npm install jose)

/**
 * Apple OAuth 인증 처리 API
 * 클라이언트에서 Apple 인증 코드를 받아 처리
 */
export async function POST(request: NextRequest) {
  console.log("🍎 Apple OAuth API 요청 수신");

  try {
    // 요청 헤더 확인
    const contentType = request.headers.get("content-type");
    const contentLength = request.headers.get("content-length");
    console.log("요청 헤더:", { contentType, contentLength });

    let code: string | null = null;
    let user: string | null = null;
    let state: string | null = null;
    let error: string | null = null;

    // Content-Type에 따라 다른 파싱 방법 사용
    if (contentType?.includes("application/x-www-form-urlencoded")) {
      // Apple에서 form-encoded로 보내는 경우 (일반적인 Apple OAuth 콜백)
      console.log("Form-encoded 데이터 처리");

      try {
        const formData = await request.formData();
        code = formData.get("code") as string;
        user = formData.get("user") as string;
        state = formData.get("state") as string;
        error = formData.get("error") as string;

        console.log("Form 데이터 파싱 완료:", {
          code: code ? "present" : "missing",
          user: user ? "present" : "missing",
          state: state || "missing",
          error: error || "none",
        });
      } catch (formError) {
        console.error("Form 데이터 파싱 오류:", formError);
        return NextResponse.json({
          success: false,
          error: "form_parsing_error",
          message: "Form 데이터를 파싱할 수 없습니다.",
        }, { status: 400 });
      }
    } else if (contentType?.includes("application/json")) {
      // 클라이언트에서 JSON으로 보내는 경우
      console.log("JSON 데이터 처리");

      try {
        const rawBody = await request.text();
        console.log("원본 요청 본문:", rawBody);

        if (!rawBody || rawBody.trim() === "") {
          throw new Error("빈 요청 본문");
        }

        const body = JSON.parse(rawBody);
        console.log("파싱된 본문:", body);

        code = body.code;
        user = body.user;
        state = body.state;
        error = body.error;
      } catch (parseError) {
        console.error("JSON 파싱 오류:", parseError);
        return NextResponse.json({
          success: false,
          error: "json_parsing_error",
          message: `JSON을 파싱할 수 없습니다: ${
            parseError instanceof Error ? parseError.message : "알 수 없는 오류"
          }`,
        }, { status: 400 });
      }
    } else {
      // URL-encoded 문자열로 직접 파싱 시도 (fallback)
      console.log("URL-encoded 문자열 직접 파싱");

      try {
        const rawBody = await request.text();
        console.log("원본 요청 본문:", rawBody);

        const params = new URLSearchParams(rawBody);
        code = params.get("code");
        user = params.get("user");
        state = params.get("state");
        error = params.get("error");

        console.log("URL 파라미터 파싱 완료:", {
          code: code ? "present" : "missing",
          user: user ? "present" : "missing",
          state: state || "missing",
          error: error || "none",
        });
      } catch (urlError) {
        console.error("URL 파라미터 파싱 오류:", urlError);
        return NextResponse.json({
          success: false,
          error: "url_parsing_error",
          message: "URL 파라미터를 파싱할 수 없습니다.",
        }, { status: 400 });
      }
    }

    // 에러가 있는 경우
    if (error) {
      console.error("Apple OAuth 에러:", error);
      return NextResponse.json({
        success: false,
        error: "apple_oauth_error",
        message: `Apple OAuth 오류: ${error}`,
      }, { status: 400 });
    }

    // authorization code가 없는 경우
    if (!code) {
      console.error("Apple OAuth: authorization code 누락");
      return NextResponse.json({
        success: false,
        error: "no_authorization_code",
        message: "Apple 인증 코드가 없습니다.",
      }, { status: 400 });
    }

    console.log("최종 파싱된 데이터:", {
      code: code ? "present" : "missing",
      user: user ? "present" : "missing",
      state: state || "missing",
    });

    // 환경 변수 확인
    const requiredEnvVars = {
      NEXT_PUBLIC_APPLE_CLIENT_ID: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
      APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
      APPLE_KEY_ID: process.env.APPLE_KEY_ID,
      APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY,
    };

    const missingEnvVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingEnvVars.length > 0) {
      console.error("Apple 환경 변수 누락:", missingEnvVars);
      return NextResponse.json({
        success: false,
        error: "missing_environment_variables",
        message: `필요한 환경 변수가 설정되지 않았습니다: ${
          missingEnvVars.join(", ")
        }`,
      }, { status: 500 });
    }

    console.log("환경 변수 확인 완료");

    // Apple 토큰 교환 시도
    try {
      console.log("Apple 클라이언트 시크릿 생성 시작");
      const clientSecret = await generateAppleClientSecret();
      console.log("Apple 클라이언트 시크릿 생성 완료");

      // 토큰 교환 요청 파라미터 준비
      const tokenParams = {
        client_id: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID!,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
        // Apple Developer Console에서 설정된 Return URL과 정확히 일치해야 함
        // Apple은 보통 전체 URL을 요구함
        redirect_uri: `${new URL(request.url).origin}/api/auth/apple`,
      };

      console.log("토큰 교환 요청 파라미터:", {
        client_id: tokenParams.client_id,
        client_secret: clientSecret ? "present" : "missing",
        code: code ? "present" : "missing",
        grant_type: tokenParams.grant_type,
        redirect_uri: tokenParams.redirect_uri,
      });

      // 디버깅을 위한 추가 정보
      console.log("🔍 Apple 토큰 교환 디버깅 정보:", {
        requestOrigin: new URL(request.url).origin,
        fullRedirectUri: tokenParams.redirect_uri,
        clientIdLength: tokenParams.client_id?.length || 0,
        clientSecretLength: clientSecret?.length || 0,
        codeLength: code?.length || 0,
        timestamp: new Date().toISOString(),
      });

      // Apple 토큰 교환 요청
      const tokenResponse = await fetch(
        "https://appleid.apple.com/auth/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(tokenParams),
        },
      );

      console.log(
        "Apple 토큰 교환 응답 상태:",
        tokenResponse.status,
        tokenResponse.statusText,
      );

      if (!tokenResponse.ok) {
        // 상세한 오류 정보 가져오기
        let errorDetails;
        try {
          errorDetails = await tokenResponse.json();
          console.error("Apple 토큰 교환 오류 (JSON):", errorDetails);
        } catch (jsonError) {
          errorDetails = await tokenResponse.text();
          console.error("Apple 토큰 교환 오류 (텍스트):", errorDetails);
        }

        return NextResponse.json({
          success: false,
          error: "apple_token_exchange_failed",
          message: `Apple 토큰 교환 실패: ${tokenResponse.status}`,
          details: errorDetails,
          requestParams: {
            client_id: tokenParams.client_id,
            grant_type: tokenParams.grant_type,
            redirect_uri: tokenParams.redirect_uri,
            hasCode: !!code,
            hasClientSecret: !!clientSecret,
          },
          troubleshooting: {
            status400Causes: [
              "redirect_uri가 Apple Developer Console 설정과 불일치",
              "authorization code가 이미 사용되었거나 만료됨",
              "client_id가 올바르지 않음",
              "client_secret JWT가 올바르지 않음",
            ],
            checkList: [
              `Apple Developer Console Return URL: ${tokenParams.redirect_uri}`,
              "환경 변수 APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY 확인",
              "Apple Private Key가 올바른 PEM 형식인지 확인",
            ],
          },
        }, { status: 400 });
      }

      const tokenData = await tokenResponse.json();
      console.log("Apple 토큰 교환 성공:", {
        hasAccessToken: !!tokenData.access_token,
        hasIdToken: !!tokenData.id_token,
        hasRefreshToken: !!tokenData.refresh_token,
      });

      // ID 토큰 파싱 (사용자 정보 포함)
      let userInfo: any = null;
      if (tokenData.id_token) {
        try {
          const decodedToken = jose.decodeJwt(tokenData.id_token);
          console.log("Apple ID 토큰 디코딩 성공:", {
            sub: decodedToken.sub,
            email: (decodedToken as any).email,
            email_verified: (decodedToken as any).email_verified,
          });
          userInfo = decodedToken;
        } catch (decodeError) {
          console.error("Apple ID 토큰 디코딩 실패:", decodeError);
        }
      }

      // user 파라미터에서 추가 정보 파싱 (첫 로그인 시에만 제공됨)
      let additionalUserInfo: any = null;
      if (user) {
        try {
          additionalUserInfo = JSON.parse(user);
          console.log("Apple 추가 사용자 정보:", {
            hasName: !!(additionalUserInfo as any)?.name,
            hasEmail: !!(additionalUserInfo as any)?.email,
          });
        } catch (parseError) {
          console.error("Apple 사용자 정보 파싱 실패:", parseError);
        }
      }

      // Supabase 클라이언트 생성 및 사용자 세션 설정
      console.log("🔐 Supabase 세션 생성 시작");

      // 기존 소셜 로그인 서비스 활용
      try {
        // Apple 사용자 정보 추출
        const appleUserId = userInfo?.sub;
        const email = userInfo?.email || (additionalUserInfo as any)?.email;
        const name = (additionalUserInfo as any)?.name;

        console.log("Apple 사용자 정보:", {
          appleUserId,
          email: email || "missing",
          hasName: !!name,
        });

        // 성공 응답 - 클라이언트에서 세션 처리하도록 함
        const redirectUrl =
          `/vote?apple_auth=success&apple_id=${appleUserId}&email=${
            encodeURIComponent(email || "")
          }`;

        console.log(
          "Apple OAuth 성공, 클라이언트 세션 처리로 리다이렉트:",
          redirectUrl,
        );

        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Apple 로그인 성공</title>
            <meta charset="utf-8">
          </head>
          <body>
            <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
              <h2>🍎 Apple 로그인 성공!</h2>
              <p>세션을 설정하고 있습니다...</p>
              <script>
                console.log('Apple OAuth 성공, 리다이렉트 중:', '${redirectUrl}');
                window.location.href = '${redirectUrl}';
              </script>
            </div>
          </body>
          </html>
        `;

        return new NextResponse(htmlResponse, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
          },
        });
      } catch (error) {
        console.error("Apple OAuth 처리 오류:", error);

        // 오류 시 기본 리다이렉트
        const fallbackUrl = `/vote?apple_auth=error&message=${
          encodeURIComponent("세션 생성 실패")
        }`;

        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Apple 로그인 오류</title>
            <meta charset="utf-8">
          </head>
          <body>
            <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
              <h2>🍎 Apple 로그인 처리 중 오류</h2>
              <p>다시 시도해주세요...</p>
              <script>
                console.log('Apple OAuth 오류, 리다이렉트 중:', '${fallbackUrl}');
                window.location.href = '${fallbackUrl}';
              </script>
            </div>
          </body>
          </html>
        `;

        return new NextResponse(htmlResponse, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
          },
        });
      }
    } catch (tokenError) {
      console.error("Apple 토큰 처리 오류:", tokenError);
      return NextResponse.json({
        success: false,
        error: "apple_token_processing_error",
        message: `Apple 토큰 처리 중 오류: ${
          tokenError instanceof Error ? tokenError.message : "알 수 없는 오류"
        }`,
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Apple OAuth API 처리 오류:", error);

    return NextResponse.json({
      success: false,
      error: "api_processing_error",
      message: `인증 처리 중 오류가 발생했습니다: ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
      stack: process.env.NODE_ENV === "development"
        ? (error instanceof Error ? error.stack : undefined)
        : undefined,
    }, { status: 500 });
  }
}

/**
 * GET 요청 처리 - API 상태 확인
 */
export async function GET(request: NextRequest) {
  console.log("🍎 Apple OAuth API - GET 요청 수신");

  // 환경 변수 상태 확인
  const envStatus = {
    NEXT_PUBLIC_APPLE_CLIENT_ID: !!process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
    APPLE_TEAM_ID: !!process.env.APPLE_TEAM_ID,
    APPLE_KEY_ID: !!process.env.APPLE_KEY_ID,
    APPLE_PRIVATE_KEY: !!process.env.APPLE_PRIVATE_KEY,
  };

  return NextResponse.json({
    message: "Apple OAuth API 정상 작동",
    endpoint: "/api/auth/apple",
    method: "POST",
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      envVariables: envStatus,
    },
  });
}

/**
 * JWT 형식의 Apple 클라이언트 시크릿 생성
 *
 * @returns 생성된 클라이언트 시크릿
 */
async function generateAppleClientSecret(): Promise<string> {
  try {
    // Apple 클라이언트 시크릿 생성에 필요한 값
    const clientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID!;
    const teamId = process.env.APPLE_TEAM_ID!;
    const keyId = process.env.APPLE_KEY_ID!;
    const privateKey = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n");

    if (!clientId || !teamId || !keyId || !privateKey) {
      throw new Error("Apple 인증에 필요한 환경 변수가 설정되지 않았습니다.");
    }

    // 현재 시간 기준으로 JWT 생성 (6개월 유효기간)
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 15777000; // 6개월 (초 단위)

    // JWT 서명에 사용할 프라이빗 키 가져오기
    const alg = "ES256";
    const privateKeyImported = await jose.importPKCS8(privateKey, alg);

    // JWT 생성 및 서명
    const jwt = await new jose.SignJWT({
      iss: teamId,
      iat: now,
      exp: expiry,
      aud: "https://appleid.apple.com",
      sub: clientId,
    })
      .setProtectedHeader({ alg, kid: keyId })
      .sign(privateKeyImported);

    return jwt;
  } catch (error) {
    console.error("Apple 클라이언트 시크릿 생성 오류:", error);
    throw error;
  }
}
