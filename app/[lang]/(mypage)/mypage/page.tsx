'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase/auth-provider';
import {
  DefaultAvatar,
  ProfileImageContainer,
} from '@/components/ui/ProfileImageContainer';
import { useLanguageStore } from '@/stores/languageStore';

const MyPage = () => {
  const { userProfile, isAuthenticated, isLoading, signOut } = useAuth();
  const { t } = useLanguageStore();
  const [pageLoading, setPageLoading] = useState(true);

  // 컴포넌트 마운트 시 기존 로그아웃 플래그 정리
  useEffect(() => {
    // 모든 가능한 로그아웃 플래그 정리
    const cleanupFlags = () => {
      try {
        const flagsToCheck = ['signout_in_progress', 'logout_in_progress', 'auth_signout'];
        let cleanedAny = false;
        
        flagsToCheck.forEach(flagKey => {
          const existingFlag = sessionStorage.getItem(flagKey);
          if (existingFlag) {
            const flagTime = parseInt(existingFlag);
            const currentTime = Date.now();
            
            // 5초 이상 된 플래그는 제거 (타임아웃) 또는 숫자가 아닌 경우 제거
            if (isNaN(flagTime) || currentTime - flagTime > 5000) {
              console.log(`🧹 [MyPage] 오래된 플래그 정리: ${flagKey}`);
              sessionStorage.removeItem(flagKey);
              cleanedAny = true;
            }
          }
        });
        
        if (cleanedAny) {
          console.log('✅ [MyPage] 로그아웃 플래그 정리 완료');
        }
      } catch (error) {
        console.warn('⚠️ [MyPage] sessionStorage 정리 중 오류:', error);
      }
    };

    // 마운트 시 즉시 정리
    cleanupFlags();
    
    // 5초 후에도 한 번 더 정리 (안전장치)
    const timeoutId = setTimeout(cleanupFlags, 5000);
    
    return () => clearTimeout(timeoutId);
  }, []);

  // 초기 로딩 타임아웃 설정 (2초 후 강제로 로딩 상태 해제)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (pageLoading) {
        console.log('로딩 타임아웃 - 강제로 로딩 상태 해제');
        setPageLoading(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [pageLoading]);

  // auth 로딩 상태가 변경되면 페이지 로딩 상태도 업데이트
  useEffect(() => {
    if (!isLoading) {
      // auth 로딩이 완료되면 약간의 지연 후 페이지 로딩 상태 해제
      const timer = setTimeout(() => {
        setPageLoading(false);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // 디버깅을 위한 렌더링 로그 추가
  useEffect(() => {
    console.log('MyPage 컴포넌트 렌더링 됨', {
      isAuthenticated,
      isLoading,
      pageLoading,
      userProfile: userProfile ? `ID: ${userProfile.id}` : 'null',
    });
  }, [isAuthenticated, isLoading, pageLoading, userProfile]);

  // 로그아웃 처리 함수 (메모화)
  const handleSignOut = useCallback(async () => {
    const signOutKey = 'signout_in_progress';
    
    // 기존 플래그 확인 및 정리
    const existingFlag = sessionStorage.getItem(signOutKey);
    if (existingFlag) {
      const flagTime = parseInt(existingFlag);
      const currentTime = Date.now();
      
      // 5초 이내의 최근 플래그라면 중복 호출 방지
      if (currentTime - flagTime < 5000) {
        console.log('🔄 [MyPage] 로그아웃 이미 진행 중 - 중복 호출 방지');
        return;
      } else {
        // 오래된 플래그는 제거
        console.log('🧹 [MyPage] 오래된 로그아웃 플래그 제거 후 진행');
        sessionStorage.removeItem(signOutKey);
      }
    }

    try {
      console.log('🚪 [MyPage] 로그아웃 시작');
      
      // 플래그 설정
      sessionStorage.setItem(signOutKey, Date.now().toString());

      // signOut 함수 호출
      await signOut();

      console.log('✅ [MyPage] 로그아웃 완료');
      
      // 즉시 플래그 제거 및 리디렉션
      sessionStorage.removeItem(signOutKey);
      
      // 로그아웃 완료 후 홈으로 리디렉션
      window.location.href = '/';

    } catch (error) {
      console.error('❌ [MyPage] 로그아웃 중 예외:', error);
      
      // 예외 발생 시도 플래그 제거
      sessionStorage.removeItem(signOutKey);
      
      // 예외가 발생해도 홈으로 리디렉션
      window.location.href = '/';
    }
  }, [signOut]); // isLoading 의존성 제거

  // 강제 로그아웃 함수 (디버깅용)
  const forceSignOut = useCallback(() => {
    console.log('🚨 [MyPage] 강제 로그아웃 시작');
    
    // 모든 sessionStorage 플래그 정리
    sessionStorage.removeItem('signout_in_progress');
    sessionStorage.removeItem('logout_in_progress');
    
    // 직접 signOut 호출
    signOut().then(() => {
      console.log('✅ [MyPage] 강제 로그아웃 완료');
      window.location.href = '/';
    }).catch((error) => {
      console.error('❌ [MyPage] 강제 로그아웃 중 예외:', error);
      window.location.href = '/';
    });
  }, [signOut]);

  if (pageLoading) {
    return (
      <div className='min-h-screen flex justify-center items-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500'></div>
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='bg-white rounded-lg shadow-md p-6 mb-8 relative'>
        <div className='flex flex-col sm:flex-row items-start sm:items-center'>
          <div className='mb-4 sm:mb-0 sm:mr-6'>
            {userProfile?.avatar_url ? (
              <ProfileImageContainer
                avatarUrl={userProfile.avatar_url}
                width={100}
                height={100}
                borderRadius={12}
              />
            ) : (
              <DefaultAvatar width={100} height={100} />
            )}
          </div>
          <div>
            <h1 className='text-2xl font-bold mb-2'>
              {userProfile?.nickname || '사용자'}
            </h1>
            <p className='text-gray-600 mb-1'>
              {userProfile?.email || '로그인 후 이메일이 표시됩니다'}
            </p>
          </div>
        </div>

        <div className='mt-8 border-t border-gray-200 pt-6'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div>
              <h2 className='text-lg font-semibold mb-4'>계정 관리</h2>
              <ul className='space-y-3'>
                {isAuthenticated ? (
                  <>
                    <li>
                      <Link
                        href='/mypage/edit-profile'
                        className='text-primary-600 hover:underline'
                      >
                        프로필 수정
                      </Link>
                    </li>
                    <li>
                      <button
                        onClick={handleSignOut}
                        className='text-red-600 hover:underline'
                      >
                        로그아웃
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={forceSignOut}
                        className='text-orange-600 hover:underline text-sm'
                      >
                        강제 로그아웃 (디버깅용)
                      </button>
                    </li>
                  </>
                ) : (
                  <li>
                    <Link
                      href='/login'
                      className='text-primary-600 hover:underline'
                    >
                      로그인하기
                    </Link>
                  </li>
                )}
              </ul>
            </div>

            <div>
              <h2 className='text-lg font-semibold mb-4'>활동 내역</h2>
              <ul className='space-y-3'>
                {isAuthenticated ? (
                  <>
                    <li>
                      <Link
                        href='/mypage/votes'
                        className='text-primary-600 hover:underline'
                      >
                        내 투표 보기
                      </Link>
                    </li>
                    <li>
                      <Link
                        href='/mypage/posts'
                        className='text-primary-600 hover:underline'
                      >
                        내 게시글 보기
                      </Link>
                    </li>
                    <li>
                      <Link
                        href='/mypage/comments'
                        className='text-primary-600 hover:underline'
                      >
                        내 댓글 보기
                      </Link>
                    </li>
                  </>
                ) : (
                  <li className='text-gray-500'>
                    로그인 후 이용 가능한 서비스입니다
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {!isAuthenticated && (
          <div className='absolute inset-0 backdrop-blur-md flex items-center justify-center rounded-lg'>
            <div className='text-center bg-white/90 p-8 rounded-lg shadow-lg max-w-md mx-auto'>
              <p className='text-gray-600 mb-6'>
                프로필 정보를 보시려면 로그인해주세요.
              </p>
              <Link
                href='/login'
                className='inline-block bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors'
              >
                로그인하기
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className='bg-white rounded-lg shadow-md p-6'>
        <h2 className='text-lg font-semibold mb-4 text-gray-900'>
          서비스 정보
        </h2>
        <ul className='space-y-3'>
          <li>
            <Link href='/notice' className='text-primary-600 hover:underline'>
              {t('label_mypage_notice')}
            </Link>
          </li>
          <li>
            <Link href='/faq' className='text-primary-600 hover:underline'>
              {t('label_mypage_faq')}
            </Link>
          </li>
          <li>
            <Link href='/privacy' className='text-primary-600 hover:underline'>
              {t('label_mypage_privacy_policy')}
            </Link>
          </li>
          <li>
            <Link href='/terms' className='text-primary-600 hover:underline'>
              {t('label_mypage_terms_of_use')}
            </Link>
          </li>
          {isAuthenticated && (
            <li>
              <Link
                href='/mypage/delete-account'
                className='text-red-600 hover:underline'
              >
                {t('label_mypage_withdrawal')}
              </Link>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default MyPage;
