import { describe, expect, it } from 'vitest';
import { LegacyESLint } from 'eslint/use-at-your-own-risk';
const lint = new LegacyESLint({ cwd: process.cwd() });
describe('payment logging guards', () => {
  it.each([
    ['app/api/payment/portone/webhook/route.ts', 'console.error("private");', 'no-console'],
    ['app/api/payment/paypal/capture-order/route.ts', 'import { logError } from "@/utils/log-error";', 'no-restricted-imports'],
    ['app/api/payment/portone/verify/verify-helpers.ts', 'import { logger } from "../../../../../utils/logger";', 'no-restricted-imports'],
    ['lib/payment/portone.ts', 'import("@/utils/logger-utils");', 'no-restricted-syntax'],
    ['lib/payment/paypal.js', 'require("@sentry/nextjs");', 'no-restricted-syntax'],
    ['lib/payment/paypal.tsx', 'import * as Sentry from "@sentry/nextjs";', 'no-restricted-imports'],
  ])('rejects unsafe logging in %s', async (filePath, source, rule) => {
    const [result] = await lint.lintText(source, { filePath });
    expect(result.messages.some(({ ruleId, severity }) => ruleId === rule && severity === 2)).toBe(true);
  });
  it('allows the shared safe contract in browser payment code', async () => {
    const [result] = await lint.lintText('import { logSafeError } from "@/utils/log-safe-error"; logSafeError("payment.paypal.create.failed", new Error());', { filePath: 'lib/payment/paypal.ts' });
    expect(result.errorCount).toBe(0);
  });
});
