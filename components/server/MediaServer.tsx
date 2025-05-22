import React from 'react';
import MediaList from '@/components/features/media/MediaList';
import { getList, TABLES } from '@/lib/data-fetching/supabase-service';
import { AppError, ErrorCode } from '@/lib/supabase/error';
import { notFound } from 'next/navigation';
import { Media } from '@/types/interfaces';

// 데이터베이스의 미디어 테이블 스키마와 일치하는 타입
interface MediaRecord {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  video_id: string | null;
  title: string | Record<string, string>;
  [key: string]: any;
}

/**
 * 미디어 데이터를 서버에서 가져오는 서버 컴포넌트
 * 
 * 서버 측에서 미디어 데이터를 가져와 클라이언트 컴포넌트로 전달합니다.
 */
export default async function MediaServer() {
  try {
    // 서버에서 미디어 데이터 가져오기
    const medias = await getList<MediaRecord>(TABLES.MEDIA, {
      orderBy: { column: 'created_at', ascending: false }
    });

    // 데이터를 클라이언트 컴포넌트로 전달
    return (
      <MediaList 
        medias={medias.map(media => ({
          id: media.id,
          createdAt: media.created_at,
          updatedAt: media.updated_at,
          deletedAt: media.deleted_at,
          thumbnailUrl: media.thumbnail_url,
          videoUrl: media.video_url,
          videoId: media.video_id,
          title: media.title,
        }))} 
        isLoading={false} 
        error={null}
      />
    );
  } catch (error) {
    // 에러 처리
    console.error('미디어 데이터를 가져오는 중 오류가 발생했습니다:', error);
    
    // AppError 인스턴스인 경우 적절히 처리
    if (error instanceof AppError) {
      if (error.code === ErrorCode.NOT_FOUND) {
        notFound(); // Next.js의 not-found 페이지로 리디렉션
      }
      
      throw error; // 다른 유형의 에러는 상위 에러 경계로 전파
    }
    
    // 일반 에러
    throw new AppError(
      '미디어 데이터를 가져오는 중 오류가 발생했습니다',
      ErrorCode.SERVER_ERROR,
      error,
      500
    );
  }
} 