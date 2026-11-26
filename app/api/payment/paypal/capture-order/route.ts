// Clients must use the server-order PayPal checkout endpoints.
export function POST(_request: Request): Response {
  return Response.json({ error: 'LEGACY_PAYPAL_ROUTE_RETIRED' }, {
    status: 410, headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
