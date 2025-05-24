'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Vote, VoteItem } from '../types';
import { getVoteStatus, formatRemainingTime, formatTimeUntilStart } from '../../../server/utils';
import { VoteCard } from '../common/VoteCard';
import { VoteTimer } from './VoteTimer';
import { VoteSearch } from './VoteSearch';
import { VoteButton } from './VoteButton';
import { Badge, Card } from '@/components/common';
import { useLanguageStore } from '@/stores/languageStore';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';

export interface VoteDetailPresenterProps {
  vote: Vote;
  initialItems: VoteItem[];
  rewards?: any[]; // TODO: Reward 타입 정의
  className?: string;
}

export function VoteDetailPresenter({ 
  vote, 
  initialItems,
  rewards = [],
  className 
}: VoteDetailPresenterProps) {
  const { currentLanguage } = useLanguageStore();
  const [voteItems, setVoteItems] = useState<VoteItem[]>(initialItems);
  const [selectedItem, setSelectedItem] = useState<VoteItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isVoting, setIsVoting] = useState(false);
  
  const voteStatus = getVoteStatus(vote);
  const canVote = voteStatus === 'ongoing';
  
  // 투표 아이템 랭킹 계산
  const rankedVoteItems = useMemo(() => {
    if (!voteItems.length) return [];
    
    const sortedItems = [...voteItems].sort(
      (a, b) => (b.vote_total || 0) - (a.vote_total || 0)
    );
    
    let currentRank = 1;
    let currentScore = sortedItems[0]?.vote_total || 0;
    
    return sortedItems.map((item, index) => {
      if (index > 0 && currentScore !== (item.vote_total || 0)) {
        currentRank = index + 1;
        currentScore = item.vote_total || 0;
      }
      
      return {
        ...item,
        rank: currentRank,
      };
    });
  }, [voteItems]);
  
  // 검색 필터링
  const filteredItems = useMemo(() => {
    if (!searchQuery) return rankedVoteItems;
    
    return rankedVoteItems.filter(item => {
      const artistName = item.artist?.name 
        ? getLocalizedString(item.artist.name, currentLanguage)?.toLowerCase() || ''
        : '';
      const query = searchQuery.toLowerCase();
      return artistName.includes(query);
    });
  }, [rankedVoteItems, searchQuery, currentLanguage]);
  
  const handleVote = async (voteId: string | number, itemId: string | number) => {
    setIsVoting(true);
    try {
      // TODO: 실제 투표 API 호출
      console.log('Voting for:', { voteId, itemId });
      
      // 임시로 투표수 증가
      setVoteItems(prev => 
        prev.map(item => 
          item.id === Number(itemId) 
            ? { ...item, vote_total: (item.vote_total || 0) + 1 }
            : item
        )
      );
    } catch (error) {
      console.error('Vote error:', error);
    } finally {
      setIsVoting(false);
      setSelectedItem(null);
    }
  };
  
  // 투표 제목 가져오기
  const voteTitle = vote.title 
    ? getLocalizedString(vote.title, currentLanguage) || '투표'
    : '투표';
  
  // 투표 내용 가져오기
  const voteContent = vote.vote_content || '';
  
  // 전체 투표수 계산
  const totalVotes = voteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0);
  
  return (
    <div className={className}>
      {/* 헤더 정보 */}
      <Card className="mb-6">
        <Card.Header>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-2">{voteTitle}</h1>
              <p className="text-gray-600">{voteContent}</p>
            </div>
            <Badge variant={
              voteStatus === 'ongoing' ? 'success' : 
              voteStatus === 'upcoming' ? 'info' : 
              'default'
            }>
              {voteStatus === 'ongoing' && '진행중'}
              {voteStatus === 'upcoming' && '예정'}
              {voteStatus === 'completed' && '종료'}
            </Badge>
          </div>
        </Card.Header>
        <Card.Footer>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              참여 {totalVotes.toLocaleString()}명
            </span>
            {voteStatus === 'ongoing' && vote.stop_at && (
              <VoteTimer endTime={vote.stop_at} />
            )}
            {voteStatus === 'upcoming' && vote.start_at && (
              <span className="text-sm">
                {formatTimeUntilStart(vote.start_at)}
              </span>
            )}
          </div>
        </Card.Footer>
      </Card>
      
      {/* 검색 바 */}
      <div className="mb-6">
        <VoteSearch
          onSearch={setSearchQuery}
          searchResults={filteredItems}
          totalItems={rankedVoteItems.length}
          disabled={!canVote}
        />
      </div>
      
      {/* 상위 3위 표시 */}
      {voteStatus !== 'upcoming' && rankedVoteItems.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-4">TOP 3</h2>
          <div className="grid grid-cols-3 gap-4">
            {rankedVoteItems.slice(0, 3).map((item) => {
              const artistName = item.artist?.name 
                ? getLocalizedString(item.artist.name, currentLanguage) || '아티스트'
                : '아티스트';
              
              return (
                <Card key={item.id} hoverable={canVote}>
                  <Card.Body>
                    <div className="text-center">
                      <div className="text-3xl font-bold mb-2">
                        {item.rank === 1 && '🥇'}
                        {item.rank === 2 && '🥈'}
                        {item.rank === 3 && '🥉'}
                      </div>
                      <h3 className="font-semibold">{artistName}</h3>
                      <p className="text-2xl font-bold text-blue-600 mt-2">
                        {(item.vote_total || 0).toLocaleString()}
                      </p>
                    </div>
                  </Card.Body>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      
      {/* 투표 아이템 그리드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredItems.map((item) => {
          const artistName = item.artist?.name 
            ? getLocalizedString(item.artist.name, currentLanguage) || '아티스트'
            : '아티스트';
          const imageUrl = item.artist?.image 
            ? getCdnImageUrl(item.artist.image)
            : '/images/default-artist.png';
          
          return (
            <Card 
              key={item.id} 
              hoverable={canVote}
              className={!canVote ? 'opacity-75' : ''}
            >
              <Card.Body>
                <div className="text-center">
                  <img 
                    src={imageUrl} 
                    alt={artistName}
                    className="w-full h-32 object-cover rounded mb-2"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/images/default-artist.png';
                      target.onerror = null;
                    }}
                  />
                  <h3 className="font-semibold mb-1">{artistName}</h3>
                  {item.artist?.artistGroup?.name && (
                    <p className="text-sm text-gray-600 mb-2">
                      {getLocalizedString(item.artist.artistGroup.name, currentLanguage)}
                    </p>
                  )}
                  <p className="text-lg font-bold text-blue-600">
                    {(item.vote_total || 0).toLocaleString()} 표
                  </p>
                  {item.rank && (
                    <p className="text-sm text-gray-500">
                      {item.rank}위
                    </p>
                  )}
                </div>
              </Card.Body>
              {canVote && (
                <Card.Footer>
                  <VoteButton
                    voteId={String(vote.id)}
                    voteItemId={String(item.id)}
                    onVote={handleVote}
                    disabled={isVoting}
                    hasVoted={false} // TODO: 사용자 투표 여부 확인
                  />
                </Card.Footer>
              )}
            </Card>
          );
        })}
      </div>
      
      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">검색 결과가 없습니다.</p>
        </div>
      )}
    </div>
  );
} 