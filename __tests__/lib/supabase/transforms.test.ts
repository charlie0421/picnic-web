import { describe, it, expect } from 'vitest';
import { transformData, transformResponse, serverTransformers, clientTransformers } from '@/lib/supabase/transforms';

describe('lib/supabase/transforms', () => {
  describe('transformData', () => {
    it('should convert snake_case keys to camelCase', () => {
      const data = { first_name: 'John', last_name: 'Doe' };
      const result = transformData(data);
      expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
    });

    it('should handle nested objects', () => {
      const data = {
        user_profile: {
          display_name: 'John',
          avatar_url: 'http://example.com/avatar.png',
        },
      };
      const result = transformData(data);
      expect(result).toEqual({
        userProfile: {
          displayName: 'John',
          avatarUrl: 'http://example.com/avatar.png',
        },
      });
    });

    it('should handle arrays', () => {
      const data = [
        { vote_id: 1, vote_total: 100 },
        { vote_id: 2, vote_total: 200 },
      ];
      const result = transformData(data);
      expect(result).toEqual([
        { voteId: 1, voteTotal: 100 },
        { voteId: 2, voteTotal: 200 },
      ]);
    });

    it('should handle arrays of nested objects', () => {
      const data = [
        { artist_name: 'A', group_info: { group_name: 'G1' } },
      ];
      const result = transformData(data);
      expect(result).toEqual([
        { artistName: 'A', groupInfo: { groupName: 'G1' } },
      ]);
    });

    it('should return null for null input', () => {
      expect(transformData(null)).toBeNull();
    });

    it('should return undefined for undefined input', () => {
      expect(transformData(undefined)).toBeUndefined();
    });

    it('should return primitives as-is', () => {
      expect(transformData('hello')).toBe('hello');
      expect(transformData(42)).toBe(42);
      expect(transformData(true)).toBe(true);
    });

    it('should handle empty objects', () => {
      expect(transformData({})).toEqual({});
    });

    it('should handle empty arrays', () => {
      expect(transformData([])).toEqual([]);
    });

    it('should handle keys without underscores', () => {
      const data = { name: 'John', age: 30 };
      const result = transformData(data);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should handle deeply nested structures', () => {
      const data = {
        level_one: {
          level_two: {
            level_three: {
              deep_value: 'found',
            },
          },
        },
      };
      const result = transformData(data);
      expect(result).toEqual({
        levelOne: {
          levelTwo: {
            levelThree: {
              deepValue: 'found',
            },
          },
        },
      });
    });

    it('should preserve Date objects', () => {
      const date = new Date('2024-01-01');
      const data = { created_at: date };
      const result = transformData(data);
      expect(result.createdAt).toBe(date);
    });
  });

  describe('transformResponse', () => {
    it('should transform data in a successful response', () => {
      const response = {
        data: { user_name: 'John', user_email: 'john@example.com' },
        error: null,
      };
      const result = transformResponse(response);
      expect(result.data).toEqual({ userName: 'John', userEmail: 'john@example.com' });
      expect(result.error).toBeNull();
    });

    it('should return response as-is when data is null', () => {
      const response = {
        data: null,
        error: { message: 'Not found' },
      };
      const result = transformResponse(response);
      expect(result.data).toBeNull();
      expect(result.error).toEqual({ message: 'Not found' });
    });

    it('should transform array data', () => {
      const response = {
        data: [{ vote_id: 1 }, { vote_id: 2 }],
        error: null,
      };
      const result = transformResponse(response);
      expect(result.data).toEqual([{ voteId: 1 }, { voteId: 2 }]);
    });

    it('should preserve error alongside transformed data', () => {
      const response = {
        data: { some_field: 'value' },
        error: { message: 'partial error' },
      };
      const result = transformResponse(response);
      expect(result.data).toEqual({ someField: 'value' });
      expect(result.error).toEqual({ message: 'partial error' });
    });
  });

  describe('serverTransformers', () => {
    it('should expose transform function', () => {
      expect(typeof serverTransformers.transform).toBe('function');
      expect(serverTransformers.transform({ hello_world: 1 })).toEqual({ helloWorld: 1 });
    });

    it('should expose transformResponse function', () => {
      expect(typeof serverTransformers.transformResponse).toBe('function');
    });

    it('transform should be the same as transformData', () => {
      expect(serverTransformers.transform).toBe(transformData);
    });

    it('transformResponse should be the same as the module transformResponse', () => {
      expect(serverTransformers.transformResponse).toBe(transformResponse);
    });
  });

  describe('clientTransformers', () => {
    it('should expose transform function', () => {
      expect(typeof clientTransformers.transform).toBe('function');
      expect(clientTransformers.transform({ foo_bar: 'baz' })).toEqual({ fooBar: 'baz' });
    });

    it('should expose transformResponse function', () => {
      expect(typeof clientTransformers.transformResponse).toBe('function');
    });

    it('transform should be the same as transformData', () => {
      expect(clientTransformers.transform).toBe(transformData);
    });

    it('transformResponse should be the same as the module transformResponse', () => {
      expect(clientTransformers.transformResponse).toBe(transformResponse);
    });
  });
});
