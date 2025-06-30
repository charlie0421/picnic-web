import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';

// Port One API configuration
const PORTONE_API_URL = 'https://api.iamport.kr';
const PORTONE_API_KEY = process.env.PORTONE_API_KEY || '';
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';
const PORTONE_WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET || '';

interface PortOneTokenResponse {
  code: number;
  message: string;
  response?: {
    access_token: string;
  };
}

interface PortOnePaymentResponse {
  code: number;
  message: string;
  response?: {
    imp_uid: string;
    merchant_uid: string;
    pay_method: string;
    channel: string;
    pg_provider: string;
    pg_tid: string;
    pg_id: string;
    escrow: boolean;
    apply_num: string;
    bank_code: string;
    bank_name: string;
    card_code: string;
    card_name: string;
    card_number: string;
    card_quota: number;
    currency: string;
    amount: number;
    receipt_url: string;
    name: string;
    buyer_name: string;
    buyer_email: string;
    buyer_tel: string;
    buyer_addr: string;
    buyer_postcode: string;
    custom_data: string;
    status: string;
    paid_at: number;
    failed_at: number;
    cancelled_at: number;
    fail_reason: string;
    cancel_reason: string;
  };
}

// Get Port One API token
async function getPortOneToken(): Promise<string> {
  const response = await fetch(`${PORTONE_API_URL}/users/getToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imp_key: PORTONE_API_KEY,
      imp_secret: PORTONE_API_SECRET,
    }),
  });

  const data: PortOneTokenResponse = await response.json();

  if (!data.response?.access_token) {
    throw new Error('Failed to get Port One API token');
  }

  return data.response.access_token;
}

// Verify payment with Port One API
async function verifyPortOnePayment(impUid: string): Promise<PortOnePaymentResponse['response']> {
  const token = await getPortOneToken();

  const response = await fetch(`${PORTONE_API_URL}/payments/${impUid}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data: PortOnePaymentResponse = await response.json();

  if (!data.response) {
    throw new Error(`Payment verification failed: ${data.message}`);
  }

  return data.response;
}

// Verify webhook signature
function verifyWebhookSignature(payload: any, signature: string): boolean {
  const calculatedSignature = createHmac('sha256', PORTONE_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  return calculatedSignature === signature;
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
    const { paymentId } = body;

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    // Verify payment with Port One
    const paymentData = await verifyPortOnePayment(paymentId);

    if (!paymentData) {
      return NextResponse.json(
        { error: 'Payment verification failed' },
        { status: 400 }
      );
    }

    // Check if payment is successful
    if (paymentData.status !== 'paid') {
      return NextResponse.json(
        { error: `Payment not completed. Status: ${paymentData.status}` },
        { status: 400 }
      );
    }

    // Parse custom data to get product info
    let customData;
    try {
      customData = JSON.parse(paymentData.custom_data);
    } catch (e) {
      console.error('Failed to parse custom data:', e);
      return NextResponse.json(
        { error: 'Invalid payment data' },
        { status: 400 }
      );
    }

    const { productId, starCandy, bonusAmount } = customData;

    // Check if receipt already exists
    const { data: existingReceipt } = await supabase
      .from('receipts')
      .select('id')
      .eq('receipt_data', paymentId)
      .single();

    if (existingReceipt) {
      return NextResponse.json(
        { error: 'Payment already processed' },
        { status: 400 }
      );
    }

    // Create receipt data
    const receiptData = {
      payment_id: paymentId,
      merchant_uid: paymentData.merchant_uid,
      amount: paymentData.amount,
      currency: paymentData.currency,
      payment_method: 'port_one',
      pg_provider: paymentData.pg_provider,
      payment_details: paymentData,
    };

    // Start transaction
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        user_id: user.id,
        product_id: productId,
        receipt_data: JSON.stringify(receiptData),
        receipt_hash: paymentId, // Using payment ID as hash for uniqueness
        status: 'completed',
        platform: 'web',
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
        verification_data: paymentData,
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
        // Note: We don't return error here as receipt is already created
      }
    }

    // Record star candy history
    const transactionId = `PURCHASE_${paymentId}`;
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
      verified: true,
      receipt_id: receipt.id,
      message: 'Payment verified and processed successfully',
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}