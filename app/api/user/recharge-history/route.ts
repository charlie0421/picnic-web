import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, createServerSupabaseClient } from '@/lib/supabase/server';

interface AppPurchaseItem {
  id: string;
  receiptId: string;
  receiptNumber: string;
  amount: number;
  starCandyAmount: number;
  bonusAmount: number;
  platform: string; // 'ios' or 'android'
  storeProductId: string;
  transactionId: string;
  status: string;
  currency: string;
  createdAt: string;
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

    // 4. 앱구매 영수증 조회 (completed 상태만)
    const { data: receipts, error: receiptsError, count } = await supabase
      .from('receipts')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .in('platform', ['ios', 'android']) // 앱구매만 필터링
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

    console.log('✅ [Recharge History API] 영수증 조회 성공:', {
      count: receipts?.length || 0,
      totalCount: count
    });

    // 5. 데이터 변환 (앱구매 형태로)
    const rechargeItems: AppPurchaseItem[] = (receipts || []).map((receipt) => {
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

      // 플랫폼별 데이터 처리
      const isIOS = receipt.platform === 'ios';
      const isAndroid = receipt.platform === 'android';
      
             // 별사탕 수량 계산 (기본값)
       const baseStarCandy = Number(receiptData.star_candy_amount || 100);
       const bonusStarCandy = Number(receiptData.bonus_amount || 0);
      
      return {
        id: receipt.id.toString(),
        receiptId: receipt.receipt_hash || `APP_${receipt.id}`,
                 receiptNumber: `A${new Date(receipt.created_at || new Date()).getFullYear()}${('000000' + receipt.id.toString()).slice(-6)}`,
         amount: Number(receiptData.amount || 0),
         starCandyAmount: Number(baseStarCandy),
         bonusAmount: Number(bonusStarCandy),
         platform: receipt.platform,
         storeProductId: String(receiptData.product_id || receiptData.store_product_id || 'unknown'),
        transactionId: isIOS 
          ? (verificationData.transaction_id || receiptData.original_transaction_id || receipt.receipt_hash)
          : (receiptData.order_id || receiptData.purchase_token || receipt.receipt_hash),
        status: receipt.status,
                 currency: receiptData.currency || 'KRW',
         createdAt: receipt.created_at || new Date().toISOString(),
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

    // 6. 통계 계산
    const statistics = {
      totalPurchases: count || 0,
      totalAmount: rechargeItems.reduce((sum, item) => sum + item.amount, 0),
      totalStarCandy: rechargeItems.reduce((sum, item) => sum + item.starCandyAmount + item.bonusAmount, 0),
    };

    // 7. 페이지네이션 정보
    const totalPages = Math.ceil((count || 0) / limit);
    const pagination = {
      page,
      limit,
      totalCount: count || 0,
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