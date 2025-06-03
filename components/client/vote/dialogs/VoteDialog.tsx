'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useLanguageStore } from '@/stores/languageStore';
import { VoteItem } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';
import { isLoggedOut, getRemainingAuthItems, emergencyLogout } from '@/lib/auth/logout';

interface VoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onVote: () => void;
  selectedArtist: VoteItem | null;
  votes: number;
  setVotes: (votes: number) => void;
}

// 인증 검증 결과 인터페이스
interface AuthVerificationResult {
  isValid: boolean;
  error?: string;
  shouldClose?: boolean;
  shouldReload?: boolean;
}

// 서버 검증 결과 인터페이스
interface ServerVerificationResult {
  valid: boolean;
  authenticated: boolean;
  user_id?: string;
  error?: string;
  details?: string;
}

/**
 * 강화된 투표 다이얼로그 컴포넌트
 * 
 * 주요 기능:
 * 1. 사전 인증 상태 검증 (다이얼로그 표시 전)
 * 2. 실시간 서버 사이드 인증 검증
 * 3. 주기적 인증 상태 모니터링
 * 4. 자동 로그아웃 감지 및 다이얼로그 자동 닫기
 * 5. 로그아웃된 사용자 강력 차단
 */
const VoteDialog: React.FC<VoteDialogProps> = ({
  isOpen,
  onClose,
  onVote,
  selectedArtist,
  votes,
  setVotes,
}) => {
  const { isAuthenticated, isLoading, user, session } = useAuth();
  const { t } = useLanguageStore();
  const { withAuth } = useAuthGuard({
    // 투표별 맞춤 로그인 메시지
    customLoginMessage: {
      title: t('vote.login_required.title'),
      description: selectedArtist?.artist?.name
        ? t('vote.login_required.description_with_artist', { 
            artistName: getLocalizedString(selectedArtist.artist.name) 
          })
        : t('vote.login_required.description'),
      loginText: t('vote.login_required.login_button'),
      cancelText: t('vote.login_required.cancel_button'),
    }
  });

  // 인증 상태 관리
  const [authVerified, setAuthVerified] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCount, setVerificationCount] = useState(0);
  const [lastServerVerificationTime, setLastServerVerificationTime] = useState(0);
  const [consecutiveAuthFailures, setConsecutiveAuthFailures] = useState(0);

  // Refs
  const verificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const periodicCheckRef = useRef<NodeJS.Timeout | null>(null);
  const lastAuthStateRef = useRef<boolean>(false);

  /**
   * 서버 사이드 인증 검증 (강화됨)
   */
  const verifyServerAuthentication = useCallback(async (): Promise<ServerVerificationResult> => {
    try {
      console.log('🔍 [VoteDialog] 서버 인증 검증 시작');

      const response = await fetch('/api/auth/verify', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Source': 'VoteDialog',
          'X-Verification-Count': verificationCount.toString()
        },
      });

      if (!response.ok) {
        console.warn('🚫 [VoteDialog] 서버 인증 검증 HTTP 실패:', response.status, response.statusText);
        return {
          valid: false,
          authenticated: false,
          error: `Server error: ${response.status}`,
          details: response.statusText
        };
      }

      const result: ServerVerificationResult = await response.json();
      
      console.log('🔍 [VoteDialog] 서버 인증 검증 응답:', {
        valid: result.valid,
        authenticated: result.authenticated,
        userId: result.user_id,
        hasError: !!result.error
      });

      if (!result.valid || !result.authenticated) {
        console.warn('❌ [VoteDialog] 서버에서 인증 무효 응답:', result);
        return result;
      }

      console.log('✅ [VoteDialog] 서버 인증 검증 성공');
      setLastServerVerificationTime(Date.now());
      return result;
    } catch (error) {
      console.warn('⚠️ [VoteDialog] 서버 인증 검증 네트워크 오류:', error);
      return {
        valid: false,
        authenticated: false,
        error: 'Network error',
        details: error instanceof Error ? error.message : 'Unknown network error'
      };
    }
  }, [verificationCount]);

  /**
   * 포괄적 인증 상태 검증 (강화됨)
   */
  const performComprehensiveAuthCheck = useCallback(async (): Promise<AuthVerificationResult> => {
    try {
      console.log('🔄 [VoteDialog] 포괄적 인증 상태 검증 시작 (검증 #' + (verificationCount + 1) + ')');
      setVerificationCount(prev => prev + 1);

      // 1. 강화된 로그아웃 상태 검증
      if (isLoggedOut()) {
        console.warn('❌ [VoteDialog] 강화된 로그아웃 상태 감지');
        const remainingItems = getRemainingAuthItems();
        if (remainingItems.length > 0) {
          console.warn('⚠️ [VoteDialog] 남은 인증 데이터 감지 - 강제 정리:', remainingItems);
          // 강제 정리 후 페이지 새로고침 권장
          await emergencyLogout();
          return {
            isValid: false,
            error: '로그인이 필요합니다. 페이지를 새로고침 해주세요.',
            shouldClose: true,
            shouldReload: true
          };
        }
        return {
          isValid: false,
          error: '로그인이 필요합니다.',
          shouldClose: true
        };
      }

      // 2. 기본 인증 상태 체크 (강화됨)
      if (!isAuthenticated || !user || !session) {
        console.warn('❌ [VoteDialog] 기본 인증 상태 실패:', {
          isAuthenticated,
          hasUser: !!user,
          hasSession: !!session,
          isLoading
        });
        return {
          isValid: false,
          error: '인증 정보를 확인할 수 없습니다.',
          shouldClose: true
        };
      }

      // 3. 세션 만료 체크 (강화됨)
      if (session.expires_at) {
        const expiryTime = new Date(session.expires_at * 1000);
        const now = new Date();
        const timeDiff = expiryTime.getTime() - now.getTime();
        
        if (timeDiff <= 0) {
          console.warn('⏰ [VoteDialog] 세션이 만료됨');
          await emergencyLogout();
          return {
            isValid: false,
            error: '세션이 만료되었습니다. 다시 로그인해주세요.',
            shouldClose: true,
            shouldReload: true
          };
        }

        // 세션이 5분 이내에 만료될 예정이면 서버 검증 강제 실행
        if (timeDiff < 300000) { // 5분
          console.warn('⚠️ [VoteDialog] 세션이 곧 만료됩니다:', Math.round(timeDiff / 60000), '분 남음');
          const serverResult = await verifyServerAuthentication();
          if (!serverResult.valid || !serverResult.authenticated) {
            return {
              isValid: false,
              error: '세션이 곧 만료되거나 무효합니다. 다시 로그인해주세요.',
              shouldClose: true
            };
          }
        }
      }

      // 4. 서버 인증 상태 검증 (주기적)
      const shouldVerifyServer = 
        verificationCount % 2 === 1 || // 2번에 한 번
        Date.now() - lastServerVerificationTime > 180000 || // 3분마다
        consecutiveAuthFailures > 0; // 이전에 실패가 있었으면 항상 검증

      if (shouldVerifyServer) {
        console.log('🔍 [VoteDialog] 서버 검증 조건 충족 - 실행');
        const serverResult = await verifyServerAuthentication();

        if (!serverResult.valid || !serverResult.authenticated) {
          setConsecutiveAuthFailures(prev => prev + 1);
          
          // 연속 실패 2회 이상시 강제 로그아웃
          if (consecutiveAuthFailures >= 1) {
            console.error('🚨 [VoteDialog] 연속 인증 실패 - 강제 로그아웃');
            await emergencyLogout();
            return {
              isValid: false,
              error: '인증에 문제가 발생했습니다. 다시 로그인해주세요.',
              shouldClose: true,
              shouldReload: true
            };
          }
          
          return {
            isValid: false,
            error: '서버 인증 검증에 실패했습니다.',
            shouldClose: true
          };
        } else {
          setConsecutiveAuthFailures(0); // 성공시 실패 카운트 리셋
        }
      }

      console.log('✅ [VoteDialog] 포괄적 인증 상태 검증 성공');
      return { isValid: true };

    } catch (error) {
      console.error('💥 [VoteDialog] 인증 검증 중 예외:', error);
      setConsecutiveAuthFailures(prev => prev + 1);
      
      // 예외 발생시도 연속 실패로 간주
      if (consecutiveAuthFailures >= 1) {
        console.error('🚨 [VoteDialog] 예외 연속 발생 - 강제 로그아웃');
        await emergencyLogout();
        return {
          isValid: false,
          error: '인증 확인 중 문제가 발생했습니다. 페이지를 새로고침해주세요.',
          shouldClose: true,
          shouldReload: true
        };
      }
      
      return {
        isValid: false,
        error: '인증 확인 중 오류가 발생했습니다.',
        shouldClose: true
      };
    }
  }, [isAuthenticated, user, session, isLoading, verificationCount, lastServerVerificationTime, consecutiveAuthFailures, verifyServerAuthentication]);

  /**
   * 주기적 인증 상태 검증 (30초마다)
   */
  const startPeriodicAuthCheck = useCallback(() => {
    if (periodicCheckRef.current) {
      clearInterval(periodicCheckRef.current);
    }

    console.log('🔄 [VoteDialog] 주기적 인증 검증 시작 (30초 간격)');

    periodicCheckRef.current = setInterval(async () => {
      if (isOpen && isAuthenticated && !isLoading) {
        console.log('🔄 [VoteDialog] 주기적 인증 상태 검증 실행');
        
        const result = await performComprehensiveAuthCheck();
        
        if (!result.isValid) {
          console.warn('❌ [VoteDialog] 주기적 검증 실패 - 다이얼로그 닫기');
          setAuthError(result.error || '인증 상태가 유효하지 않습니다.');
          stopPeriodicAuthCheck();
          
          // 강제 닫기 실행
          setTimeout(() => {
            onClose();
            if (result.shouldReload) {
              window.location.reload();
            }
          }, 1500);
        } else {
          setAuthError(null);
          setAuthVerified(true);
        }
      }
    }, 30000); // 30초마다
  }, [isOpen, isAuthenticated, isLoading, performComprehensiveAuthCheck, onClose]);

  /**
   * 주기적 검증 중단
   */
  const stopPeriodicAuthCheck = useCallback(() => {
    if (periodicCheckRef.current) {
      clearInterval(periodicCheckRef.current);
      periodicCheckRef.current = null;
      console.log('⏹️ [VoteDialog] 주기적 인증 검증 중단');
    }
  }, []);

  /**
   * 다이얼로그 열릴 때 사전 인증 검증 (강화됨)
   */
  useEffect(() => {
    if (isOpen && !isLoading) {
      console.log('🔍 [VoteDialog] 다이얼로그 열림 - 사전 인증 검증 시작');
      
      const verifyAuth = async () => {
        setIsVerifying(true);
        setAuthError(null);
        
        // 타이머 리셋
        if (verificationTimeoutRef.current) {
          clearTimeout(verificationTimeoutRef.current);
        }
        
        // 100ms 지연으로 상태 안정화 후 검증
        verificationTimeoutRef.current = setTimeout(async () => {
          const result = await performComprehensiveAuthCheck();
          
          if (result.isValid) {
            console.log('✅ [VoteDialog] 사전 인증 검증 성공 - 다이얼로그 표시');
            setAuthVerified(true);
            setAuthError(null);
            
            // 주기적 검증 시작
            startPeriodicAuthCheck();
          } else {
            console.warn('❌ [VoteDialog] 사전 인증 검증 실패:', result.error);
            setAuthVerified(false);
            setAuthError(result.error || '인증에 실패했습니다.');
            
            if (result.shouldClose) {
              console.warn('🚪 [VoteDialog] 인증 실패로 다이얼로그 자동 닫기');
              setTimeout(() => {
                onClose();
                if (result.shouldReload) {
                  window.location.reload();
                }
              }, 1000); // 1초 후 자동 닫기
            }
          }
          
          setIsVerifying(false);
        }, 100);
      };

      verifyAuth();
    } else if (!isOpen) {
      // 다이얼로그가 닫힐 때 상태 초기화
      console.log('🔄 [VoteDialog] 다이얼로그 닫힘 - 상태 초기화');
      setAuthVerified(false);
      setAuthError(null);
      setIsVerifying(false);
      setVerificationCount(0);
      setConsecutiveAuthFailures(0);
      stopPeriodicAuthCheck();
      
      if (verificationTimeoutRef.current) {
        clearTimeout(verificationTimeoutRef.current);
      }
    }
  }, [isOpen, isLoading, performComprehensiveAuthCheck, onClose, startPeriodicAuthCheck, stopPeriodicAuthCheck]);

  /**
   * 인증 상태가 변경될 때 재검증
   */
  useEffect(() => {
    const currentAuthState = isAuthenticated && !!user && !!session;
    
    if (isOpen && !isLoading) {
      // 로그아웃 감지
      if (lastAuthStateRef.current && !currentAuthState) {
        console.warn('🚪 [VoteDialog] 로그아웃 감지 - 다이얼로그 강제 닫기');
        setAuthError('로그아웃되었습니다.');
        setTimeout(() => {
          onClose();
        }, 500);
      }
      // 인증 상태 변화 시 재검증
      else if (currentAuthState !== authVerified) {
        console.log('🔄 [VoteDialog] 인증 상태 변화 감지 - 재검증');
        performComprehensiveAuthCheck().then(result => {
          if (!result.isValid && result.shouldClose) {
            setAuthError(result.error || '인증에 실패했습니다.');
            setTimeout(() => {
              onClose();
              if (result.shouldReload) {
                window.location.reload();
              }
            }, 1000);
          }
        });
      }
    }
    
    lastAuthStateRef.current = currentAuthState;
  }, [isAuthenticated, user, session, isOpen, isLoading, authVerified, performComprehensiveAuthCheck, onClose]);

  /**
   * 컴포넌트 언마운트 시 정리
   */
  useEffect(() => {
    return () => {
      stopPeriodicAuthCheck();
      if (verificationTimeoutRef.current) {
        clearTimeout(verificationTimeoutRef.current);
      }
    };
  }, [stopPeriodicAuthCheck]);

  // 강화된 투표 실행 함수
  const handleVote = async () => {
    console.log('🎯 [VoteDialog] 투표 버튼 클릭');

    // 투표 실행 전 최종 인증 검증
    const finalCheck = await performComprehensiveAuthCheck();
    if (!finalCheck.isValid) {
      console.warn('❌ [VoteDialog] 최종 인증 검증 실패');
      setAuthError(finalCheck.error || '투표 권한이 없습니다.');
      if (finalCheck.shouldClose) {
        setTimeout(() => {
          onClose();
          if (finalCheck.shouldReload) {
            window.location.reload();
          }
        }, 1000);
      }
      return;
    }

    await withAuth(async () => {
      console.log('✅ [VoteDialog] 인증 통과 - 투표 실행');
      await onVote();
    });
  };

  // 로딩 중이거나 다이얼로그가 열리지 않았을 때
  if (!isOpen || isLoading) {
    return null;
  }

  // 인증 검증 중일 때
  if (isVerifying) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600 text-center">
              {t('vote.dialog.verifying_auth', { defaultValue: '인증 상태를 확인하고 있습니다...' })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 인증되지 않은 사용자는 다이얼로그를 표시하지 않음 (강화됨)
  if (!isAuthenticated || !authVerified) {
    // 검증 실패 또는 오류가 있으면 오류 다이얼로그 표시
    if (authError) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-red-600">
                {t('vote.dialog.auth_error_title', { defaultValue: '인증 오류' })}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700"
                aria-label="다이얼로그 닫기"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600">{authError}</p>
            </div>

            <div className="flex justify-center">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                {t('vote.dialog.close_button', { defaultValue: '닫기' })}
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    // 인증되지 않은 경우 다이얼로그 표시하지 않음
    console.log('❌ [VoteDialog] 인증되지 않은 사용자 - 다이얼로그 숨김');
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        {/* 기존 다이얼로그 내용 유지 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">
            {t('vote.dialog.title', { defaultValue: '투표하기' })}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="다이얼로그 닫기"
          >
            ✕
          </button>
        </div>

        {selectedArtist && (
          <div className="mb-6">
            <div className="flex items-center mb-4">
              {selectedArtist.artist?.image && (
                <div className="w-16 h-16 relative rounded-full overflow-hidden mr-4">
                  <Image
                    src={selectedArtist.artist.image}
                    alt={getLocalizedString(selectedArtist.artist.name) || 'Artist'}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div>
                <h4 className="font-semibold text-lg">
                  {getLocalizedString(selectedArtist.artist?.name)}
                </h4>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('vote.dialog.vote_amount', { defaultValue: '투표 수' })}
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={votes}
                onChange={(e) => setVotes(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            {t('vote.dialog.cancel_button', { defaultValue: '취소' })}
          </button>
          <button
            onClick={handleVote}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('vote.dialog.vote_button', { defaultValue: '투표하기' })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoteDialog;
