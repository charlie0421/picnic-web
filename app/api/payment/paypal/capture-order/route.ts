import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStarCandyBonusExpiryISO } from '@/utils/star-candy-bonus';

const PAYPAL_API_URL = process.env.PAYPAL_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';

// Get PayPal access token
async function getPayPalAccessToken(): Promise<string> {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error('Failed to get PayPal access token');
  }

  return data.access_token;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { orderID } = body;

    if (!orderID) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();

    // Capture the order
    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const captureData = await response.json();

    if (!response.ok) {
      console.error('PayPal capture failed:', captureData);
      return NextResponse.json(
        { error: 'Failed to capture PayPal order' },
        { status: 500 }
      );
    }

    // Verify the payment was successful
    if (captureData.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Payment not completed' },
        { status: 400 }
      );
    }

    // Extract custom data — only productId/userId are trusted from custom_id
    const purchaseUnit = captureData.purchase_units[0];
    let customData: { productId?: string; userId?: string };
    try {
      customData = JSON.parse(purchaseUnit.custom_id || '{}');
    } catch {
      console.error('Invalid custom_id payload:', purchaseUnit.custom_id);
      return NextResponse.json(
        { error: 'Invalid payment metadata' },
        { status: 400 }
      );
    }

    const { productId, userId } = customData;

    if (!productId || !userId) {
      return NextResponse.json(
        { error: 'Invalid payment metadata' },
        { status: 400 }
      );
    }

    // Prevent payment hijacking: the captured order's userId must match the authenticated user
    if (userId !== user.id) {
      console.error('User mismatch on capture', { orderID, customUserId: userId, authUserId: user.id });
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Server-authoritative product lookup — re-derive amounts from DB, never trust custom_id
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, web_price_usd, star_candy, web_bonus_amount')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      console.error('Product lookup failed on capture:', productError);
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    if (!product || product.web_price_usd == null) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Tamper detection: PayPal-captured amount/currency must match DB price
    const expectedValue = product.web_price_usd.toFixed(2);
    if (
      purchaseUnit.amount?.value !== expectedValue ||
      purchaseUnit.amount?.currency_code !== 'USD'
    ) {
      console.error('Amount mismatch on capture', {
        orderID,
        expected: expectedValue,
        actual: purchaseUnit.amount,
      });
      return NextResponse.json(
        { error: 'Payment amount mismatch' },
        { status: 400 }
      );
    }

    const starCandy = product.star_candy ?? 0;
    const bonusAmount = product.web_bonus_amount ?? 0;

    // Check if receipt already exists — maybeSingle avoids PGRST116 false-error path
    const { data: existingReceipt, error: existingReceiptError } = await supabase
      .from('receipts')
      .select('id')
      .eq('receipt_hash', orderID)
      .maybeSingle();

    if (existingReceiptError) {
      console.error('Receipt lookup failed:', existingReceiptError);
      return NextResponse.json(
        { error: 'Failed to record payment' },
        { status: 500 }
      );
    }

    if (existingReceipt) {
      return NextResponse.json(
        { error: 'Payment already processed' },
        { status: 400 }
      );
    }

    // Create receipt data
    const receiptData = {
      order_id: orderID,
      capture_id: captureData.id,
      amount: purchaseUnit.amount.value,
      currency: purchaseUnit.amount.currency_code,
      status: captureData.status,
      payer_email: captureData.payer?.email_address,
      payment_details: captureData,
    };

    // Create receipt
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        user_id: user.id,
        product_id: productId,
        receipt_data: JSON.stringify(receiptData),
        receipt_hash: orderID,
        status: 'completed',
        platform: 'web',
        environment: process.env.PAYPAL_ENV === 'production' ? 'production' : 'sandbox',
        verification_data: captureData,
      })
      .select()
      .single();

    if (receiptError) {
      console.error('Failed to create receipt:', receiptError);
      return NextResponse.json(
        { error: 'Failed to record payment' },
        { status: 500 }
      );
    }

    // Atomic increment of star_candy balance to prevent race conditions
    const { error: profileError } = await supabase
      .rpc('increment_star_candy', {
        p_user_id: user.id,
        p_amount: starCandy,
      });

    if (profileError) {
      console.error('Failed to update star_candy balance:', profileError);
    }

    // Record star candy history
    const transactionId = `PAYPAL_${orderID}`;
    const { error: historyError } = await supabase
      .from('star_candy_history')
      .insert({
        user_id: user.id,
        amount: starCandy,
        type: 'PURCHASE',
        transaction_id: transactionId,
      });

    if (historyError) {
      console.error('Failed to record star candy history:', historyError);
    }

    // Record bonus if applicable
    if (bonusAmount > 0) {
      const expiredAt = getStarCandyBonusExpiryISO();

      const { error: bonusError } = await supabase
        .from('star_candy_bonus_history')
        .insert({
          user_id: user.id,
          amount: bonusAmount,
          remain_amount: bonusAmount,
          type: 'PURCHASE',
          transaction_id: transactionId,
          expired_dt: expiredAt,
        });

      if (bonusError) {
        console.error('Failed to record bonus:', bonusError);
      } else {
        // Atomic increment of bonus balance
        const { error: bonusUpdateError } = await supabase
          .rpc('increment_star_candy_bonus', {
            p_user_id: user.id,
            p_amount: bonusAmount,
          });

        if (bonusUpdateError) {
          console.error('Failed to update bonus balance:', bonusUpdateError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      receipt_id: receipt.id,
      message: 'Payment captured and processed successfully',
    });

  } catch (error) {
    console.error('Capture order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
