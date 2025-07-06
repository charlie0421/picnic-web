import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// Supabase 클라이언트 인스턴스
const supabase = createBrowserSupabaseClient();

export { supabase };

// 로그인 상태 확인 (getUser()는 getSession()보다 빠르고 안정적)
export const isUserLoggedIn = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  return !!user && !error;
};

// 사용자 정보 가져오기
export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
};

// 스토리지 URL 가져오기
export const getStorageUrl = (bucket: string, path: string) => {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

// CDN URL 가져오기
export const getCdnUrl = (path: string) => {
  return `${process.env.NEXT_PUBLIC_CDN_URL}${path}`;
};

// 파일 업로드
export const uploadFile = async (bucket: string, path: string, file: File) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file);

  if (error) throw error;
  return data;
};

// pending auth 상태 처리를 위한 유틸리티 함수 (더 빠른 getUser() 사용)
export const handlePendingAuth = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error('Auth 상태 확인 오류:', error);
      return null;
    }
    return user;
  } catch (error) {
    console.error('Auth 상태 확인 오류:', error);
    return null;
  }
};
