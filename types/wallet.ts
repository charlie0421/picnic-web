export interface WalletSummary {
  contract_version: string;
  star: string;
  bonus: string;
  cotton: string;
  cotton_expiring_amount: string;
  cotton_next_expires_at: string | null;
  snapshot_at: string;
}

export interface VoteUsage {
  cotton_candy_usage: string;
  star_candy_bonus_usage: string;
  star_candy_usage: string;
}

export interface VoteSubmitResult {
  votePickId: number;
  updatedVoteTotal: number;
  addedVoteTotal: number;
  updatedAt: string;
  operation_id: string;
  replayed: boolean;
  usage: VoteUsage;
  wallet: WalletSummary;
}

export interface CurrencyHistoryItem {
  id: string;
  currency: 'STAR_CANDY' | 'BONUS_STAR_CANDY' | 'COTTON_CANDY';
  event_type: string;
  origin: string;
  delta: string;
  balance_effect: string;
  expires_at: string | null;
  purchase_id: string | null;
  refund_id: string | null;
  grant_id: string | null;
  operation_id: string | null;
  created_at: string;
}

export interface CurrencyHistoryPage {
  items: CurrencyHistoryItem[];
  // RPC 가 개수를 주지 않을 수 있다. 없는 값을 '0' 으로 위장하지 않는다.
  total_count: string | null;
  next_cursor: string | null;
  snapshot_at: string | null;
}
