import { createPayPalOrderHandler } from '@/lib/payment/paypal-charge/order-entry';

export const dynamic = 'force-dynamic';
export const POST = createPayPalOrderHandler('capture');
