'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/supabase/auth-provider-enhanced';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useLanguageStore } from '@/stores/languageStore';
import { VoteItem } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';

interface VoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onVote: () => void;
  selectedArtist: VoteItem | null;
  votes: number;
  setVotes: (votes: number) => void;
}

/**
 * 투표 다이얼로그 컴포넌트
 * 로그인된 사용자에게만 표시되며, 강화된 인증 검증을 수행합니다.
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
  const [authVerified, setAuthVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  /**
   * 강화된 인증 상태 검증
   */
  const verifyAuthentication = async () => {
    try {
      console.log('🔍 [VoteDialog] 인증 상태 검증 시작');

      // 1. 기본 인증 상태 체크
      if (!isAuthenticated || !user || !session) {
        console.warn('❌ [VoteDialog] 기본 인증 상태 실패');
        setAuthVerified(false);
        setVerificationError('로그인이 필요합니다.');
        return false;
      }

      // 2. 세션 만료 체크
      if (session.expires_at) {
        const expiryTime = new Date(session.expires_at * 1000);
        const now = new Date();
        if (now >= expiryTime) {
          console.warn('⏰ [VoteDialog] 세션이 만료됨');
          setAuthVerified(false);
          setVerificationError('세션이 만료되었습니다. 다시 로그인해주세요.');
          onClose(); // 다이얼로그 자동 닫기
          return false;
        }
      }

      // 3. 서버 인증 상태 검증
      try {
        const response = await fetch('/api/auth/verify', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          console.warn('🚫 [VoteDialog] 서버 인증 검증 실패');
          setAuthVerified(false);
          setVerificationError('인증 상태를 확인할 수 없습니다.');
          onClose(); // 다이얼로그 자동 닫기
          return false;
        }

        const data = await response.json();
        if (!data.valid) {
          console.warn('❌ [VoteDialog] 서버에서 인증 무효 응답');
          setAuthVerified(false);
          setVerificationError('인증이 유효하지 않습니다.');
          onClose(); // 다이얼로그 자동 닫기
          return false;
        }
      } catch (error) {
        console.warn('⚠️ [VoteDialog] 서버 인증 검증 오류:', error);
        // 네트워크 오류는 허용하되 경고 표시
        setVerificationError('네트워크 오류가 발생했습니다. 투표에 문제가 있을 수 있습니다.');
      }

      console.log('✅ [VoteDialog] 인증 상태 검증 성공');
      setAuthVerified(true);
      setVerificationError(null);
      return true;
    } catch (error) {
      console.error('💥 [VoteDialog] 인증 검증 중 오류:', error);
      setAuthVerified(false);
      setVerificationError('인증 확인 중 오류가 발생했습니다.');
      onClose(); // 다이얼로그 자동 닫기
      return false;
    }
  };

  // 다이얼로그가 열릴 때마다 인증 상태 검증
  useEffect(() => {
    if (isOpen && !isLoading) {
      verifyAuthentication();
    }
  }, [isOpen, isLoading, isAuthenticated, user, session]);

  // 인증되지 않은 사용자는 다이얼로그를 표시하지 않음
  if (!isOpen || isLoading || !isAuthenticated || !authVerified) {
    return null;
  }

  // 강화된 투표 실행 함수
  const handleVote = async () => {
    await withAuth(async () => {
      // 투표 실행 전 인증 상태 재검증
      const isValid = await verifyAuthentication();
      if (!isValid) {
        console.warn('❌ [VoteDialog] 투표 실행 전 인증 검증 실패');
        return;
      }

      // 실제 투표 실행
      await onVote();
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">
            {t('vote.dialog.title', { defaultValue: '투표하기' })}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="다이얼로그 닫기"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* 인증 오류 표시 */}
        {verificationError && (
          <div className="mb-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
            <p className="text-sm">{verificationError}</p>
          </div>
        )}

        {/* 선택된 아티스트 정보 */}
        {selectedArtist && (
          <div className="mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-sm">
                {selectedArtist.artist?.image ? (
                  <Image
                    src={`${process.env.NEXT_PUBLIC_CDN_URL}/${selectedArtist.artist.image}`}
                    alt={getLocalizedString(selectedArtist.artist.name)}
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                    <span className="text-gray-600 text-xs">No Image</span>
                  </div>
                )}
              </div>
              <div>
                <p className="font-bold text-lg">
                  {getLocalizedString(selectedArtist.artist?.name)}
                </p>
                <p className="text-sm text-gray-600">
                  {t('vote.dialog.artist_label', { defaultValue: '투표 대상' })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 투표 수 설정 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('vote.dialog.vote_count_label', { defaultValue: '투표 수' })}
          </label>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setVotes(Math.max(1, votes - 1))}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              disabled={votes <= 1}
              aria-label="투표 수 감소"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 12H4"
                />
              </svg>
            </button>
            <input
              type="number"
              min="1"
              value={votes}
              onChange={(e) => setVotes(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 text-center border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="투표 수 입력"
            />
            <button
              onClick={() => setVotes(votes + 1)}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
              aria-label="투표 수 증가"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 rounded"
          >
            {t('vote.dialog.cancel_button', { defaultValue: '취소' })}
          </button>
          <button
            onClick={handleVote}
            disabled={!authVerified || !!verificationError}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('vote.dialog.vote_button', { defaultValue: '투표하기' })}
          </button>
        </div>

        {/* 인증 상태 표시 (개발 모드) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-2 bg-gray-100 rounded text-xs text-gray-600">
            <p>Auth Status: {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</p>
            <p>User ID: {user?.id || 'None'}</p>
            <p>Auth Verified: {authVerified ? 'Yes' : 'No'}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoteDialog;
