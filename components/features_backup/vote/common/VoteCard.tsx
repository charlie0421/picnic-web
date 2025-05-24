import { Card } from '@/components/common';
import { Vote } from '../types';
import { getVoteStatus, formatRemainingTime, formatTimeUntilStart, getRemainingTime } from '../../../server/utils';
import { VoteStatus } from './VoteStatus';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { useLanguageStore } from '@/stores/languageStore';

export interface VoteCardProps {
  vote: Vote;
  onClick?: () => void;
  className?: string;
}

export function VoteCard({ vote, onClick, className }: VoteCardProps) {
  const { currentLanguage } = useLanguageStore();
  const status = getVoteStatus(vote);
  
  // 투표 제목 가져오기
  const voteTitle = vote.title 
    ? getLocalizedString(vote.title, currentLanguage) || '투표'
    : '투표';
  
  // 이미지 URL 가져오기
  const imageUrl = vote.main_image ? getCdnImageUrl(vote.main_image) : null;
  
  // 전체 투표수 계산 (voteItem이 있으면 합계 계산)
  const totalVotes = vote.voteItem?.reduce((sum, item) => sum + (item.vote_total || 0), 0) || 0;
  
  return (
    <Card 
      hoverable={!!onClick}
      className={className}
    >
      <div onClick={onClick} className="cursor-pointer">
        {imageUrl && (
          <div className="aspect-video w-full overflow-hidden rounded-t-lg">
            <img 
              src={imageUrl} 
              alt={voteTitle}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        )}
        
        <Card.Body>
          <div className="flex items-start justify-between gap-4 mb-2">
            <h3 className="text-lg font-semibold">{voteTitle}</h3>
            <VoteStatus status={status} />
          </div>
          
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
            {vote.vote_content || ''}
          </p>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {status === 'upcoming' && vote.start_at && `${formatTimeUntilStart(vote.start_at)}`}
              {status === 'ongoing' && vote.stop_at && (() => {
                const remaining = getRemainingTime(vote.stop_at);
                return formatRemainingTime(remaining);
              })()}
              {status === 'completed' && '투표 종료'}
            </span>
            
            <span className="text-gray-500">
              참여 {totalVotes.toLocaleString()}명
            </span>
          </div>
        </Card.Body>
      </div>
    </Card>
  );
} 