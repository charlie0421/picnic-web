'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useLanguageStore } from '@/stores/languageStore';
import { VoteItem } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';
import { Dialog } from '@/components/ui/Dialog/Dialog';
import { Button } from '@/components/common/atoms/Button';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { cn } from '@/components/utils/cn';

interface VoteDialogV2Props {
  isOpen: boolean;
  onClose: () => void;
  onVote: () => void;
  selectedArtist: VoteItem | null;
  votes: number;
  setVotes: (votes: number) => void;
}

const VoteDialogV2: React.FC<VoteDialogV2Props> = ({
  isOpen,
  onClose,
  onVote,
  selectedArtist,
  votes,
  setVotes,
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { t } = useLanguageStore();
  const { withAuth } = useAuthGuard({
    customLoginMessage: {
      title: t('vote.login_required.title'),
      description: selectedArtist?.artist?.name
        ? t('vote.login_required.description_with_artist', {
            artistName: getLocalizedString(selectedArtist.artist.name),
          })
        : t('vote.login_required.description'),
      loginText: t('vote.login_required.login_button'),
      cancelText: t('vote.login_required.cancel_button'),
    },
  });
  const [authVerified, setAuthVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const verifyAuthentication = async () => {
    try {
      if (!isAuthenticated || !user) {
        setAuthVerified(false);
        setVerificationError('로그인이 필요합니다.');
        return false;
      }

      const response = await fetch('/api/auth/verify', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        setAuthVerified(false);
        setVerificationError('인증 상태를 확인할 수 없습니다.');
        onClose();
        return false;
      }

      const data = await response.json();
      if (!data.valid) {
        setAuthVerified(false);
        setVerificationError('인증이 유효하지 않습니다.');
        onClose();
        return false;
      }
      setAuthVerified(true);
      setVerificationError(null);
      return true;
    } catch (error) {
      setAuthVerified(false);
      setVerificationError('인증 확인 중 오류가 발생했습니다.');
      onClose();
      return false;
    }
  };

  useEffect(() => {
    if (isOpen && !isLoading) {
      verifyAuthentication();
    }
  }, [isOpen, isLoading, isAuthenticated, user]);

  const handleVote = async () => {
    await withAuth(async () => {
      const isValid = await verifyAuthentication();
      if (!isValid) {
        return;
      }
      await onVote();
    });
  };

  if (!isOpen || isLoading) {
    return null;
  }
  
  if (!isAuthenticated || !authVerified) {
      return null
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <Dialog.Content className="sm:max-w-[425px] bg-white text-gray-900 rounded-lg shadow-xl">
        <Dialog.Header>
          <Dialog.Title className="text-2xl font-bold text-center">
            {t('vote.dialog.title', { defaultValue: '투표하기' })}
          </Dialog.Title>
        </Dialog.Header>

        {verificationError && (
          <div className="my-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-md">
            <p className="text-sm">{verificationError}</p>
          </div>
        )}

        {selectedArtist && (
          <div className="my-6">
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary shadow-lg flex-shrink-0">
                {selectedArtist.artist?.image ? (
                  <Image
                    src={`${process.env.NEXT_PUBLIC_CDN_URL}/${selectedArtist.artist.image}`}
                    alt={getLocalizedString(selectedArtist.artist.name)}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                    <span className="text-gray-500 text-xs">No Image</span>
                  </div>
                )}
              </div>
              <div className="flex-grow">
                <p className="text-sm text-gray-500">
                  {t('vote.dialog.artist_label', { defaultValue: '투표 대상' })}
                </p>
                <p className="font-bold text-xl">
                  {getLocalizedString(selectedArtist.artist?.name)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="my-6">
          <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
            {t('vote.dialog.vote_count_label', { defaultValue: '투표 수' })}
          </label>
          <div className="flex items-center justify-center space-x-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setVotes(Math.max(1, votes - 1))}
              disabled={votes <= 1}
              aria-label="투표 수 감소"
              className="rounded-full w-12 h-12"
            >
              <MinusIcon className="h-6 w-6" />
            </Button>
            <input
              type="number"
              min="1"
              value={votes}
              onChange={(e) => setVotes(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 text-center border-gray-300 rounded-lg p-2 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="투표 수 입력"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setVotes(votes + 1)}
              aria-label="투표 수 증가"
              className="rounded-full w-12 h-12"
            >
              <PlusIcon className="h-6 w-6" />
            </Button>
          </div>
        </div>

        <Dialog.Footer className="flex flex-col sm:flex-row sm:justify-end sm:space-x-2">
          <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">
            {t('vote.dialog.cancel_button', { defaultValue: '취소' })}
          </Button>
          <Button onClick={handleVote} disabled={!authVerified || !!verificationError} className="w-full sm:w-auto bg-primary hover:bg-primary-dark">
            {t('vote.dialog.vote_button', { defaultValue: '투표하기' })}
          </Button>
        </Dialog.Footer>

        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-2 bg-gray-100 rounded text-xs text-gray-600">
            <p>Auth Status: {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</p>
            <p>User ID: {user?.id || 'None'}</p>
            <p>Auth Verified: {authVerified ? 'Yes' : 'No'}</p>
          </div>
        )}
      </Dialog.Content>
    </Dialog>
  );
};

export default VoteDialogV2;
