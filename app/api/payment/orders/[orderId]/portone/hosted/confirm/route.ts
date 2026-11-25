import { createPortOneHostedOrderHandler } from '@/lib/payment/portone-hosted/order-entry';

export const dynamic = 'force-dynamic';
export const POST = createPortOneHostedOrderHandler('confirm');
