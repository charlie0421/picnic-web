export type VoteDisplayStatus = 'ongoing' | 'completed' | 'upcoming' | 'admin';

interface VoteTotalLike {
  vote_total?: number | null;
  deleted_at?: string | null;
}

interface FormatCandidateVoteOptions {
  votes: number | null | undefined;
  totalVotes: number;
  status: VoteDisplayStatus;
  isAdmin?: boolean;
  includeVoteUnit?: boolean;
}

export function sharePercentDecimals(percentage: number): number {
  if (percentage <= 0) return 2;
  const magnitude = Math.floor(Math.log10(percentage));
  return Math.min(4, Math.max(2, 2 - magnitude - 1));
}

export function formatVoteShare(
  votes: number | null | undefined,
  totalVotes: number,
): string {
  const normalizedVotes = votes ?? 0;
  if (normalizedVotes <= 0 || totalVotes <= 0) return '—';

  const percentage = (normalizedVotes / totalVotes) * 100;
  if (percentage < 0.0001) return '<0.0001%';

  return `${percentage.toFixed(sharePercentDecimals(percentage))}%`;
}

export function formatCandidateVote({
  votes,
  totalVotes,
  status,
  isAdmin = false,
  includeVoteUnit = false,
}: FormatCandidateVoteOptions): string {
  const normalizedVotes = Math.max(0, votes ?? 0);

  if (status === 'upcoming') return '—';
  if (status === 'completed') {
    const raw = normalizedVotes.toLocaleString('en-US');
    return includeVoteUnit ? `${raw} 표` : raw;
  }

  const share = formatVoteShare(normalizedVotes, totalVotes);
  if (!isAdmin || share === '—') return share;

  return `${share} (${normalizedVotes.toLocaleString('en-US')})`;
}

export function sumVoteTotals(
  items: Array<VoteTotalLike | null | undefined>,
): number {
  return items.reduce((total, item) => {
    if (!item || item.deleted_at) return total;
    return total + Math.max(0, item.vote_total ?? 0);
  }, 0);
}
