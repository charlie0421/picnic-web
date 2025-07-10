import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RechargeHistoryClient from './RechargeHistoryClient';

export default async function RechargeHistoryPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/recharge-history');
  }

  // 서버사이드에서 번역 로드
  let localeMessages: Record<string, string> = {};
  try {
    localeMessages = await import(`../../../../../public/locales/${lang}.json`).then(m => m.default);
  } catch (error) {
    console.error('번역 파일 로드 실패:', error);
    localeMessages = await import(`../../../../../public/locales/en.json`).then(m => m.default);
  }
  
  // 필요한 번역 키들을 추출
  const translations = {
    page_title_my_recharge_history: localeMessages['page_title_my_recharge_history'] || 'My Recharge History',
    label_loading: localeMessages['label_loading'] || 'Loading...',
    label_no_recharge_history: localeMessages['label_no_recharge_history'] || 'No recharge history',
    label_load_more: localeMessages['label_load_more'] || 'Load more',
    label_recharge_amount: localeMessages['label_recharge_amount'] || 'Recharge Amount',
    label_recharge_date: localeMessages['label_recharge_date'] || 'Recharge Date',
    label_recharge_method: localeMessages['label_recharge_method'] || 'Recharge Method',
    label_star_candy_amount: localeMessages['label_star_candy_amount'] || 'Star Candy Amount',
    label_error_occurred: localeMessages['label_error_occurred'] || 'An error occurred',
    label_retry: localeMessages['label_retry'] || 'Retry',
    label_back_to_mypage: localeMessages['label_back_to_mypage'] || 'Back to My Page',
    label_please_try_again: localeMessages['label_please_try_again'] || 'Please try again',
    label_loading_recharge_history: localeMessages['label_loading_recharge_history'] || 'Loading recharge history...',
    label_all_recharge_history_checked: localeMessages['label_all_recharge_history_checked'] || 'All recharge history checked',
    text_star_candy: localeMessages['text_star_candy'] || 'Star Candy',
    label_total_recharge_amount: localeMessages['label_total_recharge_amount'] || 'Total Recharge Amount',
    label_total_recharge_count: localeMessages['label_total_recharge_count'] || 'Total Recharge Count',
    label_receipt: localeMessages['label_receipt'] || 'Receipt',
    label_payment_amount: localeMessages['label_payment_amount'] || 'Payment Amount',
    label_exchange_rate: localeMessages['label_exchange_rate'] || 'Exchange Rate',
    label_bonus: localeMessages['label_bonus'] || 'Bonus',
    label_payment_method: localeMessages['label_payment_method'] || 'Payment Method',
    label_card_payment: localeMessages['label_card_payment'] || 'Card Payment',
    label_bank_transfer: localeMessages['label_bank_transfer'] || 'Bank Transfer',
    label_product_info: localeMessages['label_product_info'] || 'Product Info',
    label_quantity: localeMessages['label_quantity'] || 'Quantity',
    label_unit_price: localeMessages['label_unit_price'] || 'Unit Price',
    label_transaction_info: localeMessages['label_transaction_info'] || 'Transaction Info',
    label_transaction_id: localeMessages['label_transaction_id'] || 'Transaction ID',
    label_merchant_transaction_id: localeMessages['label_merchant_transaction_id'] || 'Merchant Transaction ID',
    label_transaction_datetime: localeMessages['label_transaction_datetime'] || 'Transaction Date/Time',
    label_transaction_time: localeMessages['label_transaction_time'] || 'Transaction Time',
    label_receipt_generated: localeMessages['label_receipt_generated'] || 'Receipt Generated',
    label_no_recharge_history_message: localeMessages['label_no_recharge_history_message'] || 'No recharge history message',
    label_go_recharge_star_candy: localeMessages['label_go_recharge_star_candy'] || 'Go recharge star candy',
    label_star_candy_recharge: localeMessages['label_star_candy_recharge'] || 'Star Candy Recharge',
    // 새로 추가된 번역 키들
    error_recharge_history_fetch_failed: localeMessages['error_recharge_history_fetch_failed'] || 'Failed to fetch recharge history',
    error_unknown_occurred: localeMessages['error_unknown_occurred'] || 'An unknown error occurred',
    console_recharge_history_fetch_error: localeMessages['console_recharge_history_fetch_error'] || 'Recharge history fetch error',
    star_candy_purchase_description: localeMessages['star_candy_purchase_description'] || 'Star Candy Purchase',
    label_recharge_count_description: localeMessages['label_recharge_count_description'] || '총 구매 횟수',
    label_amount_description: localeMessages['label_amount_description'] || '총 결제 금액',
    label_star_candy_description: localeMessages['label_star_candy_description'] || '총 받은 별사탕',
    // 누락된 번역 키들 추가
    label_copy: localeMessages['label_copy'] || 'Copy',
    label_received_star_candy: localeMessages['label_received_star_candy'] || 'Received Star Candy',
    label_product_code: localeMessages['label_product_code'] || 'Product Code',
    timezone_kst: localeMessages['timezone_kst'] || 'KST',
    label_paypal: localeMessages['label_paypal'] || 'PayPal',
    label_total_transactions: localeMessages['label_total_transactions'] || 'Total Transactions',
    label_transactions_description: localeMessages['label_transactions_description'] || 'Total number of transactions',
    label_total_recharged: localeMessages['label_total_recharged'] || 'Total Recharged',
    label_recharged_description: localeMessages['label_recharged_description'] || 'Total amount recharged',
    label_this_month: localeMessages['label_this_month'] || 'This Month',
    label_month_description: localeMessages['label_month_description'] || 'This month',
    label_product_name: localeMessages['label_product_name'] || 'Product Name',
    label_unknown_product: localeMessages['label_unknown_product'] || 'Unknown Product',
    label_payment_status: localeMessages['label_payment_status'] || 'Payment Status',
    label_payment_completed: localeMessages['label_payment_completed'] || 'Payment Completed',
    label_payment_pending: localeMessages['label_payment_pending'] || 'Payment Pending',
    label_payment_failed: localeMessages['label_payment_failed'] || 'Payment Failed',
    label_transaction_date: localeMessages['label_transaction_date'] || 'Transaction Date',
    label_go_to_store: localeMessages['label_go_to_store'] || 'Go to Store'
  };

  return (
    <RechargeHistoryClient 
      initialUser={user}
      translations={translations}
    />
  );
} 