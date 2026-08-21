import { describe, it, expect } from 'vitest';
import { redactLogEntry } from '@/utils/log-redaction';
import { LogLevel } from '@/utils/logger-types';
import type { LogEntry } from '@/utils/logger-types';

const base = (over: Partial<LogEntry> = {}): LogEntry => ({
  timestamp: '2026-08-21T00:00:00.000Z',
  level: LogLevel.ERROR,
  message: 'boom',
  environment: 'production',
  service: 'picnic-web',
  ...over,
});

describe('redactLogEntry', () => {
  describe('요청 헤더', () => {
    it('authorization 헤더를 제거한다', () => {
      const out = redactLogEntry(base({
        request: { headers: { authorization: 'Bearer secret-token', accept: 'application/json' } },
      }));
      expect(out.request?.headers).not.toHaveProperty('authorization');
      expect(out.request?.headers?.accept).toBe('application/json');
    });

    it('헤더 이름의 대소문자를 가리지 않는다', () => {
      const out = redactLogEntry(base({
        request: { headers: { Authorization: 'Bearer x', Cookie: 'sb=1', APIKey: 'k' } },
      }));
      expect(JSON.stringify(out.request?.headers)).not.toContain('Bearer x');
      expect(JSON.stringify(out.request?.headers)).not.toContain('sb=1');
      expect(JSON.stringify(out.request?.headers)).not.toContain('"k"');
    });

    it('cookie, set-cookie, apikey, x-api-key 를 제거한다', () => {
      const out = redactLogEntry(base({
        request: {
          headers: {
            cookie: 'session=abc',
            'set-cookie': 'session=abc',
            apikey: 'supabase-key',
            'x-api-key': 'k2',
            'user-agent': 'Mozilla/5.0',
          },
        },
      }));
      const s = JSON.stringify(out.request?.headers);
      expect(s).not.toContain('session=abc');
      expect(s).not.toContain('supabase-key');
      expect(s).not.toContain('k2');
      expect(out.request?.headers?.['user-agent']).toBe('Mozilla/5.0');
    });
  });

  describe('URL 쿼리스트링', () => {
    it('쿼리스트링을 제거하고 경로만 남긴다', () => {
      const out = redactLogEntry(base({
        request: { url: '/api/user/profile?token=secret&id=42' },
      }));
      expect(out.request?.url).toBe('/api/user/profile');
    });

    it('절대 URL 도 경로만 남긴다', () => {
      const out = redactLogEntry(base({
        request: { url: 'https://picnic.example/api/x?access_token=abc' },
      }));
      expect(out.request?.url).not.toContain('access_token');
      expect(out.request?.url).toContain('/api/x');
    });
  });

  describe('사용자 식별자', () => {
    it('id 는 유지하고 email 은 제거한다', () => {
      const out = redactLogEntry(base({ user: { id: 'u-1', email: 'a@b.com' } }));
      expect(out.user?.id).toBe('u-1');
      expect(out.user).not.toHaveProperty('email');
    });

    it('ip 를 제거한다', () => {
      const out = redactLogEntry(base({ request: { ip: '203.0.113.9', method: 'GET' } }));
      expect(out.request).not.toHaveProperty('ip');
      expect(out.request?.method).toBe('GET');
    });
  });

  describe('context', () => {
    it('context 안의 민감 키를 제거한다', () => {
      const out = redactLogEntry(base({
        context: { operation: 'vote', accessToken: 'tok', password: 'pw', voteId: 7 },
      }));
      expect(out.context).not.toHaveProperty('accessToken');
      expect(out.context).not.toHaveProperty('password');
      expect(out.context?.operation).toBe('vote');
      expect(out.context?.voteId).toBe(7);
    });

    it('중첩 객체 안의 민감 키도 제거한다', () => {
      const out = redactLogEntry(base({
        context: { payload: { authorization: 'Bearer y', amount: 100 } },
      }));
      expect(JSON.stringify(out.context)).not.toContain('Bearer y');
      expect(JSON.stringify(out.context)).toContain('100');
    });

    it('context 안의 URL 쿼리스트링도 제거한다', () => {
      const out = redactLogEntry(base({
        context: { url: 'https://x.test/cb?code=authcode123' },
      }));
      expect(JSON.stringify(out.context)).not.toContain('authcode123');
    });
  });

  describe('안전성', () => {
    it('원본 엔트리를 변형하지 않는다', () => {
      const entry = base({ user: { id: 'u', email: 'a@b.com' } });
      redactLogEntry(entry);
      expect(entry.user?.email).toBe('a@b.com');
    });

    it('순환 참조가 있어도 throw 하지 않는다', () => {
      const circular: any = { name: 'x' };
      circular.self = circular;
      expect(() => redactLogEntry(base({ context: circular }))).not.toThrow();
    });

    it('선택 필드가 없어도 동작한다', () => {
      expect(() => redactLogEntry(base())).not.toThrow();
    });
  });
});
