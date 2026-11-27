import { SUPPORTED_LANGUAGES, type Language } from '@/config/settings';

export type BusinessFields = { company: string; email: string; message: string; consent: boolean };
export type BusinessFieldErrors = Partial<Record<keyof BusinessFields, true>>;
export type BusinessInquiry = BusinessFields & { request_id: string; locale: Language };

const length = (value: string) => Array.from(value).length;

export function validateBusinessFields(fields: BusinessFields): BusinessFieldErrors {
  const company = fields.company.trim(), email = fields.email.trim(), message = fields.message.trim();
  return {
    ...(length(company) < 1 || length(company) > 120 ? { company: true as const } : {}),
    ...(length(email) > 254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(email) ? { email: true as const } : {}),
    ...(length(message) < 10 || length(message) > 3000 ? { message: true as const } : {}),
    ...(fields.consent !== true ? { consent: true as const } : {}),
  };
}

export function parseBusinessInquiry(value: unknown): BusinessInquiry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.company !== 'string' || typeof data.email !== 'string' || typeof data.message !== 'string' || typeof data.consent !== 'boolean' || typeof data.request_id !== 'string' || typeof data.locale !== 'string') return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.request_id) || !SUPPORTED_LANGUAGES.includes(data.locale as Language)) return null;
  const fields = { company: data.company.trim(), email: data.email.trim(), message: data.message.trim(), consent: data.consent };
  if (Object.keys(validateBusinessFields(fields)).length) return null;
  return { ...fields, request_id: data.request_id, locale: data.locale as Language };
}

export function isPrivateChartPath(pathname: string): boolean {
  const parts = pathname.split('/');
  return SUPPORTED_LANGUAGES.includes(parts[1] as Language) && parts[2] === 'charts' && ['business', 'artists'].includes(parts[3]) && (parts.length === 4 || (parts.length === 5 && parts[4] === ''));
}
