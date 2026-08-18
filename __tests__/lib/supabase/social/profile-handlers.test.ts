import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGoogleProfile, handleAppleProfile } from '@/lib/supabase/social/profile-handlers';

/**
 * 소셜 로그인 프로필 처리 계약.
 *
 * 핵심은 **기존 프로필을 갱신하지 않는다**는 것이다. nickname·avatar_url 은 앱에서
 * 사용자가 직접 바꾸는 값이라(update-nickname Edge Function, avatars 스토리지 업로드)
 * 로그인마다 소셜 값으로 덮으면 사용자가 설정한 것이 사라진다.
 */
type Row = Record<string, unknown> | null;

function makeClient(existing: Row) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
  const client = {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      insert,
      update,
    })),
  };
  return { client: client as never, insert, update };
}

const googleUser = {
  id: 'u-google',
  email: 'someone@example.com',
  user_metadata: {
    full_name: 'Google Name',
    name: 'Google Name',
    avatar_url: 'https://lh3.googleusercontent.com/a/pic',
    picture: 'https://lh3.googleusercontent.com/a/pic2',
  },
} as never;

const appleUser = {
  id: 'u-apple',
  email: 'apple.user@privaterelay.appleid.com',
  user_metadata: {},   // 실측: Apple 은 avatar_url·name 을 주지 않는다
} as never;

describe('소셜 프로필 처리', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('기존 프로필이 있으면 건드리지 않는다', () => {
    it('Google 재로그인은 update 도 insert 도 하지 않는다', async () => {
      const { client, insert, update } = makeClient({ id: 'u-google' });
      await handleGoogleProfile(client, googleUser);

      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('Apple 재로그인도 마찬가지다', async () => {
      const { client, insert, update } = makeClient({ id: 'u-apple' });
      await handleAppleProfile(client, appleUser);

      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('최초 인증 이름이 함께 와도 기존 프로필을 덮지 않는다', async () => {
      const { client, insert, update } = makeClient({ id: 'u-apple' });
      const params = { user: encodeURIComponent(JSON.stringify({ name: { firstName: '길동', lastName: '홍' } })) };
      await handleAppleProfile(client, appleUser, params);

      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('프로필이 없으면 폴백으로 생성한다', () => {
    it('Google — user_metadata 의 아바타와 이름을 쓴다', async () => {
      const { client, insert } = makeClient(null);
      await handleGoogleProfile(client, googleUser);

      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert.mock.calls[0][0]).toMatchObject({
        id: 'u-google',
        nickname: 'Google Name',
        avatar_url: 'https://lh3.googleusercontent.com/a/pic',
        email: 'someone@example.com',
      });
    });

    it('Google — avatar_url 이 없으면 picture 로 폴백한다', async () => {
      const { client, insert } = makeClient(null);
      const user = { ...googleUser, user_metadata: { picture: 'https://x/p.png' } } as never;
      await handleGoogleProfile(client, user);

      expect(insert.mock.calls[0][0]).toMatchObject({ avatar_url: 'https://x/p.png' });
    });

    it('Apple — 아바타는 항상 null 이다 (Apple 이 주지 않는다)', async () => {
      const { client, insert } = makeClient(null);
      await handleAppleProfile(client, appleUser);

      expect(insert.mock.calls[0][0]).toMatchObject({ avatar_url: null });
    });

    it('Apple — 최초 인증 시 전달된 이름을 닉네임으로 쓴다', async () => {
      const { client, insert } = makeClient(null);
      const params = { user: encodeURIComponent(JSON.stringify({ name: { firstName: '길동', lastName: '홍' } })) };
      await handleAppleProfile(client, appleUser, params);

      expect(insert.mock.calls[0][0]).toMatchObject({ nickname: '길동 홍' });
    });

    it('이름이 없으면 이메일 앞부분으로 폴백한다', async () => {
      const { client, insert } = makeClient(null);
      await handleAppleProfile(client, appleUser);

      expect(insert.mock.calls[0][0]).toMatchObject({ nickname: 'apple.user' });
    });

    it('user_profiles 에 없는 컬럼(provider 계열)을 쓰지 않는다', async () => {
      // 이전 구현이 provider·provider_id 를 넣어 PostgREST 42703 을 유발했다.
      const { client, insert } = makeClient(null);
      await handleGoogleProfile(client, googleUser);

      const payload = insert.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(
        ['avatar_url', 'created_at', 'email', 'id', 'nickname', 'updated_at'],
      );
    });
  });

  describe('실패해도 로그인을 막지 않는다', () => {
    it('프로필 조회가 실패하면 조용히 끝낸다', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
      const insert = vi.fn();
      const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }), insert }) } as never;

      await expect(handleGoogleProfile(client, googleUser)).resolves.toBeUndefined();
      expect(insert).not.toHaveBeenCalled();
    });

    it('Apple user 파라미터가 깨져도 예외를 던지지 않는다', async () => {
      const { client, insert } = makeClient(null);
      await expect(
        handleAppleProfile(client, appleUser, { user: '%%%not-json%%%' }),
      ).resolves.toBeUndefined();
      expect(insert).toHaveBeenCalledTimes(1);
    });
  });
});
