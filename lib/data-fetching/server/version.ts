/**
 * 앱 버전 정보 조회
 */

import { cache } from "react";
import { createPublicSupabaseClient } from "@/lib/supabase/server";
import { TABLES } from "./types";

/**
 * 버전 정보 인터페이스
 */
export interface VersionInfo {
  ios: { version: string; url: string } | null;
  android: { version: string; url: string } | null;
  apk: { version: string; url: string } | null;
}

/**
 * 최신 버전 정보 조회
 *
 * /[lang]/download 는 ISR(1시간)이다. 조회 장애를 null 로 바꿔 반환하면 다운로드 링크 없는 화면이
 * 한 시간 동안 캐시된다 — 장애는 예외로 전파하고(Next 가 마지막 정상 페이지를 유지),
 * 등록된 버전이 실제로 없을 때(PGRST116)만 null 을 돌려준다.
 */
export const getLatestVersion = cache(async (): Promise<VersionInfo | null> => {
  // 공개 데이터용 클라이언트 사용 (쿠키 없음)
  const supabase = createPublicSupabaseClient();

  const { data, error } = await supabase
    .from(TABLES.VERSION)
    .select("ios, android, apk")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single<VersionInfo>();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.warn("버전 정보 조회 실패:", error);
    throw new Error(`getLatestVersion failed: ${error.message}`);
  }

  return data;
});
