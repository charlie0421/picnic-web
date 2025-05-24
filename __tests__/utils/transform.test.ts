/**
 * transform.ts 테스트
 *
 * 이 테스트는 데이터 변환 유틸리티 함수들을 검증합니다.
 * 테스트 대상: snakeToCamelCase, snakeToCamel, camelToSnakeCase, camelToSnake
 */

import {
  snakeToCamelCase,
  snakeToCamel,
  camelToSnakeCase,
  camelToSnake,
} from '@/utils/transform';

describe('transform utils', () => {
  describe('snakeToCamelCase', () => {
    it('스네이크 케이스를 카멜 케이스로 변환한다', () => {
      expect(snakeToCamelCase('hello_world')).toBe('helloWorld');
      expect(snakeToCamelCase('user_name')).toBe('userName');
      expect(snakeToCamelCase('created_at')).toBe('createdAt');
      expect(snakeToCamelCase('vote_total_count')).toBe('voteTotalCount');
    });

    it('이미 카멜 케이스인 문자열은 그대로 반환한다', () => {
      expect(snakeToCamelCase('helloWorld')).toBe('helloWorld');
      expect(snakeToCamelCase('userName')).toBe('userName');
      expect(snakeToCamelCase('id')).toBe('id');
    });

    it('빈 문자열을 처리한다', () => {
      expect(snakeToCamelCase('')).toBe('');
    });

    it('언더스코어가 없는 문자열을 처리한다', () => {
      expect(snakeToCamelCase('hello')).toBe('hello');
      expect(snakeToCamelCase('test')).toBe('test');
    });

    it('연속된 언더스코어를 처리한다', () => {
      expect(snakeToCamelCase('hello__world')).toBe('hello_World');
      expect(snakeToCamelCase('test___case')).toBe('test__Case');
    });

    it('시작과 끝에 언더스코어가 있는 경우를 처리한다', () => {
      expect(snakeToCamelCase('_hello_world')).toBe('HelloWorld');
      expect(snakeToCamelCase('hello_world_')).toBe('helloWorld_');
    });
  });

  describe('snakeToCamel', () => {
    it('객체의 키를 스네이크 케이스에서 카멜 케이스로 변환한다', () => {
      const input = {
        user_name: 'John',
        created_at: '2023-01-01',
        vote_total: 100,
      };

      const expected = {
        userName: 'John',
        createdAt: '2023-01-01',
        voteTotal: 100,
      };

      expect(snakeToCamel(input)).toEqual(expected);
    });

    it('중첩된 객체를 재귀적으로 변환한다', () => {
      const input = {
        user_info: {
          first_name: 'John',
          last_name: 'Doe',
          contact_info: {
            email_address: 'john@example.com',
            phone_number: '123-456-7890',
          },
        },
        created_at: '2023-01-01',
      };

      const expected = {
        userInfo: {
          firstName: 'John',
          lastName: 'Doe',
          contactInfo: {
            emailAddress: 'john@example.com',
            phoneNumber: '123-456-7890',
          },
        },
        createdAt: '2023-01-01',
      };

      expect(snakeToCamel(input)).toEqual(expected);
    });

    it('배열을 처리한다', () => {
      const input = [
        { user_name: 'John', created_at: '2023-01-01' },
        { user_name: 'Jane', created_at: '2023-01-02' },
      ];

      const expected = [
        { userName: 'John', createdAt: '2023-01-01' },
        { userName: 'Jane', createdAt: '2023-01-02' },
      ];

      expect(snakeToCamel(input)).toEqual(expected);
    });

    it('null과 undefined를 처리한다', () => {
      expect(snakeToCamel(null)).toBeNull();
      expect(snakeToCamel(undefined)).toBeUndefined();
    });

    it('원시 타입을 그대로 반환한다', () => {
      expect(snakeToCamel('hello')).toBe('hello');
      expect(snakeToCamel(123)).toBe(123);
      expect(snakeToCamel(true)).toBe(true);
      expect(snakeToCamel(false)).toBe(false);
    });

    it('Date 객체를 그대로 반환한다', () => {
      const date = new Date('2023-01-01');
      expect(snakeToCamel(date)).toBe(date);
    });

    it('빈 객체를 처리한다', () => {
      expect(snakeToCamel({})).toEqual({});
    });

    it('빈 배열을 처리한다', () => {
      expect(snakeToCamel([])).toEqual([]);
    });

    it('복잡한 중첩 구조를 처리한다', () => {
      const input = {
        vote_data: [
          {
            vote_id: 1,
            vote_items: [
              { artist_name: 'Artist 1', vote_count: 100 },
              { artist_name: 'Artist 2', vote_count: 200 },
            ],
            created_at: '2023-01-01',
          },
        ],
        meta_info: {
          total_count: 2,
          page_size: 10,
        },
      };

      const expected = {
        voteData: [
          {
            voteId: 1,
            voteItems: [
              { artistName: 'Artist 1', voteCount: 100 },
              { artistName: 'Artist 2', voteCount: 200 },
            ],
            createdAt: '2023-01-01',
          },
        ],
        metaInfo: {
          totalCount: 2,
          pageSize: 10,
        },
      };

      expect(snakeToCamel(input)).toEqual(expected);
    });
  });

  describe('camelToSnakeCase', () => {
    it('카멜 케이스를 스네이크 케이스로 변환한다', () => {
      expect(camelToSnakeCase('helloWorld')).toBe('hello_world');
      expect(camelToSnakeCase('userName')).toBe('user_name');
      expect(camelToSnakeCase('createdAt')).toBe('created_at');
      expect(camelToSnakeCase('voteTotalCount')).toBe('vote_total_count');
    });

    it('이미 스네이크 케이스인 문자열은 그대로 반환한다', () => {
      expect(camelToSnakeCase('hello_world')).toBe('hello_world');
      expect(camelToSnakeCase('user_name')).toBe('user_name');
      expect(camelToSnakeCase('id')).toBe('id');
    });

    it('빈 문자열을 처리한다', () => {
      expect(camelToSnakeCase('')).toBe('');
    });

    it('대문자가 없는 문자열을 처리한다', () => {
      expect(camelToSnakeCase('hello')).toBe('hello');
      expect(camelToSnakeCase('test')).toBe('test');
    });

    it('연속된 대문자를 처리한다', () => {
      expect(camelToSnakeCase('XMLHttpRequest')).toBe('_x_m_l_http_request');
      expect(camelToSnakeCase('HTMLElement')).toBe('_h_t_m_l_element');
    });

    it('첫 글자가 대문자인 경우를 처리한다', () => {
      expect(camelToSnakeCase('HelloWorld')).toBe('_hello_world');
      expect(camelToSnakeCase('UserName')).toBe('_user_name');
    });
  });

  describe('camelToSnake', () => {
    it('객체의 키를 카멜 케이스에서 스네이크 케이스로 변환한다', () => {
      const input = {
        userName: 'John',
        createdAt: '2023-01-01',
        voteTotal: 100,
      };

      const expected = {
        user_name: 'John',
        created_at: '2023-01-01',
        vote_total: 100,
      };

      expect(camelToSnake(input)).toEqual(expected);
    });

    it('중첩된 객체를 재귀적으로 변환한다', () => {
      const input = {
        userInfo: {
          firstName: 'John',
          lastName: 'Doe',
          contactInfo: {
            emailAddress: 'john@example.com',
            phoneNumber: '123-456-7890',
          },
        },
        createdAt: '2023-01-01',
      };

      const expected = {
        user_info: {
          first_name: 'John',
          last_name: 'Doe',
          contact_info: {
            email_address: 'john@example.com',
            phone_number: '123-456-7890',
          },
        },
        created_at: '2023-01-01',
      };

      expect(camelToSnake(input)).toEqual(expected);
    });

    it('배열을 처리한다', () => {
      const input = [
        { userName: 'John', createdAt: '2023-01-01' },
        { userName: 'Jane', createdAt: '2023-01-02' },
      ];

      const expected = [
        { user_name: 'John', created_at: '2023-01-01' },
        { user_name: 'Jane', created_at: '2023-01-02' },
      ];

      expect(camelToSnake(input)).toEqual(expected);
    });

    it('null과 undefined를 처리한다', () => {
      expect(camelToSnake(null)).toBeNull();
      expect(camelToSnake(undefined)).toBeUndefined();
    });

    it('원시 타입을 그대로 반환한다', () => {
      expect(camelToSnake('hello')).toBe('hello');
      expect(camelToSnake(123)).toBe(123);
      expect(camelToSnake(true)).toBe(true);
      expect(camelToSnake(false)).toBe(false);
    });

    it('Date 객체를 그대로 반환한다', () => {
      const date = new Date('2023-01-01');
      expect(camelToSnake(date)).toBe(date);
    });

    it('빈 객체를 처리한다', () => {
      expect(camelToSnake({})).toEqual({});
    });

    it('빈 배열을 처리한다', () => {
      expect(camelToSnake([])).toEqual([]);
    });
  });

  describe('양방향 변환 테스트', () => {
    it('스네이크 케이스 -> 카멜 케이스 -> 스네이크 케이스 변환이 일관성을 유지한다', () => {
      const original = {
        user_name: 'John',
        created_at: '2023-01-01',
        vote_total: 100,
        nested_object: {
          first_name: 'John',
          last_name: 'Doe',
        },
      };

      const camelCase = snakeToCamel(original);
      const backToSnake = camelToSnake(camelCase);

      expect(backToSnake).toEqual(original);
    });

    it('카멜 케이스 -> 스네이크 케이스 -> 카멜 케이스 변환이 일관성을 유지한다', () => {
      const original = {
        userName: 'John',
        createdAt: '2023-01-01',
        voteTotal: 100,
        nestedObject: {
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      const snakeCase = camelToSnake(original);
      const backToCamel = snakeToCamel(snakeCase);

      expect(backToCamel).toEqual(original);
    });
  });
}); 