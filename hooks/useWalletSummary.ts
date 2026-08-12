import useSWR from 'swr';
import { useAuth } from '@/lib/supabase/auth-provider';
import type { WalletSummary } from '@/types/wallet';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useWalletSummary() {
  const { user } = useAuth();

  const { data, error, isLoading, mutate } = useSWR(
    user ? '/api/user/wallet' : null,
    fetcher,
  );

  const wallet: WalletSummary | null = data?.success ? data.wallet : null;

  return { wallet, isLoading, error, mutate };
}
