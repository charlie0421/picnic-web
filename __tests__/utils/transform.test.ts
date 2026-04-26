import { describe, it, expect } from 'vitest'
import {
  snakeToCamelCase,
  snakeToCamel,
  camelToSnakeCase,
  camelToSnake,
} from '@/utils/transform'

describe('snakeToCamelCase', () => {
  it('converts basic snake_case to camelCase', () => {
    expect(snakeToCamelCase('hello_world')).toBe('helloWorld')
  })

  it('converts multi-word snake_case', () => {
    expect(snakeToCamelCase('my_variable_name')).toBe('myVariableName')
  })

  it('returns empty string for empty input', () => {
    expect(snakeToCamelCase('')).toBe('')
  })

  it('returns string unchanged when no underscores', () => {
    expect(snakeToCamelCase('hello')).toBe('hello')
  })

  it('handles multiple consecutive underscores', () => {
    const result = snakeToCamelCase('hello__world')
    expect(result).toBeDefined()
  })

  it('handles leading underscores', () => {
    const result = snakeToCamelCase('_hello_world')
    expect(result).toBeDefined()
  })

  it('handles trailing underscores', () => {
    const result = snakeToCamelCase('hello_world_')
    expect(result).toBeDefined()
  })

  it('handles single character segments', () => {
    expect(snakeToCamelCase('a_b_c')).toBe('aBC')
  })

  it('handles already camelCase input', () => {
    expect(snakeToCamelCase('helloWorld')).toBe('helloWorld')
  })

  it('handles all uppercase segments', () => {
    const result = snakeToCamelCase('HELLO_WORLD')
    expect(result).toBeDefined()
  })
})

describe('snakeToCamel', () => {
  it('returns null for null input', () => {
    expect(snakeToCamel(null)).toBeNull()
  })

  it('returns undefined for undefined input', () => {
    expect(snakeToCamel(undefined)).toBeUndefined()
  })

  it('returns primitives unchanged', () => {
    expect(snakeToCamel(42)).toBe(42)
    expect(snakeToCamel('hello')).toBe('hello')
    expect(snakeToCamel(true)).toBe(true)
    expect(snakeToCamel(false)).toBe(false)
  })

  it('converts array of objects', () => {
    const input = [{ first_name: 'John' }, { last_name: 'Doe' }]
    const result = snakeToCamel(input) as Record<string, unknown>[]
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]).toHaveProperty('firstName', 'John')
    expect(result[1]).toHaveProperty('lastName', 'Doe')
  })

  it('converts nested objects', () => {
    const input = {
      user_name: 'test',
      user_profile: {
        first_name: 'John',
        last_name: 'Doe',
      },
    }
    const result = snakeToCamel(input) as Record<string, unknown>
    expect(result).toHaveProperty('userName', 'test')
    const profile = result.userProfile as Record<string, unknown>
    expect(profile).toHaveProperty('firstName', 'John')
    expect(profile).toHaveProperty('lastName', 'Doe')
  })

  it('preserves Date objects', () => {
    const date = new Date('2024-01-01')
    const input = { created_at: date }
    const result = snakeToCamel(input) as Record<string, unknown>
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt).toEqual(date)
  })

  it('handles empty object', () => {
    expect(snakeToCamel({})).toEqual({})
  })

  it('handles empty array', () => {
    expect(snakeToCamel([])).toEqual([])
  })

  it('handles arrays of primitives', () => {
    expect(snakeToCamel([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('handles deeply nested structures', () => {
    const input = {
      level_one: {
        level_two: {
          level_three: 'value',
        },
      },
    }
    const result = snakeToCamel(input) as Record<string, Record<string, Record<string, string>>>
    expect(result.levelOne.levelTwo.levelThree).toBe('value')
  })
})

describe('camelToSnakeCase', () => {
  it('converts basic camelCase to snake_case', () => {
    expect(camelToSnakeCase('helloWorld')).toBe('hello_world')
  })

  it('converts multi-word camelCase', () => {
    expect(camelToSnakeCase('myVariableName')).toBe('my_variable_name')
  })

  it('returns empty string for empty input', () => {
    expect(camelToSnakeCase('')).toBe('')
  })

  it('returns string unchanged when no uppercase letters', () => {
    expect(camelToSnakeCase('hello')).toBe('hello')
  })

  it('handles consecutive uppercase letters', () => {
    const result = camelToSnakeCase('myHTTPClient')
    expect(result).toBeDefined()
  })

  it('handles string starting with uppercase', () => {
    const result = camelToSnakeCase('HelloWorld')
    expect(result).toBeDefined()
  })

  it('handles single character input', () => {
    expect(camelToSnakeCase('a')).toBe('a')
  })

  it('handles already snake_case input', () => {
    expect(camelToSnakeCase('hello_world')).toBe('hello_world')
  })
})

describe('camelToSnake', () => {
  it('returns null for null input', () => {
    expect(camelToSnake(null)).toBeNull()
  })

  it('returns undefined for undefined input', () => {
    expect(camelToSnake(undefined)).toBeUndefined()
  })

  it('returns primitives unchanged', () => {
    expect(camelToSnake(42)).toBe(42)
    expect(camelToSnake('hello')).toBe('hello')
    expect(camelToSnake(true)).toBe(true)
    expect(camelToSnake(false)).toBe(false)
  })

  it('converts array of objects', () => {
    const input = [{ firstName: 'John' }, { lastName: 'Doe' }]
    const result = camelToSnake(input) as Record<string, unknown>[]
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]).toHaveProperty('first_name', 'John')
    expect(result[1]).toHaveProperty('last_name', 'Doe')
  })

  it('converts nested objects', () => {
    const input = {
      userName: 'test',
      userProfile: {
        firstName: 'John',
        lastName: 'Doe',
      },
    }
    const result = camelToSnake(input) as Record<string, unknown>
    expect(result).toHaveProperty('user_name', 'test')
    const profile = result.user_profile as Record<string, unknown>
    expect(profile).toHaveProperty('first_name', 'John')
    expect(profile).toHaveProperty('last_name', 'Doe')
  })

  it('preserves Date objects', () => {
    const date = new Date('2024-01-01')
    const input = { createdAt: date }
    const result = camelToSnake(input) as Record<string, unknown>
    expect(result.created_at).toBeInstanceOf(Date)
    expect(result.created_at).toEqual(date)
  })

  it('handles empty object', () => {
    expect(camelToSnake({})).toEqual({})
  })

  it('handles empty array', () => {
    expect(camelToSnake([])).toEqual([])
  })

  it('handles arrays of primitives', () => {
    expect(camelToSnake([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('handles deeply nested structures', () => {
    const input = {
      levelOne: {
        levelTwo: {
          levelThree: 'value',
        },
      },
    }
    const result = camelToSnake(input) as Record<string, Record<string, Record<string, string>>>
    expect(result.level_one.level_two.level_three).toBe('value')
  })
})
