import { expect, it } from 'vitest';
import { createDiagnosticSession } from '@/lib/sentry/replay/diagnostic-session';
it('consumes consent once, stores ID in memory, and cannot reset closure', () => {
 const session=createDiagnosticSession();expect(session.snapshot()).toEqual({attempted:false,closed:false,visibleId:null});
 expect(session.markIdVisible('a'.repeat(32))).toBe(false);expect(session.consent()).toBe(true);expect(session.consent()).toBe(false);
 expect(session.markIdVisible('bad')).toBe(false);expect(session.markIdVisible('a'.repeat(32))).toBe(true);
 expect(session.markIdVisible('b'.repeat(32))).toBe(false);session.close();expect(session.consent()).toBe(false);
 expect(session.markIdVisible('a'.repeat(32))).toBe(false);expect(session.snapshot()).toEqual({attempted:true,closed:true,visibleId:'a'.repeat(32)});
});
it('closes before any consent, without consuming an attempt',()=>{const session=createDiagnosticSession();session.close();expect(session.consent()).toBe(false);expect(session.snapshot().attempted).toBe(false);});
