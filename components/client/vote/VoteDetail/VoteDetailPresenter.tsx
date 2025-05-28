'use client';

import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { useRouter } from 'next/navigation';
import { Vote, VoteItem, Reward } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { OngoingVoteItems } from '@/components/client/vote/list';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { useRequireAuth } from '@/hooks/useAuthGuard';

interface VoteDetailContentProps {
  id: string;
  initialData: {
    vote: Vote;
    voteItems: VoteItem[];
    rewards: Reward[];
    voteStatus: 'upcoming' | 'ongoing' | 'ended';
  };
}

interface VoteState {
  vote: Vote | null;
  voteItems: VoteItem[];
  rewards: Reward[];
  voteStatus: 'upcoming' | 'ongoing' | 'ended';
  isLoading: boolean;
  error: string | null;
}

const VoteDetailPresenter: React.FC<VoteDetailContentProps> = ({
  id,
  initialData,
}) => {
  const { supabase } = useSupabase();
  const router = useRouter();
  const { currentLanguage } = useLanguageStore();
  const { withAuth } = useRequireAuth({
    customLoginMessage: {
      title: '투표하려면 로그인이 필요합니다',
      description:
        '이 투표에 참여하려면 로그인이 필요합니다. 로그인하시겠습니까?',
    },
  });

  // 초기 데이터 확인
  console.log('[VoteDetailClient] 초기 데이터:', {
    id,
    voteId: initialData.vote.id,
    voteStatus: initialData.voteStatus,
    voteItemCount: initialData.voteItems.length,
    firstVoteItem: initialData.voteItems[0]
      ? {
          id: initialData.voteItems[0].id,
          vote_total: initialData.voteItems[0].vote_total || 0,
          hasArtist: !!initialData.voteItems[0].artist,
        }
      : 'No items',
  });

  // 투표 상태 초기화
  const [state, setState] = useState<VoteState>({
    vote: initialData.vote,
    voteItems: initialData.voteItems,
    rewards: initialData.rewards,
    voteStatus: initialData.voteStatus,
    isLoading: false,
    error: null,
  });

  // 사용자 참여 상태
  const [userVoteState, setUserVoteState] = useState({
    hasVoted: false,
    selectedItemId: null as string | null,
    isSubmitting: false,
    participationError: null as string | null,
  });

  // 사용자의 참여 여부 확인
  // 초기 데이터 재계산 (언어 변경 시)
  useEffect(() => {
    if (currentLanguage && id) {
      const refreshData = async () => {
        try {
          setState((prev) => ({ ...prev, isLoading: true }));

          // 타입 변환 필요: id가 문자열인데 숫자로 변환해야 함
          const numericId = parseInt(id, 10);
          if (isNaN(numericId)) {
            throw new Error('유효하지 않은 ID 형식입니다.');
          }

          // 데이터 다시 가져오기 (필요한 경우)
          const { data: voteData } = await supabase
            .from('vote')
            .select(
              `
              *,
              vote_item!vote_id (
                id,
                vote_id,
                artist_id,
                group_id,
                vote_total,
                created_at,
                updated_at,
                deleted_at,
                artist (
                  id,
                  name,
                  image,
                  artist_group (
                    id,
                    name
                  )
                )
              ),
              vote_reward (
                reward_id,
                reward:reward_id (*)
              )
            `,
            )
            .eq('id', numericId)
            .is('deleted_at', null)
            .single();

          if (voteData) {
            // 데이터 가공 (필요시)
            const formattedVote = {
              id: voteData.id,
              // Vote 인터페이스 요구사항에 맞는 속성 추가
              order: 0, // 기본값 설정 (Vote 인터페이스 요구사항)
              area: '', // 기본값 설정 (Vote 인터페이스 요구사항)
              deletedAt: voteData.deleted_at,
              startAt: voteData.start_at,
              stopAt: voteData.stop_at,
              createdAt: voteData.created_at,
              updatedAt: voteData.updated_at,
              mainImage: voteData.main_image,
              resultImage: voteData.result_image,
              waitImage: voteData.wait_image,
              voteCategory: voteData.vote_category,
              voteContent: voteData.vote_content,
              voteSubCategory: voteData.vote_sub_category,
              visibleAt: voteData.visible_at,
              title: voteData.title || '제목 없음',
            };

            const formattedVoteItems = voteData.vote_item
              ? voteData.vote_item.map((item: any) => ({
                  ...item,
                  id: item.id,
                  deletedAt: item.deleted_at,
                  createdAt: item.created_at,
                  updatedAt: item.updated_at,
                  voteId: item.vote_id,
                  artistId: item.artist_id,
                  groupId: item.group_id,
                  voteTotal: item.vote_total || 0,
                  artist: item.artist
                    ? {
                        ...item.artist,
                        id: item.artist.id,
                        name: item.artist.name,
                        image: item.artist.image,
                        artistGroup: item.artist.artist_group, // 네이밍 수정
                      }
                    : null,
                }))
              : [];

            const formattedRewards = voteData.vote_reward
              ? voteData.vote_reward.map((vr: any) => vr.reward).filter(Boolean)
              : [];

            // 투표 상태 재계산
            const now = new Date();
            const startDate = new Date(formattedVote.startAt as string);
            const endDate = new Date(formattedVote.stopAt as string);

            // 정확한 날짜 비교를 위해 시간값 사용
            let voteStatus: 'upcoming' | 'ongoing' | 'ended' = 'upcoming';
            const nowTime = now.getTime();
            const startTime = startDate.getTime();
            const endTime = endDate.getTime();

            if (nowTime < startTime) {
              voteStatus = 'upcoming';
              console.log('[VoteDetail] 상태: 예정 투표', {
                현재: now.toLocaleString(),
                시작: startDate.toLocaleString(),
                종료: endDate.toLocaleString(),
              });
            } else if (nowTime < endTime) {
              voteStatus = 'ongoing';
              console.log('[VoteDetail] 상태: 진행 중 투표', {
                현재: now.toLocaleString(),
                시작: startDate.toLocaleString(),
                종료: endDate.toLocaleString(),
              });
            } else {
              voteStatus = 'ended';
              console.log('[VoteDetail] 상태: 종료된 투표', {
                현재: now.toLocaleString(),
                시작: startDate.toLocaleString(),
                종료: endDate.toLocaleString(),
              });
            }

            setState({
              vote: voteData as Vote, // 타입 변환
              voteItems: formattedVoteItems as VoteItem[],
              rewards: formattedRewards as Reward[],
              voteStatus,
              isLoading: false,
              error: null,
            });
          }
        } catch (error) {
          console.error('데이터 새로 고침 오류:', error);
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: '데이터를 업데이트하는 중 오류가 발생했습니다.',
          }));
        }
      };

      refreshData();
    }
  }, [currentLanguage, id, supabase]);

  // 투표 항목 선택 핸들러
  const handleSelectItem = (itemId: string) => {
    console.log('🎯 [VoteDetail] handleSelectItem 시작:', {
      itemId,
      voteStatus: state.voteStatus,
      hasVoted: userVoteState.hasVoted,
      timestamp: new Date().toISOString(),
    });

    if (state.voteStatus !== 'ongoing') {
      console.log('❌ [VoteDetail] 투표가 진행 중이 아님:', state.voteStatus);
      return;
    }

    if (userVoteState.hasVoted) {
      console.log('❌ [VoteDetail] 이미 투표함');
      return;
    }

    console.log('🔐 [VoteDetail] 인증 체크 시작 - withAuth 호출');

    // 인증이 필요한 투표 선택
    withAuth(async () => {
      console.log('✅ [VoteDetail] withAuth 내부 - 인증 성공, 투표 항목 선택');

      setUserVoteState((prev) => ({
        ...prev,
        selectedItemId: itemId,
      }));

      console.log('✅ [VoteDetail] 투표 항목 선택 완료:', itemId);
    }).catch((error) => {
      console.log('❌ [VoteDetail] 인증 실패 또는 오류:', error);
    });
  };

  // 투표 데이터 새로고침
  const refreshVoteData = async () => {
    try {
      // 로딩 상태 시작
      setState((prev) => ({
        ...prev,
        isLoading: true,
      }));

      // ID를 숫자로 변환
      const numericId = parseInt(id, 10);
      if (isNaN(numericId)) {
        throw new Error('유효하지 않은 ID 형식입니다.');
      }

      console.log('[VoteDetailClient] 투표 데이터 새로고침 시작');

      // 투표 항목 데이터 다시 가져오기
      const { data: voteItemsData, error: voteItemsError } = await supabase
        .from('vote_item')
        .select(
          `
          id,
          vote_id,
          artist_id,
          group_id,
          vote_total,
          created_at,
          updated_at,
          deleted_at,
          artist (
            id,
            name,
            image,
            artist_group (
              id,
              name
            )
          )
        `,
        )
        .eq('vote_id', numericId)
        .is('deleted_at', null);

      if (voteItemsError) {
        throw voteItemsError;
      }

      // 데이터 변환 및 처리 시 깊은 복사 보장
      const formattedVoteItems = voteItemsData.map((item: any) => {
        // 아티스트 정보 처리 - 깊은 복사 및 구조 정규화
        const artist = item.artist
          ? {
              ...item.artist,
              id: item.artist.id,
              name: item.artist.name,
              image: item.artist.image,
              // artistGroup과 artist_group 둘 다 지원
              artistGroup: item.artist.artist_group || item.artist.artistGroup,
            }
          : null;

        return {
          ...item,
          id: item.id,
          deletedAt: item.deleted_at,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          voteId: item.vote_id,
          artistId: item.artist_id,
          groupId: item.group_id,
          voteTotal: item.vote_total || 0,
          artist: artist,
        };
      });

      console.log(
        '[VoteDetailClient] 투표 항목 데이터 처리 완료:',
        formattedVoteItems.length,
        '개',
      );

      // 상태 업데이트 - 로딩 완료, 새 데이터 설정
      setState((prev) => ({
        ...prev,
        voteItems: formattedVoteItems as VoteItem[],
        isLoading: false,
      }));

      console.log('[VoteDetailClient] 데이터 새로고침 완료');
    } catch (error) {
      console.error('[VoteDetailClient] 투표 데이터 새로고침 오류:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: '데이터를 업데이트하는 중 오류가 발생했습니다.',
      }));
    }
  };

  // 로딩 중일 때 표시할 내용
  if (state.isLoading) {
    return <LoadingSpinner />;
  }

  // 오류가 있을 때 표시할 내용
  if (state.error) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[300px] text-center'>
        <p className='text-red-500'>{state.error}</p>
        <button
          className='mt-4 px-4 py-2 bg-primary text-white rounded'
          onClick={refreshVoteData}
        >
          다시 시도
        </button>
      </div>
    );
  }

  // 투표 데이터가 없을 때 표시할 내용
  if (!state.vote) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[300px] text-center'>
        <p className='text-gray-500'>투표 정보를 찾을 수 없습니다.</p>
      </div>
    );
  }

  // 제목 정보 표시를 위한 헬퍼 함수
  const renderTitle = () => {
    if (!state.vote) return '제목 없음';

    if (typeof state.vote.title === 'string') {
      return state.vote.title;
    } else if (state.vote.title && typeof state.vote.title === 'object') {
      // 다국어 제목 처리
      const titleObj = state.vote.title as { ko?: string; en?: string };
      return titleObj.ko || titleObj.en || '제목 없음';
    }
    return '제목 없음';
  };

  // vote가 null이 아닌 것이 확실한 시점
  const vote = state.vote;

  return (
    <div className='container mx-auto px-4 py-8'>
      {/* 투표 헤더 */}
      <div className='mb-8'>
        <h1 className='text-3xl font-bold mb-2'>{renderTitle()}</h1>
        <p className='text-gray-600'>
          {new Date(vote.start_at as string).toLocaleDateString()} ~
          {new Date(vote.stop_at as string).toLocaleDateString()}
        </p>
      </div>

      {/* 투표 상태 표시 */}
      <div className='mb-6'>
        {state.voteStatus === 'upcoming' && (
          <div className='bg-blue-100 text-blue-800 px-4 py-2 rounded'>
            투표 예정 - {new Date(vote.start_at as string).toLocaleString()}부터
            시작됩니다.
          </div>
        )}
        {state.voteStatus === 'ongoing' && (
          <div className='bg-green-100 text-green-800 px-4 py-2 rounded'>
            투표 진행 중 - {new Date(vote.stop_at as string).toLocaleString()}에
            종료됩니다.
          </div>
        )}
        {state.voteStatus === 'ended' && (
          <div className='bg-gray-100 text-gray-800 px-4 py-2 rounded'>
            투표 종료 - {new Date(vote.stop_at as string).toLocaleString()}에
            종료되었습니다.
          </div>
        )}
      </div>

      {/* 투표 내용 */}
      <div className='mb-8'>
        <p className='whitespace-pre-line'>{vote.vote_content}</p>
      </div>

      {/* 진행 중 투표의 경우 상위 3개 항목 표시 */}
      {state.voteStatus === 'ongoing' && (
        <div className='mb-8 bg-gray-50/80 p-4 rounded-lg shadow-sm'>
          <h2 className='text-xl font-bold text-center mb-4'>현재 투표 순위</h2>
          {/* 디버깅 정보 */}
          {process.env.NODE_ENV === 'development' && (
            <div className='text-xs text-gray-500 mb-2 bg-gray-100 p-1 rounded'>
              <p>
                항목 수: {state.voteItems.length}, 상태: {state.voteStatus},
                첫번째 항목 ID: {state.voteItems[0]?.id || 'none'}
              </p>
            </div>
          )}
          {/* OngoingVoteItems에 정확한 데이터 구조로 vote 객체 전달 */}
          <OngoingVoteItems
            vote={{
              ...vote,
              voteItem: state.voteItems,
            }}
            onVoteChange={(voteId, itemId, newTotal) => {
              console.log(
                `투표 변경 - 항목: ${itemId}, 새 투표수: ${newTotal}`,
              );
              refreshVoteData();
            }}
          />
        </div>
      )}

      {/* 종료된 투표의 경우 최종 결과 표시 */}
      {state.voteStatus === 'ended' && (
        <div className='mb-8 bg-gray-50/80 p-4 rounded-lg shadow-sm'>
          <h2 className='text-xl font-bold text-center mb-4'>최종 투표 결과</h2>
          {/* 디버깅 정보 */}
          {process.env.NODE_ENV === 'development' && (
            <div className='text-xs text-gray-500 mb-2 bg-gray-100 p-1 rounded'>
              <p>
                항목 수: {state.voteItems.length}, 상태: {state.voteStatus}
              </p>
            </div>
          )}
          <OngoingVoteItems
            vote={{
              ...vote,
              voteItem: state.voteItems,
            }}
          />
        </div>
      )}

      {/* 예정된 투표의 경우 안내 메시지 표시 */}
      {state.voteStatus === 'upcoming' && (
        <div className='mb-8 bg-blue-50/80 p-4 rounded-lg shadow-sm text-center'>
          <h2 className='text-xl font-bold mb-4'>투표 예정</h2>
          <p className='text-blue-800 mb-4'>
            이 투표는 {new Date(vote.start_at as string).toLocaleString()}부터
            시작됩니다.
            <br />
            투표가 시작되면 이곳에서 참여할 수 있습니다.
          </p>

          {/* 예정된 투표에서도 아티스트 목록 표시 */}
          {state.voteItems.length > 0 && (
            <div className='mt-6 pt-4 border-t border-blue-200'>
              <h3 className='text-lg font-semibold mb-4'>투표 예정 아티스트</h3>
              <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
                {state.voteItems.map((item, index) => (
                  <div
                    key={`upcoming-item-${item.id}`}
                    className='border border-blue-100 rounded-lg p-3 bg-white/80'
                  >
                    {/* 아티스트 이미지 */}
                    {item.artist?.image && (
                      <div className='aspect-square mb-3 overflow-hidden rounded'>
                        <img
                          src={getCdnImageUrl(item.artist.image)}
                          alt={
                            getLocalizedString(
                              item.artist.name,
                              currentLanguage,
                            ) || '아티스트'
                          }
                          className='w-full h-full object-cover'
                          loading={index < 8 ? 'eager' : 'lazy'}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = '/images/default-artist.png';
                            target.onerror = null;
                          }}
                        />
                      </div>
                    )}

                    {/* 아티스트 정보 */}
                    <h4 className='font-medium text-gray-800'>
                      {getLocalizedString(item.artist?.name, currentLanguage) ||
                        '아티스트'}
                    </h4>
                    {item.artist?.artistGroup?.name && (
                      <p className='text-sm text-gray-600'>
                        {getLocalizedString(
                          item.artist.artistGroup.name,
                          currentLanguage,
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 참여 오류 메시지 */}
      {userVoteState.participationError && (
        <div className='bg-red-100 text-red-800 px-4 py-2 rounded mb-6'>
          {userVoteState.participationError}
        </div>
      )}

      {/* 투표 항목 목록 */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8'>
        {/* 투표 상태에 따라 다른 메시지나 인터페이스 표시 */}
        {state.voteStatus === 'upcoming' && (
          <div className='col-span-full text-center py-4 bg-blue-50 rounded'>
            <p className='text-blue-800'>
              투표 시작 후 이곳에서 참여할 수 있습니다.
            </p>
          </div>
        )}

        {state.voteStatus === 'ongoing' &&
          state.voteItems.map((item, index) => {
            // ID를 문자열로 변환하여 비교
            const itemId = String(item.id);
            return (
              <div
                key={itemId}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  userVoteState.selectedItemId === itemId
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-200 hover:border-primary'
                } ${userVoteState.hasVoted ? 'opacity-80' : ''}`}
                onClick={() => handleSelectItem(itemId)}
              >
                {/* 투표 항목 이미지 */}
                {item.artist?.image && (
                  <div className='aspect-square mb-3 overflow-hidden rounded'>
                    <img
                      src={getCdnImageUrl(item.artist.image)}
                      alt={String(item.artist.name) || '아티스트'}
                      className='w-full h-full object-cover'
                      loading={index < 8 ? 'eager' : 'lazy'} // 처음 8개 항목만 즉시 로드
                      onError={(e) => {
                        console.warn(
                          `이미지 로드 실패: ${
                            item.artist?.image || 'unknown'
                          }`,
                        );
                        const target = e.target as HTMLImageElement;
                        target.src = '/images/default-artist.png';
                        target.onerror = null; // 추가 오류 방지
                      }}
                    />
                  </div>
                )}

                {/* 투표 항목 정보 */}
                <h3 className='text-lg font-semibold mb-1'>
                  {getLocalizedString(item.artist?.name, currentLanguage)}
                </h3>
                {item.artist?.artistGroup?.name && (
                  <p className='text-sm text-gray-600 mb-2'>
                    {getLocalizedString(
                      item.artist.artistGroup.name,
                      currentLanguage,
                    )}
                  </p>
                )}

                {/* 선택 표시 */}
                {userVoteState.selectedItemId === itemId && (
                  <div className='mt-2 text-primary font-semibold'>
                    {userVoteState.hasVoted ? '투표함' : '선택됨'}
                  </div>
                )}
              </div>
            );
          })}

        {state.voteStatus === 'ended' &&
          state.voteItems
            .sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0))
            .map((item, index) => {
              // ID를 문자열로 변환하여 비교
              const itemId = String(item.id);
              return (
                <div
                  key={itemId}
                  className={`border rounded-lg p-4 transition-all ${
                    userVoteState.selectedItemId === itemId
                      ? 'border-primary bg-primary/10'
                      : 'border-gray-200'
                  }`}
                >
                  {/* 투표 항목 이미지 */}
                  {item.artist?.image && (
                    <div className='aspect-square mb-3 overflow-hidden rounded'>
                      <img
                        src={getCdnImageUrl(item.artist.image)}
                        alt={String(item.artist.name) || '아티스트'}
                        className='w-full h-full object-cover'
                        loading={index < 8 ? 'eager' : 'lazy'} // 처음 8개 항목만 즉시 로드
                        onError={(e) => {
                          console.warn(
                            `이미지 로드 실패: ${
                              item.artist?.image || 'unknown'
                            }`,
                          );
                          const target = e.target as HTMLImageElement;
                          target.src = '/images/default-artist.png';
                          target.onerror = null; // 추가 오류 방지
                        }}
                      />
                    </div>
                  )}

                  {/* 투표 항목 정보 */}
                  <h3 className='text-lg font-semibold mb-1'>
                    {String(item.artist?.name) || '항목 이름'}
                  </h3>
                  {item.artist?.artistGroup?.name && (
                    <p className='text-sm text-gray-600 mb-2'>
                      {String(item.artist.artistGroup.name)}
                    </p>
                  )}

                  {/* 투표 수 표시 */}
                  <p className='mt-2 font-semibold'>
                    {item.vote_total?.toLocaleString()} 표
                  </p>

                  {/* 사용자가 이 항목에 투표했는지 표시 */}
                  {userVoteState.selectedItemId === itemId && (
                    <div className='mt-2 text-primary font-semibold'>
                      투표함
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {/* 투표 버튼 */}
      {state.voteStatus === 'ongoing' && !userVoteState.hasVoted && (
        <div className='flex justify-center'>
          <button
            className={`px-6 py-3 rounded-full text-white font-medium ${
              userVoteState.selectedItemId && !userVoteState.isSubmitting
                ? 'bg-primary hover:bg-primary/90'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
            onClick={async () => {
              if (!userVoteState.selectedItemId || userVoteState.isSubmitting)
                return;

              // 인증이 필요한 투표 액션을 실행
              await withAuth(async () => {
                // TODO: 실제 투표 로직 구현
                console.log('투표 실행:', {
                  voteId: vote.id,
                  itemId: userVoteState.selectedItemId,
                });

                setUserVoteState((prev) => ({
                  ...prev,
                  isSubmitting: true,
                }));

                try {
                  // 실제 투표 API 호출 로직
                  // await submitVote(vote.id, userVoteState.selectedItemId);

                  // 임시로 투표 완료 상태로 변경
                  setUserVoteState((prev) => ({
                    ...prev,
                    hasVoted: true,
                    isSubmitting: false,
                  }));
                } catch (error) {
                  console.error('투표 오류:', error);
                  setUserVoteState((prev) => ({
                    ...prev,
                    isSubmitting: false,
                    participationError: '투표 중 오류가 발생했습니다.',
                  }));
                }
              });
            }}
            disabled={
              !userVoteState.selectedItemId || userVoteState.isSubmitting
            }
          >
            {userVoteState.isSubmitting ? '처리 중...' : '투표하기'}
          </button>
        </div>
      )}

      {/* 리워드 정보 (있는 경우) */}
      {state.rewards.length > 0 && (
        <div className='mt-12'>
          <h2 className='text-2xl font-bold mb-4'>리워드</h2>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {state.rewards.map((reward) => (
              <div key={String(reward.id)} className='border rounded-lg p-4'>
                <h3 className='text-lg font-semibold mb-2'>
                  {typeof reward.title === 'string'
                    ? reward.title
                    : typeof reward.title === 'object'
                    ? JSON.stringify(reward.title)
                    : '리워드'}
                </h3>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VoteDetailPresenter;
