export type VoteDisplayStatus = 'ongoing' | 'completed' | 'upcoming' | 'admin';

interface VoteTotalLike {
  vote_total?: number | null;
  deleted_at?: string | null;
}

export function filterActiveVoteItems<T extends { deleted_at?: string | null }>(
  items: Array<T | null | undefined>,
): T[] {
  return items.filter((item): item is T => Boolean(item && !item.deleted_at));
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
  return filterActiveVoteItems(items).reduce((total, item) => {
    return total + Math.max(0, item.vote_total ?? 0);
  }, 0);
}

export function runnerUpGap(
  items: Array<{ vote_total?: number | null; deleted_at?: string | null }>,
  status: VoteDisplayStatus,
): number | null {
  if (status !== 'ongoing') return null;
  const totals = filterActiveVoteItems(items)
    .map((item) => Math.max(0, item.vote_total ?? 0))
    .sort((a, b) => b - a);
  if (totals.length < 2) return null;
  const [first, second] = totals;
  const gap = first - second;
  if (gap <= 0) return null; // 1·2위 동률 포함
  if (totals.length >= 3 && totals[2] === second) return null; // 2위 동률 → 유일 2위 아님
  return gap;
}
