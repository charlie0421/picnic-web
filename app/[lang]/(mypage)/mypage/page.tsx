'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/supabase/auth-provider';
import { simpleSignOut } from '@/lib/supabase/client';
import {
  DefaultAvatar,
  ProfileImageContainer,
} from '@/components/ui/ProfileImageContainer';
import { useLanguageStore } from '@/stores/languageStore';

const MyPage = () => {
  const { userProfile, isAuthenticated, isLoading, isInitialized, user, session } = useAuth();
  const { t } = useLanguageStore();
  const [pageLoading, setPageLoading] = useState(true);
  
  // 디버그 모드 감지 (개발 환경 또는 로컬호스트)
  const isDebugMode = process.env.NODE_ENV === 'development' || 
                     (typeof window !== 'undefined' && window.location.hostname === 'localhost');

  // 사용자 정보 추출 (토큰 기반 우선, userProfile은 fallback)
  const getUserInfo = useCallback(() => {
    // 디버깅: 실제 데이터 확인
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [getUserInfo] 디버깅 데이터:', {
        hasUser: !!user,
        hasUserProfile: !!userProfile,
        userKeys: user ? Object.keys(user) : null,
        userProfileKeys: userProfile ? Object.keys(userProfile) : null,
        userMetadata: user?.user_metadata,
        appMetadata: user?.app_metadata,
        userEmail: user?.email,
        profileEmail: userProfile?.email,
      });
    }

    // 1. 토큰에서 직접 정보 가져오기 (가장 확실함)
    if (user) {
      const result = {
        nickname: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || '사용자',
        email: user.email || '이메일 정보 없음',
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        provider: user.app_metadata?.provider || 'unknown',
        source: 'token'
      };
      
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ [getUserInfo] 토큰에서 정보 추출:', result);
      }
      return result;
    }
    
    // 2. userProfile에서 가져오기 (fallback)
    if (userProfile) {
      const result = {
        nickname: userProfile.nickname || userProfile.email?.split('@')[0] || '사용자',
        email: userProfile.email || '이메일 정보 없음', 
        avatar_url: userProfile.avatar_url || null,
        provider: 'profile',
        source: 'userProfile'
      };
      
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ [getUserInfo] userProfile에서 정보 추출:', result);
      }
      return result;
    }
    
    // 3. 기본값
    const result = {
      nickname: '사용자',
      email: '로그인 후 이메일이 표시됩니다',
      avatar_url: null,
      provider: 'none',
      source: 'default'
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('❌ [getUserInfo] 기본값 사용:', result);
    }
    return result;
  }, [user, userProfile]);

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

  // 디버깅을 위한 렌더링 로그 추가 (개발 환경에서만)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const userInfo = getUserInfo();
      console.log('👤 [MyPage] 사용자 정보 디버깅:', {
        isAuthenticated,
        isLoading,
        isInitialized,
        pageLoading,
        isDebugMode,
        userFromToken: user ? {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name,
          provider: user.app_metadata?.provider,
          avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        } : null,
        userProfile: userProfile ? `ID: ${userProfile.id}, email: ${userProfile.email}` : 'null',
        resolvedUserInfo: userInfo,
        timestamp: new Date().toISOString(),
      });

      // 🚨 인증 감지 문제 진단
      if (!isAuthenticated && !isLoading && isInitialized) {
        console.warn('🚨 [MyPage] 인증 감지 실패 - 진단 시작');
        
        // 쿠키 확인
        const hasCookie = document.cookie.includes('auth-token');
        console.log('🍪 쿠키 상태:', {
          hasCookie,
          cookieCount: document.cookie.split(';').length,
          allCookies: document.cookie.split(';').map(c => c.trim().split('=')[0])
        });

        // localStorage 확인
        const storageKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('sb-') && key.includes('auth')) {
            storageKeys.push(key);
          }
        }
        console.log('💾 localStorage 인증 키:', storageKeys);

        // JWT 직접 테스트
        try {
          import('@/utils/jwt-parser').then(({ getInstantUserFromCookies }) => {
            const jwtUser = getInstantUserFromCookies();
            console.log('🔍 직접 JWT 파싱 결과:', {
              hasJWTUser: !!jwtUser,
              jwtUserEmail: jwtUser?.email,
              jwtUserId: jwtUser?.id?.substring(0, 8) + '...'
            });

            if (jwtUser && !isAuthenticated) {
              console.error('🚨 JWT에서는 사용자 발견되지만 Auth 상태가 인증되지 않음!');
              console.log('🔄 Auth 상태 강제 새로고침을 시도하려면 콘솔에서 다음 실행:');
              console.log('window.location.reload()');
            }
          });
        } catch (error) {
          console.error('❌ JWT 직접 테스트 실패:', error);
        }
      }
    }
  }, [isAuthenticated, isLoading, isInitialized, pageLoading, userProfile, user, getUserInfo, isDebugMode]);

  // 🛠️ 강제 인증 새로고침 함수 (개발 환경에서만)
  const forceAuthRefresh = useCallback(async () => {
    if (process.env.NODE_ENV !== 'development') return;
    
    console.log('🔄 [MyPage] 강제 인증 새로고침 시작');
    try {
      const { getInstantUserFromCookies } = await import('@/utils/jwt-parser');
      const jwtUser = getInstantUserFromCookies();
      
      if (jwtUser) {
        console.log('✅ JWT에서 사용자 발견 - 페이지 새로고침');
        window.location.reload();
      } else {
        console.warn('⚠️ JWT에서도 사용자 없음 - 로그인 필요');
        alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('❌ 강제 새로고침 실패:', error);
    }
  }, []);

  // 빠른 로그아웃 (Next.js 15 최적화)
  const handleSignOut = useCallback(async () => {
    try {
      console.log('🚀 [MyPage] 빠른 로그아웃 시작');
      await simpleSignOut();
      // 성공 시 별도 처리 불필요 (함수 내에서 리다이렉트 처리됨)
    } catch (error) {
      console.error('❌ [MyPage] 로그아웃 중 예외:', error);
      // 실패 시 강제 리다이렉트
      console.log('🚨 [MyPage] 로그아웃 실패 → 강제 리다이렉트');
      window.location.href = '/';
    }
  }, []);

  // 로딩 상태 처리 (auth 초기화 또는 페이지 로딩)
  if (isLoading || pageLoading || !isInitialized) {
    return (
      <div className='min-h-screen flex flex-col justify-center items-center space-y-4'>
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500'></div>
        <p className='text-gray-600'>
          {isLoading ? '사용자 정보를 로드하는 중...' : '페이지를 로드하는 중...'}
        </p>
      </div>
    );
  }

  // 사용자 정보 가져오기
  const userInfo = getUserInfo();

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='bg-white rounded-lg shadow-md p-6 mb-8 relative'>
        <div className='flex flex-col sm:flex-row items-start sm:items-center'>
          <div className='mb-4 sm:mb-0 sm:mr-6'>
            {userInfo.avatar_url ? (
              <ProfileImageContainer
                avatarUrl={userInfo.avatar_url}
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
              {userInfo.nickname}
            </h1>
            <p className='text-gray-600 mb-1'>
              {userInfo.email}
            </p>
            {isDebugMode && userInfo.provider !== 'none' && (
              <p className='text-xs text-gray-400 mt-1'>
                Provider: {userInfo.provider}
              </p>
            )}
          </div>
        </div>

        <div className='mt-8 border-t border-gray-200 pt-6'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div>
              <h2 className='text-lg font-semibold mb-4'>계정 관리</h2>
              <ul className='space-y-3'>
                {isAuthenticated ? (
                  <>
                    {isDebugMode && (
                      <li>
                        <Link
                          href='/mypage/edit-profile'
                          className='text-primary-600 hover:underline'
                        >
                          프로필 수정 (디버그)
                        </Link>
                      </li>
                    )}
                    <li>
                      <button
                        onClick={handleSignOut}
                        className='text-red-600 hover:underline font-medium'
                      >
                        로그아웃
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

            {isDebugMode && (
              <div>
                <h2 className='text-lg font-semibold mb-4'>활동 내역 (디버그)</h2>
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
            )}
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
              
              {/* 🛠️ 개발 환경 디버깅 버튼들 */}
              {isDebugMode && (
                <div className='mt-6 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg'>
                  <p className='text-sm text-yellow-800 mb-3 font-medium'>🛠️ 개발자 디버깅 도구</p>
                  <div className='space-y-2'>
                    <button
                      onClick={() => {
                        console.log('🔍 [Debug] JWT 디버깅 시작');
                        if (typeof window !== 'undefined' && (window as any).debugJWT) {
                          (window as any).debugJWT();
                        } else {
                          import('@/utils/jwt-parser').then(({ debugJWTInfo }) => debugJWTInfo());
                        }
                      }}
                      className='block w-full text-xs bg-yellow-200 hover:bg-yellow-300 px-3 py-2 rounded transition-colors'
                    >
                      JWT 토큰 분석
                    </button>
                    <button
                      onClick={() => {
                        console.log('🔍 [Debug] 로컬 쿠키 분석 시작');
                        if (typeof window !== 'undefined' && (window as any).debugLocalCookies) {
                          (window as any).debugLocalCookies();
                        } else {
                          import('@/utils/jwt-parser').then(({ debugLocalCookies }) => debugLocalCookies());
                        }
                      }}
                      className='block w-full text-xs bg-blue-200 hover:bg-blue-300 px-3 py-2 rounded transition-colors'
                    >
                      로컬 쿠키 분석
                    </button>
                    <button
                      onClick={forceAuthRefresh}
                      className='block w-full text-xs bg-green-200 hover:bg-green-300 px-3 py-2 rounded transition-colors'
                    >
                      강제 인증 새로고침
                    </button>
                    <button
                      onClick={() => {
                        console.log('🔄 [Debug] 전체 새로고침');
                        window.location.reload();
                      }}
                      className='block w-full text-xs bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded transition-colors'
                    >
                      페이지 새로고침
                    </button>
                  </div>
                  <p className='text-xs text-yellow-700 mt-3'>
                    💡 브라우저 콘솔을 열어서 디버깅 정보를 확인하세요.
                  </p>
                </div>
              )}
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
          {isAuthenticated && isDebugMode && (
            <li>
              <Link
                href='/mypage/delete-account'
                className='text-red-600 hover:underline'
              >
                {t('label_mypage_withdrawal')} (디버그)
              </Link>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default MyPage;
