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
 */
export const getLatestVersion = cache(async (): Promise<VersionInfo | null> => {
  try {
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
      console.warn("버전 정보 조회 실패:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.warn("버전 정보 조회 중 오류:", error);
    return null;
  }
});
