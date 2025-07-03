'use server';

import { Products } from '@/types/interfaces';
import createClient from '@/utils/supabase-server-client';
import { StarCandyProductsPresenter } from '@/components/client/star-candy/StarCandyProductsPresenter';

interface StarCandyProductsFetcherProps {
  className?: string;
}

export default async function StarCandyProductsFetcherServer({ className }: StarCandyProductsFetcherProps) {
  const supabase = await createClient();
  let products: Products[] = [];
  let error: string | null = null;

  try {
    const { data, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('product_type', 'consumable')
      .not('star_candy', 'is', null)
      .or('web_price_krw.not.is.null,web_price_usd.not.is.null')
      .order('web_display_order', { ascending: true, nullsFirst: false })
      .order('star_candy', { ascending: true })
      .limit(20);

    if (fetchError) throw fetchError;
    if (!data) {
      products = [];
    } else {
      // 이미 쿼리에서 필터링했지만 추가 안전장치
      products = data.filter(
        (product) => product.web_price_krw || product.web_price_usd
      );
    }

    if (products.length === 0) {
      error = '웹 가격 정보가 설정되지 않았습니다. 관리자에게 문의하세요.';
    }
  } catch (err) {
    if (err instanceof Error) {
      error = err.message;
    } else {
      error = 'Unknown error occurred';
    }
  }

  return (
    <StarCandyProductsPresenter
      products={products}
      error={error}
      className={className}
    />
  );
} 