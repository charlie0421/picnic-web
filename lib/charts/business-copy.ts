export const businessCopyKeys = [
  'title', 'subtitle', 'back', 'introTitle', 'introBody', 'required', 'company', 'companyHint', 'email', 'emailHint', 'message', 'messageHint',
  'consent', 'decline', 'privacy', 'submit', 'busy', 'successTitle', 'success', 'error', 'rateLimited', 'conflict', 'newRequest', 'invalid',
  'companyError', 'emailError', 'messageError', 'consentError', 'security',
] as const;
export type BusinessCopy = Record<typeof businessCopyKeys[number], string>;
