/**
 * Enums 유틸리티 테스트
 */

import { PolicyLanguage, PolicyType, PortalType, Gender } from '../../utils/enums';

describe('Enums', () => {
  describe('PolicyLanguage', () => {
    it('contains expected language values', () => {
      expect(PolicyLanguage.EN).toBe('en');
      expect(PolicyLanguage.KO).toBe('ko');
    });

    it('has correct number of enum values', () => {
      const values = Object.values(PolicyLanguage);
      expect(values).toHaveLength(2);
      expect(values).toContain('en');
      expect(values).toContain('ko');
    });

    it('has correct enum keys', () => {
      const keys = Object.keys(PolicyLanguage);
      expect(keys).toContain('EN');
      expect(keys).toContain('KO');
    });
  });

  describe('PolicyType', () => {
    it('contains expected policy type values', () => {
      expect(PolicyType.PRIVACY).toBe('privacy');
      expect(PolicyType.TERMS).toBe('terms');
      expect(PolicyType.WITHDRAW).toBe('withdraw');
    });

    it('has correct number of enum values', () => {
      const values = Object.values(PolicyType);
      expect(values).toHaveLength(3);
      expect(values).toContain('privacy');
      expect(values).toContain('terms');
      expect(values).toContain('withdraw');
    });

    it('has correct enum keys', () => {
      const keys = Object.keys(PolicyType);
      expect(keys).toContain('PRIVACY');
      expect(keys).toContain('TERMS');
      expect(keys).toContain('WITHDRAW');
    });
  });

  describe('PortalType', () => {
    it('contains expected portal type values', () => {
      expect(PortalType.PUBLIC).toBe('public');
      expect(PortalType.VOTE).toBe('vote');
      expect(PortalType.PIC).toBe('pic');
      expect(PortalType.COMMUNITY).toBe('community');
      expect(PortalType.NOVEL).toBe('novel');
      expect(PortalType.MYPAGE).toBe('mypage');
      expect(PortalType.MEDIA).toBe('media');
      expect(PortalType.SHOP).toBe('shop');
      expect(PortalType.AUTH).toBe('auth');
    });

    it('has correct number of enum values', () => {
      const values = Object.values(PortalType);
      expect(values).toHaveLength(9);
      expect(values).toEqual([
        'public',
        'vote',
        'pic',
        'community',
        'novel',
        'mypage',
        'media',
        'shop',
        'auth'
      ]);
    });

    it('has correct enum keys', () => {
      const keys = Object.keys(PortalType);
      expect(keys).toContain('PUBLIC');
      expect(keys).toContain('VOTE');
      expect(keys).toContain('PIC');
      expect(keys).toContain('COMMUNITY');
      expect(keys).toContain('NOVEL');
      expect(keys).toContain('MYPAGE');
      expect(keys).toContain('MEDIA');
      expect(keys).toContain('SHOP');
      expect(keys).toContain('AUTH');
    });

    it('can be used in switch statements', () => {
      const getPortalDescription = (portal: PortalType): string => {
        switch (portal) {
          case PortalType.PUBLIC:
            return 'Public portal';
          case PortalType.VOTE:
            return 'Voting portal';
          case PortalType.MYPAGE:
            return 'My page portal';
          default:
            return 'Unknown portal';
        }
      };

      expect(getPortalDescription(PortalType.PUBLIC)).toBe('Public portal');
      expect(getPortalDescription(PortalType.VOTE)).toBe('Voting portal');
      expect(getPortalDescription(PortalType.MYPAGE)).toBe('My page portal');
    });
  });

  describe('Gender', () => {
    it('contains expected gender values', () => {
      expect(Gender.MALE).toBe('male');
      expect(Gender.FEMALE).toBe('female');
    });

    it('has correct number of enum values', () => {
      const values = Object.values(Gender);
      expect(values).toHaveLength(2);
      expect(values).toContain('male');
      expect(values).toContain('female');
    });

    it('has correct enum keys', () => {
      const keys = Object.keys(Gender);
      expect(keys).toContain('MALE');
      expect(keys).toContain('FEMALE');
    });

    it('can be used for type checking', () => {
      const isValidGender = (value: string): value is Gender => {
        return Object.values(Gender).includes(value as Gender);
      };

      expect(isValidGender('male')).toBe(true);
      expect(isValidGender('female')).toBe(true);
      expect(isValidGender('other')).toBe(false);
      expect(isValidGender('')).toBe(false);
    });
  });

  describe('Enum consistency', () => {
    it('all enums are properly exported', () => {
      expect(PolicyLanguage).toBeDefined();
      expect(PolicyType).toBeDefined();
      expect(PortalType).toBeDefined();
      expect(Gender).toBeDefined();
    });

    it('enum values are strings', () => {
      Object.values(PolicyLanguage).forEach(value => {
        expect(typeof value).toBe('string');
      });

      Object.values(PolicyType).forEach(value => {
        expect(typeof value).toBe('string');
      });

      Object.values(PortalType).forEach(value => {
        expect(typeof value).toBe('string');
      });

      Object.values(Gender).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });

    it('enum values are lowercase', () => {
      Object.values(PolicyLanguage).forEach(value => {
        expect(value).toBe(value.toLowerCase());
      });

      Object.values(PolicyType).forEach(value => {
        expect(value).toBe(value.toLowerCase());
      });

      Object.values(PortalType).forEach(value => {
        expect(value).toBe(value.toLowerCase());
      });

      Object.values(Gender).forEach(value => {
        expect(value).toBe(value.toLowerCase());
      });
    });
  });
}); 