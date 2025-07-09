import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, createServerSupabaseClient } from '@/lib/supabase/server';

interface AppPurchaseItem {
  id: string;
  receiptId: string;
  receiptNumber: string;
  receiptUrl?: string;
  amount: number;
  starCandyAmount: number;
  bonusAmount: number;
  paymentMethod: string; // 추가
  paymentProvider: string; // 추가
  platform: string; // 'ios' or 'android'
  storeProductId: string;
  transactionId: string;
  merchantTransactionId?: string; // 추가
  status: string;
  currency: string;
  exchangeRate?: number; // 추가
  originalAmount?: number; // 추가
  originalCurrency?: string; // 추가
  paymentDetails: { // 추가
    cardLast4?: string;
    cardBrand?: string;
    bankName?: string;
    paypalEmail?: string;
  };
  receiptData: { // 추가
    itemName: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxAmount?: number;
    discountAmount?: number;
  };
  metadata?: { // 추가
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
  };
  createdAt: string;
  updatedAt: string; // 추가
  receiptGeneratedAt?: string; // 추가
  appStoreData: {
    originalTransactionId?: string; // Apple
    purchaseToken?: string; // Google Play
    orderId?: string; // Google Play
    bundleId?: string; // Apple
    packageName?: string; // Google Play
  };
}

interface RechargeResponse {
  success: boolean;
  data: AppPurchaseItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  statistics: {
    totalPurchases: number;
    totalAmount: number;
    totalStarCandy: number;
  };
  error?: string;
  message?: string;
}

export async function GET(request: NextRequest) {
  try {
    console.log('📱 [Recharge History API] 앱구매 영수증 조회 시작');

    // 1. 사용자 인증 확인
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    console.log('📱 [Recharge History API] 파라미터:', { 
      userId: user.id, 
      page, 
      limit, 
      offset 
    });

    // 3. Supabase 클라이언트 생성
    const supabase = await createServerSupabaseClient();

    // 디버깅: 사용자의 모든 영수증 데이터 확인
    console.log('🔍 [DEBUG] 사용자의 모든 영수증 데이터 확인 시작');
    
    const { data: allReceipts, error: allReceiptsError } = await supabase
      .from('receipts')
      .select('id, user_id, status, platform, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    
    console.log('🔍 [DEBUG] 사용자의 모든 영수증:', {
      count: allReceipts?.length || 0,
      receipts: allReceipts?.map(r => ({
        id: r.id,
        status: r.status,
        platform: r.platform,
        created_at: r.created_at
      })) || []
    });

    // 디버깅: 각 조건별 데이터 수량 확인
    const { count: totalUserReceipts } = await supabase
      .from('receipts')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);
    
    const { count: completedReceipts } = await supabase
      .from('receipts')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'completed');
      
    const { count: appReceipts } = await supabase
      .from('receipts')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .in('platform', ['ios', 'android']);

    console.log('🔍 [DEBUG] 조건별 데이터 수량:', {
      totalUserReceipts,
      completedReceipts,
      appReceipts
    });

    // 4. 앱구매 영수증 조회 (completed 상태만)
    const { data: receipts, error: receiptsError, count } = await supabase
      .from('receipts')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .in('platform', ['ios', 'android', 'web']) // 웹 결제도 포함
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (receiptsError) {
      console.error('❌ [Recharge History API] 영수증 조회 실패:', receiptsError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to fetch recharge history',
          message: receiptsError.message 
        },
        { status: 500 }
      );
    }

    console.log('✅ [Recharge History API] 기본 쿼리 결과:', {
      count: receipts?.length || 0,
      totalCount: count
    });

    // 5. 만약 기본 조건으로 데이터가 없다면, 조건을 완화하여 재시도
    let finalReceipts = receipts;
    let finalCount = count;

    if (!receipts || receipts.length === 0) {
      console.log('⚠️ [DEBUG] 기본 조건에서 데이터 없음, 조건 완화하여 재시도');
      
      // 조건 완화 1: 상태 조건 제거하고 플랫폼만 확인
      const { data: fallbackReceipts1, count: fallbackCount1 } = await supabase
        .from('receipts')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .in('platform', ['ios', 'android', 'web'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      console.log('🔍 [DEBUG] 상태 조건 제거 결과:', {
        count: fallbackReceipts1?.length || 0,
        totalCount: fallbackCount1
      });

      if (fallbackReceipts1 && fallbackReceipts1.length > 0) {
        finalReceipts = fallbackReceipts1;
        finalCount = fallbackCount1;
        console.log('✅ [DEBUG] 상태 조건 제거 후 데이터 발견');
      } else {
        // 조건 완화 2: 플랫폼 조건도 제거하고 모든 영수증 조회
        const { data: fallbackReceipts2, count: fallbackCount2 } = await supabase
          .from('receipts')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        console.log('🔍 [DEBUG] 모든 조건 제거 결과:', {
          count: fallbackReceipts2?.length || 0,
          totalCount: fallbackCount2
        });

        if (fallbackReceipts2 && fallbackReceipts2.length > 0) {
          finalReceipts = fallbackReceipts2;
          finalCount = fallbackCount2;
          console.log('✅ [DEBUG] 모든 조건 제거 후 데이터 발견');
        }
      }
    }

    // 5.5. Products 정보 가져오기 (별도 쿼리)
    const productIds = Array.from(new Set((finalReceipts || []).map(r => r.product_id).filter((id): id is string => Boolean(id))));
    let productsMap = new Map();
    
    if (productIds.length > 0) {
      const { data: productsData } = await supabase
        .from('products')
        .select('id, product_name, star_candy, star_candy_bonus, web_price_krw, web_price_usd, price')
        .in('id', productIds);
      
      if (productsData) {
        productsData.forEach(product => {
          productsMap.set(product.id, product);
        });
      }
    }

    // 6. 데이터 변환 (앱구매 형태로)
    const rechargeItems: AppPurchaseItem[] = (finalReceipts || []).map((receipt) => {
      // 영수증 데이터 파싱
      let receiptData: any = {};
      try {
        receiptData = typeof receipt.receipt_data === 'string' 
          ? JSON.parse(receipt.receipt_data) 
          : receipt.receipt_data || {};
      } catch (e) {
        console.warn('영수증 데이터 파싱 실패:', e);
      }

      // 검증 데이터 파싱
      let verificationData: any = {};
      try {
        verificationData = typeof receipt.verification_data === 'object'
          ? receipt.verification_data
          : JSON.parse(String(receipt.verification_data || '{}'));
      } catch (e) {
        console.warn('검증 데이터 파싱 실패:', e);
      }

      // Products 테이블 정보 
      const productInfo = productsMap.get(receipt.product_id) || {};
      
      // 플랫폼별 데이터 처리
      const isIOS = receipt.platform === 'ios';
      const isAndroid = receipt.platform === 'android';
      const isWeb = receipt.platform === 'web';
      
      // 별사탕 수량 계산 (Products 테이블 우선, 기본값은 영수증 데이터)
      const baseStarCandy = Number(productInfo.star_candy || receiptData.star_candy_amount || receiptData.starCandy || 100);
      const bonusStarCandy = Number(productInfo.star_candy_bonus || receiptData.bonus_amount || receiptData.bonusAmount || 0);
      
      // 결제 금액 계산 (Products 테이블 우선)
      let actualAmount = 0;
      if (isWeb) {
        // 웹 결제의 경우 currency에 따라 가격 선택
        const currency = receiptData.currency || 'KRW';
        if (currency === 'USD') {
          actualAmount = Number(productInfo.web_price_usd || receiptData.amount || 0);
        } else {
          actualAmount = Number(productInfo.web_price_krw || receiptData.amount || 0);
        }
      } else {
        // 앱 결제의 경우 기존 로직 유지
        actualAmount = Number(productInfo.price || receiptData.amount || 0);
      }
      
      // 결제 방법 결정
      const paymentMethod = isIOS ? 'apple_store' : isAndroid ? 'google_play' : isWeb ? 'web_payment' : 'app_store';
      const paymentProvider = isIOS ? 'Apple App Store' : isAndroid ? 'Google Play Store' : isWeb ? (receiptData.payment_method === 'port_one' ? 'Port One' : 'PayPal') : 'App Store';
      
      // 상품 정보 (Products 테이블 우선)
      const itemName = productInfo.product_name || receiptData.product_name || receiptData.item_name || '별사탕 구매';
      const description = receiptData.description || '별사탕 구매';
      const unitPrice = actualAmount;
      
      return {
        id: receipt.id.toString(),
        receiptId: receipt.receipt_hash || `APP_${receipt.id}`,
        receiptNumber: `A${new Date(receipt.created_at || new Date()).getFullYear()}${('000000' + receipt.id.toString()).slice(-6)}`,
        receiptUrl: receiptData.receipt_url || undefined,
        amount: actualAmount,
        starCandyAmount: Number(baseStarCandy),
        bonusAmount: Number(bonusStarCandy),
        paymentMethod,
        paymentProvider,
        platform: receipt.platform,
        storeProductId: String(receipt.product_id || productInfo.id || receiptData.product_id || receiptData.store_product_id || 'unknown'),
        transactionId: isIOS 
          ? (verificationData.transaction_id || receiptData.original_transaction_id || receipt.receipt_hash)
          : (receiptData.order_id || receiptData.purchase_token || receipt.receipt_hash),
        merchantTransactionId: receiptData.merchant_transaction_id || undefined,
        status: receipt.status,
        currency: receiptData.currency || 'KRW',
        exchangeRate: receiptData.exchange_rate ? Number(receiptData.exchange_rate) : undefined,
        originalAmount: receiptData.original_amount ? Number(receiptData.original_amount) : undefined,
        originalCurrency: receiptData.original_currency || undefined,
        paymentDetails: {
          cardLast4: receiptData.card_last4 || undefined,
          cardBrand: receiptData.card_brand || undefined,
          bankName: receiptData.bank_name || undefined,
          paypalEmail: receiptData.paypal_email || undefined,
        },
        receiptData: {
          itemName,
          description,
          quantity: Number(receiptData.quantity || 1),
          unitPrice,
          taxAmount: receiptData.tax_amount ? Number(receiptData.tax_amount) : undefined,
          discountAmount: receiptData.discount_amount ? Number(receiptData.discount_amount) : undefined,
        },
        metadata: {
          ipAddress: receiptData.ip_address || undefined,
          userAgent: receiptData.user_agent || undefined,
          referrer: receiptData.referrer || undefined,
        },
        createdAt: receipt.created_at || new Date().toISOString(),
        updatedAt: receipt.created_at || new Date().toISOString(), // updated_at 필드가 없으므로 created_at 사용
        receiptGeneratedAt: receiptData.receipt_generated_at || receipt.created_at || undefined,
        appStoreData: {
          // Apple App Store 데이터
          ...(isIOS && {
            originalTransactionId: verificationData.original_transaction_id || receiptData.original_transaction_id,
            bundleId: receiptData.bundle_id || verificationData.bundle_id,
          }),
          // Google Play Store 데이터
          ...(isAndroid && {
            purchaseToken: receiptData.purchase_token || verificationData.purchase_token,
            orderId: receiptData.order_id || verificationData.order_id,
            packageName: receiptData.package_name || verificationData.package_name,
          }),
        },
      };
    });

    // 7. 전체 통계 계산 (별도 쿼리)
    let statistics = {
      totalPurchases: finalCount || 0,
      totalAmount: 0,
      totalStarCandy: 0,
    };

    try {
      // 전체 완료된 영수증 조회 (통계용)
      const { data: allReceipts } = await supabase
        .from('receipts')
        .select('id, product_id, receipt_data, platform')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .in('platform', ['ios', 'android', 'web']);

      if (allReceipts && allReceipts.length > 0) {
        // 전체 영수증에서 통계 계산
        let totalAmount = 0;
        let totalStarCandy = 0;

        for (const receipt of allReceipts) {
          let receiptData: any = {};
          try {
            receiptData = typeof receipt.receipt_data === 'string' 
              ? JSON.parse(receipt.receipt_data) 
              : receipt.receipt_data || {};
          } catch (e) {
            continue;
          }

          const productInfo = productsMap.get(receipt.product_id) || {};
          const isWeb = receipt.platform === 'web';
          
          // 실제 결제 금액
          if (isWeb) {
            const currency = receiptData.currency || 'KRW';
            if (currency === 'USD') {
              totalAmount += Number(productInfo.web_price_usd || receiptData.amount || 0);
            } else {
              totalAmount += Number(productInfo.web_price_krw || receiptData.amount || 0);
            }
          } else {
            totalAmount += Number(productInfo.price || receiptData.amount || 0);
          }

          // 별사탕 수량
          const baseStarCandy = Number(productInfo.star_candy || receiptData.star_candy_amount || receiptData.starCandy || 100);
          const bonusStarCandy = Number(productInfo.star_candy_bonus || receiptData.bonus_amount || receiptData.bonusAmount || 0);
          totalStarCandy += baseStarCandy + bonusStarCandy;
        }

        statistics = {
          totalPurchases: allReceipts.length,
          totalAmount,
          totalStarCandy,
        };
      }
    } catch (error) {
      console.error('통계 계산 실패:', error);
      // 페이지 데이터로 fallback
      statistics = {
        totalPurchases: finalCount || 0,
        totalAmount: rechargeItems.reduce((sum, item) => sum + item.amount, 0),
        totalStarCandy: rechargeItems.reduce((sum, item) => sum + item.starCandyAmount + item.bonusAmount, 0),
      };
    }

    // 8. 페이지네이션 정보
    const totalPages = Math.ceil((finalCount || 0) / limit);
    const pagination = {
      page,
      limit,
      totalCount: finalCount || 0,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };

    console.log('📊 [Recharge History API] 응답 준비 완료:', {
      itemsCount: rechargeItems.length,
      statistics,
      pagination
    });

    const response: RechargeResponse = {
      success: true,
      data: rechargeItems,
      pagination,
      statistics,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ [Recharge History API] 예상치 못한 오류:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 