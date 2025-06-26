import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

    // Extract custom data
    const purchaseUnit = captureData.purchase_units[0];
    const customData = JSON.parse(purchaseUnit.custom_id || '{}');
    const { productId, starCandy, bonusAmount } = customData;

    // Check if receipt already exists
    const { data: existingReceipt } = await supabase
      .from('receipts')
      .select('id')
      .eq('receipt_hash', orderID)
      .single();

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

    // Update user profile star candy balance
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('star_candy')
      .eq('id', user.id)
      .single();

    if (currentProfile) {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          star_candy: (currentProfile.star_candy || 0) + starCandy,
        })
        .eq('id', user.id);

      if (profileError) {
        console.error('Failed to update user profile:', profileError);
      }
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
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1); // Next month
      expiryDate.setDate(15); // 15th of next month

      const { error: bonusError } = await supabase
        .from('star_candy_bonus_history')
        .insert({
          user_id: user.id,
          amount: bonusAmount,
          remain_amount: bonusAmount,
          type: 'PURCHASE',
          transaction_id: transactionId,
          expired_dt: expiryDate.toISOString(),
        });

      if (bonusError) {
        console.error('Failed to record bonus:', bonusError);
      }

      // Also update user's bonus balance
      const { data: profileForBonus } = await supabase
        .from('user_profiles')
        .select('star_candy_bonus')
        .eq('id', user.id)
        .single();

      if (profileForBonus) {
        const { error: bonusUpdateError } = await supabase
          .from('user_profiles')
          .update({
            star_candy_bonus: (profileForBonus.star_candy_bonus || 0) + bonusAmount,
          })
          .eq('id', user.id);

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
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}