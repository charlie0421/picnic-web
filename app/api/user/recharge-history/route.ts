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

    // 4. 앱구매 영수증 조회 - 스마트한 조건 선택
    let receipts: any[] | null = null;
    let receiptsError: any = null;
    let count: number | null = null;
    
    console.log('🔍 [DEBUG] 사용자 영수증 조회 시작:', {
      userId: user.id,
      offset,
      limit,
      completedReceipts,
      totalUserReceipts
    });
    
    // 먼저 completed 상태가 충분한지 확인
    if (completedReceipts && completedReceipts >= offset + 1) {
      // completed 상태로 충분한 데이터가 있는 경우에만 completed 조건 사용
      const result = await supabase
        .from('receipts')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .in('platform', ['ios', 'android', 'web'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      receipts = result.data;
      receiptsError = result.error;
      count = result.count;
      
      console.log('✅ [DEBUG] completed 상태 조건으로 조회:', {
        count: receipts?.length || 0,
        totalCount: count
      });
    } else {
      // completed 데이터가 부족하면 처음부터 조건 완화
      console.log('⚠️ [DEBUG] completed 데이터 부족, 조건 완화하여 조회');
      
      const result = await supabase
        .from('receipts')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .in('platform', ['ios', 'android', 'web'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      receipts = result.data;
      receiptsError = result.error;
      count = result.count;
      
      console.log('✅ [DEBUG] 상태 조건 완화하여 조회:', {
        count: receipts?.length || 0,
        totalCount: count
      });
    }

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

    console.log('✅ [Recharge History API] 쿼리 결과:', {
      count: receipts?.length || 0,
      totalCount: count
    });

    // 5. 최종 결과 설정
    let finalReceipts = receipts;
    let finalCount = count;

    // 5.5. Products 정보 가져오기 (별도 쿼리)
    const productIds = Array.from(new Set((finalReceipts || []).map(r => r.product_id).filter((id): id is string => Boolean(id))));
    let productsMap = new Map();
    
    console.log('🏷️ [DEBUG] Product IDs found in receipts:', productIds);
    
    if (productIds.length > 0) {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, product_name, star_candy, star_candy_bonus, web_price_krw, web_price_usd, price')
        .in('id', productIds);
      
      console.log('🏷️ [DEBUG] Products query result:', {
        error: productsError,
        count: productsData?.length || 0,
        products: productsData?.map(p => ({
          id: p.id,
          name: p.product_name,
          price: p.price,
          web_price_krw: p.web_price_krw,
          web_price_usd: p.web_price_usd,
          star_candy: p.star_candy,
          star_candy_bonus: p.star_candy_bonus
        })) || []
      });
      
      if (productsData) {
        productsData.forEach(product => {
          productsMap.set(product.id, product);
        });
      }
    }

    // 6. 데이터 변환 (앱구매 형태로)
    const rechargeItems: AppPurchaseItem[] = (finalReceipts || []).map((receipt) => {
      // 영수증 데이터 파싱 (개선된 안전성)
      let receiptData: any = {};
      try {
        if (typeof receipt.receipt_data === 'string') {
          // 문자열이 비어있거나 유효하지 않은 JSON인지 확인
          const trimmedData = receipt.receipt_data.trim();
          if (trimmedData === '' || trimmedData === 'null' || trimmedData === 'undefined') {
            receiptData = {};
          } else {
            // JSON 문자열인지 확인 (첫 문자가 { 또는 [로 시작하는지)
            if (trimmedData.startsWith('{') || trimmedData.startsWith('[')) {
              receiptData = JSON.parse(trimmedData);
            } else {
              console.warn('유효하지 않은 JSON 형태:', trimmedData.substring(0, 50));
              receiptData = {};
            }
          }
        } else if (receipt.receipt_data && typeof receipt.receipt_data === 'object') {
          receiptData = receipt.receipt_data;
        } else {
          receiptData = {};
        }
      } catch (e) {
        console.warn('영수증 데이터 파싱 실패:', {
          error: e instanceof Error ? e.message : 'Unknown error',
          data: typeof receipt.receipt_data === 'string' 
            ? receipt.receipt_data.substring(0, 100) 
            : typeof receipt.receipt_data
        });
        receiptData = {};
      }
      
      // 파싱된 receiptData 구조 로그 (처음 5개만)
      if (receipt.id <= (finalReceipts?.[4]?.id || 5)) {
        console.log(`💳 [DEBUG] Receipt ${receipt.id} parsed data:`, {
          platform: receipt.platform,
          product_id: receipt.product_id,
          receiptDataKeys: Object.keys(receiptData),
          receiptDataSample: {
            amount: receiptData.amount,
            quantity: receiptData.quantity,
            currency: receiptData.currency,
            payment_method: receiptData.payment_method,
            star_candy_amount: receiptData.star_candy_amount,
            starCandy: receiptData.starCandy,
            bonus_amount: receiptData.bonus_amount
          }
        });
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
      
      // 별사탕 수량 계산 (Products 테이블 우선, 기본값 설정)
      let baseStarCandy = Number(productInfo.star_candy || receiptData.star_candy_amount || receiptData.starCandy || 0);
      let bonusStarCandy = Number(productInfo.star_candy_bonus || receiptData.bonus_amount || receiptData.bonusAmount || 0);
      
      // 별사탕이 0이면 상품 ID에 따른 기본값 설정
      if (baseStarCandy === 0) {
        const defaultStarCandy: { [key: string]: number } = {
          'STAR100': 100,
          'STAR300': 300,
          'STAR500': 500,
          'STAR1000': 1000,
          'STAR3000': 3000,
          'STAR5000': 5000
        };
        baseStarCandy = defaultStarCandy[receipt.product_id || ''] || 100;
      }
      
      // 결제 금액 계산 - receiptData 기반
      const quantity = Number(receiptData.quantity || 1);
      
      // 1순위: receiptData.amount 사용
      let actualAmount = Number(receiptData.amount || 0);
      
      // 2순위: verification_data에서 확인 (iOS/Android)
      if (actualAmount === 0 && verificationData && (isIOS || isAndroid)) {
        if (isIOS && verificationData.price) {
          actualAmount = Number(verificationData.price) / 1000000; // 마이크로 단위 변환
        } else if (isAndroid && verificationData.priceAmountMicros) {
          actualAmount = Number(verificationData.priceAmountMicros) / 1000000;
        }
              }
      
      // 3순위: Products 테이블에서 확인 (웹 결제용)
      if (actualAmount === 0 && isWeb) {
        const currency = receiptData.currency || 'KRW';
        if (currency === 'USD') {
          actualAmount = Number(productInfo.web_price_usd || 0) * quantity;
        } else {
          actualAmount = Number(productInfo.web_price_krw || 0) * quantity;
        }
      }
      
      // 4순위: 기본값 설정
      if (actualAmount === 0) {
        const defaultAmounts: { [key: string]: number } = {
          'STAR100': 1100,
          'STAR300': 3300, 
          'STAR500': 5500,
          'STAR1000': 11000,
          'STAR3000': 33000,
          'STAR5000': 55000
        };
        actualAmount = (defaultAmounts[receipt.product_id || ''] || 1000) * quantity;
        console.log(`⚠️ [DEBUG] 기본값 사용: ${receipt.product_id} -> ${actualAmount}원`);
      }
      
      // 단가 계산 (결제 금액 ÷ 수량)
      const unitPrice = Math.round(actualAmount / quantity);
      
      // 처음 3개 영수증에 대해 상세 로그
      if (receipt.id <= 3) {
        console.log(`💰 [DEBUG] Receipt ${receipt.id} 금액 계산:`, {
          productId: receipt.product_id,
          platform: receipt.platform,
          receiptDataAmount: receiptData.amount,
          verificationPrice: verificationData?.price || verificationData?.priceAmountMicros,
          quantity: quantity,
          finalAmount: actualAmount,
          unitPrice: unitPrice
        });
      }
      
      // 결제 방법 결정
      const paymentMethod = isIOS ? 'apple_store' : isAndroid ? 'google_play' : isWeb ? 'web_payment' : 'app_store';
      const paymentProvider = isIOS ? 'Apple App Store' : isAndroid ? 'Google Play Store' : isWeb ? (receiptData.payment_method === 'port_one' ? 'Port One' : 'PayPal') : 'App Store';
      
      // 상품 정보 (Products 테이블 우선)
      const itemName = productInfo.product_name || receiptData.product_name || receiptData.item_name || '별사탕 구매';
      const description = receiptData.description || '별사탕 구매';
      
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
          quantity: quantity,
          unitPrice: unitPrice,
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

    console.log('🎯 [STATS] 통계 계산 시작 - 진입점 확인:', {
      userId: user.id,
      userEmail: user.email,
      timestamp: new Date().toISOString()
    });

    try {
      console.log('🔄 [STATS] Step 1: 사용자 전체 데이터 조회 시작');
      
      // 먼저 이 사용자의 모든 데이터가 있는지 확인
      const { data: allUserData, error: allUserError } = await supabase
        .from('receipts')
        .select('id, product_id, platform, status, created_at')
        .eq('user_id', user.id);
        
      if (allUserError) {
        console.error('❌ [STATS] Step 1 실패:', allUserError);
        throw allUserError;
      }
      
      console.log('✅ [STATS] Step 1 완료:', { count: allUserData?.length || 0 });
        
      console.log('🔍 [TOTAL DEBUG] 사용자의 전체 영수증 데이터:', {
        userId: user.id,
        totalCount: allUserData?.length || 0,
        error: allUserError,
        sampleData: allUserData?.slice(0, 3).map(r => ({
          id: r.id,
          status: r.status,
          platform: r.platform,
          product_id: r.product_id,
          created_at: r.created_at
        })) || []
      });
      
      console.log('🔄 [STATS] Step 2: 통계용 영수증 조회 시작');
      
      // 전체 영수증 조회 (통계용) - amount 컬럼명 제거하고 기본 컬럼들만 조회
      const { data: allReceipts, error: receiptsError } = await supabase
        .from('receipts')
        .select('id, product_id, receipt_data, platform, status, created_at')
        .eq('user_id', user.id);
        // .in('platform', ['ios', 'android', 'web']); // 플랫폼 필터 제거
        
      if (receiptsError) {
        console.error('❌ [STATS] Step 2 실패:', receiptsError);
        throw receiptsError;
      }
      
      console.log('✅ [STATS] Step 2 완료:', { count: allReceipts?.length || 0 });
        
      console.log('📊 [DEBUG] 통계용 플랫폼 필터링된 영수증 조회:', {
        count: allReceipts?.length || 0,
        statusBreakdown: allReceipts?.reduce((acc: any, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        }, {}) || {},
        platforms: allReceipts?.reduce((acc: any, r) => {
          acc[r.platform] = (acc[r.platform] || 0) + 1;
          return acc;
        }, {}) || {}
      });

      console.log('📊 [STATS] 통계 계산 시작:', {
        totalReceipts: allReceipts?.length || 0,
        hasReceipts: !!allReceipts,
        isArray: Array.isArray(allReceipts)
      });

      if (allReceipts && Array.isArray(allReceipts) && allReceipts.length > 0) {
        // 전체 영수증에서 통계 계산
        let totalAmount = 0;
        let totalStarCandy = 0;
        let completedCount = 0;
        let processedCount = 0;

        for (const receipt of allReceipts) {
          processedCount++;
          
          console.log(`🔄 [STATS] 처리 중 ${processedCount}/${allReceipts.length}:`, {
            receiptId: receipt.id,
            status: receipt.status,
            platform: receipt.platform,
            productId: receipt.product_id
          });
          // 일단 모든 상태의 영수증을 포함해서 통계 계산해보기 (디버깅용)
          // if (receipt.status !== 'completed') {
          //   continue;
          // }
          
          let receiptData: any = {};
          try {
            if (typeof receipt.receipt_data === 'string') {
              const trimmedData = receipt.receipt_data.trim();
              if (trimmedData === '' || trimmedData === 'null' || trimmedData === 'undefined') {
                receiptData = {};
              } else if (trimmedData.startsWith('{') || trimmedData.startsWith('[')) {
                receiptData = JSON.parse(trimmedData);
              } else {
                receiptData = {};
              }
            } else if (receipt.receipt_data && typeof receipt.receipt_data === 'object') {
              receiptData = receipt.receipt_data;
            } else {
              receiptData = {};
            }
          } catch (e) {
            receiptData = {};
            continue;
          }

          const productInfo = productsMap.get(receipt.product_id) || {};
          const isWeb = receipt.platform === 'web';
          const statsQuantity = Number(receiptData.quantity || 1);
          
          // 실제 결제 금액 계산 - receiptData와 기본값 기반
          let itemAmount = 0;
          
          // 1순위: receiptData.amount 사용  
          if (receiptData.amount && !isNaN(Number(receiptData.amount))) {
            itemAmount = Number(receiptData.amount);
          }
          
          // 2순위: 상품 ID에 따른 기본값 설정
          if (itemAmount === 0 || isNaN(itemAmount)) {
            const defaultAmounts: { [key: string]: number } = {
              'STAR100': 1100,
              'STAR300': 3300, 
              'STAR500': 5500,
              'STAR1000': 11000,
              'STAR3000': 33000,
              'STAR5000': 55000
            };
            itemAmount = (defaultAmounts[receipt.product_id || ''] || 1100) * statsQuantity;
          }
          
          console.log(`💰 [STATS DEBUG] Receipt ${receipt.id} 통계 금액:`, {
            receiptDataAmount: receiptData.amount,
            defaultUsed: !receiptData.amount,
            finalAmount: itemAmount,
            productId: receipt.product_id,
            quantity: statsQuantity
          });
          
          totalAmount += itemAmount;
          completedCount++;

          // 별사탕 수량 계산
          let baseStarCandy = 0;
          let bonusStarCandy = 0;
          
          // 1순위: Products 테이블에서
          if (productInfo.star_candy) {
            baseStarCandy = Number(productInfo.star_candy);
          }
          
          // 2순위: receiptData에서
          if (baseStarCandy === 0) {
            if (receiptData.star_candy_amount) {
              baseStarCandy = Number(receiptData.star_candy_amount);
            } else if (receiptData.starCandy) {
              baseStarCandy = Number(receiptData.starCandy);
            }
          }
          
          // 3순위: 상품 ID에 따른 기본값
          if (baseStarCandy === 0 || isNaN(baseStarCandy)) {
            const defaultStarCandy: { [key: string]: number } = {
              'STAR100': 100,
              'STAR300': 300,
              'STAR500': 500,
              'STAR1000': 1000,
              'STAR3000': 3000,
              'STAR5000': 5000
            };
            baseStarCandy = defaultStarCandy[receipt.product_id || ''] || 100;
          }
          
          // 보너스 별사탕
          if (productInfo.star_candy_bonus) {
            bonusStarCandy = Number(productInfo.star_candy_bonus);
          } else if (receiptData.bonus_amount) {
            bonusStarCandy = Number(receiptData.bonus_amount);
          } else if (receiptData.bonusAmount) {
            bonusStarCandy = Number(receiptData.bonusAmount);
          }
          
          // NaN 체크
          if (isNaN(bonusStarCandy)) {
            bonusStarCandy = 0;
          }
          
          console.log(`⭐ [STATS DEBUG] Receipt ${receipt.id} 별사탕:`, {
            productStarCandy: productInfo.star_candy,
            receiptStarCandy: receiptData.star_candy_amount || receiptData.starCandy,
            baseStarCandy,
            bonusStarCandy,
            total: baseStarCandy + bonusStarCandy
          });
          
          totalStarCandy += baseStarCandy + bonusStarCandy;
        }

        statistics = {
          totalPurchases: completedCount,
          totalAmount,
          totalStarCandy,
        };
        
        console.log('📊 [DEBUG] 최종 통계 계산 완료:', {
          totalReceipts: allReceipts.length,
          processedReceipts: processedCount,
          completedReceipts: completedCount,
          totalAmount,
          totalStarCandy
        });
      } else {
        console.log('⚠️ [STATS] 통계 계산할 영수증이 없음:', {
          allReceiptsLength: allReceipts?.length || 0,
          isArray: Array.isArray(allReceipts),
          allReceiptsType: typeof allReceipts
        });
      }
    } catch (error) {
      console.error('❌ [STATS] 통계 계산 실패:', error);
      console.error('❌ [STATS] 에러 스택:', error instanceof Error ? error.stack : 'No stack trace');
      
      // 페이지 데이터로 fallback
      console.log('🔄 [STATS] Fallback 계산 시작 - 현재 페이지 데이터 사용');
      
      const fallbackTotalAmount = rechargeItems.reduce((sum, item) => {
        const amount = Number(item.amount) || 0;
        console.log(`💰 [FALLBACK] Item ${item.id}: ${amount}원`);
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);
      
      const fallbackTotalStarCandy = rechargeItems.reduce((sum, item) => {
        const starCandy = Number(item.starCandyAmount) || 0;
        const bonus = Number(item.bonusAmount) || 0;
        console.log(`⭐ [FALLBACK] Item ${item.id}: 기본 ${starCandy} + 보너스 ${bonus}`);
        return sum + (isNaN(starCandy) ? 0 : starCandy) + (isNaN(bonus) ? 0 : bonus);
      }, 0);
      
      statistics = {
        totalPurchases: finalCount || 0,
        totalAmount: fallbackTotalAmount,
        totalStarCandy: fallbackTotalStarCandy,
      };
      
      console.log('🔄 [STATS] Fallback 통계 계산 완료:', statistics);
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

    // 최종 통계 안전성 검증
    const safeStatistics = {
      totalPurchases: Number(statistics.totalPurchases) || 0,
      totalAmount: Number(statistics.totalAmount) || 0,
      totalStarCandy: Number(statistics.totalStarCandy) || 0,
    };
    
    console.log('📊 [Recharge History API] 응답 준비 완료:', {
      itemsCount: rechargeItems.length,
      originalStatistics: statistics,
      safeStatistics,
      pagination
    });

    const response: RechargeResponse = {
      success: true,
      data: rechargeItems,
      pagination,
      statistics: safeStatistics,
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