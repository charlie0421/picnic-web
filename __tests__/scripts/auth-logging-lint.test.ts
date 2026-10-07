import { describe, expect, it } from 'vitest';
import { LegacyESLint } from 'eslint/use-at-your-own-risk';

// Match Next 15 lint's .eslintrc loading rather than ESLint 9's flat-config default.
const lint = new LegacyESLint({ cwd: process.cwd() });

describe('auth logging guardrails reject unsafe logging before deployment', () => {
  it.each([
    ['app/api/auth/register/route.ts', 'console.error(new Error("private"));', 'no-console'],
    ['lib/supabase/social/google.ts', 'console.warn({ token: "private" });', 'no-console'],
    ['lib/supabase/server.ts', 'import { logError } from "@/utils/log-error"; logError("private");', 'no-restricted-imports'],
    ['app/api/auth/register/route.ts', 'import { logger } from "../../../../utils/logger"; logger.error("private");', 'no-restricted-imports'],
    ['lib/supabase/social/service.ts', 'import { logAuth } from "@/utils/auth-logger"; logAuth("private");', 'no-restricted-imports'],
    ['app/api/auth/register/route.tsx', 'console.log("private");', 'no-console'],
    ['lib/supabase/server.ts', 'import { logger } from "@/utils/logger";', 'no-restricted-imports'],
    ['lib/supabase/server.ts', 'import "../../utils/log-error";', 'no-restricted-imports'],
    ['lib/supabase/server.js', 'require("@/utils/logger-utils");', 'no-restricted-syntax'],
    ['lib/supabase/server.ts', 'import("@/utils/log-error");', 'no-restricted-syntax'],
    ['lib/supabase/server.ts', 'import * as Sentry from "@sentry/nextjs";', 'no-restricted-imports'],
    ['lib/supabase/server.ts', 'import("@sentry/nextjs");', 'no-restricted-syntax'],
  ])('blocks unsafe source in %s', async (filePath, source, rule) => {
    const [result] = await lint.lintText(source, { filePath });
    expect(result.messages.some(({ ruleId, severity }) => ruleId === rule && severity === 2)).toBe(true);
  });

  it('keeps payment logging outside this auth-only guard', async () => {
    const [result] = await lint.lintText('console.error("failure");', { filePath: 'app/api/payment/route.ts' });
    expect(result.messages.some(({ ruleId }) => ruleId === 'no-console')).toBe(false);
  });

  it('allows the safe auth contract' , async () => {
    const [result] = await lint.lintText(
      'import { logSafeError } from "@/utils/log-safe-error"; logSafeError("auth.register.failed", new Error("private"));',
      { filePath: 'app/api/auth/register/route.ts' },
    );
    expect(result.errorCount).toBe(0);
  });
});
