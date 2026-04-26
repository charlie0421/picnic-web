import { create } from 'zustand';

export interface GoonghapI18n {
  score_title: string | null;
  goonghap_summary: string | null;
  details: any | null;
  tips: string[] | null;
  language: string;
}

export interface GoonghapResult {
  id: string;
  artist_id: number;
  score: number | null;
  status: 'pending' | 'completed' | 'failed' | 'error';
  is_paid: boolean;
  is_ads: boolean;
  created_at: string;
  completed_at?: string | null;
  user_birth_date?: string | null;
  user_birth_time?: string | null;
  gender?: string | null;
  artist_name?: any;
  artist_image?: string | null;
  artist?: {
    id: number;
    name: any;
    image: string | null;
  } | null;
  goonghap_results_i18n?: GoonghapI18n[];
}

interface GoonghapStore {
  // 캐시된 궁합 결과 맵 (id -> result)
  cache: Map<string, GoonghapResult>;

  // 목록에서 로드된 결과들 (미리 캐싱)
  listResults: GoonghapResult[];

  // Actions
  setListResults: (results: GoonghapResult[]) => void;
  setCachedResult: (id: string, result: GoonghapResult) => void;
  getCachedResult: (id: string) => GoonghapResult | null;
  updateCachedResult: (id: string, updates: Partial<GoonghapResult>) => void;
  clearCache: () => void;
}

export const useGoonghapStore = create<GoonghapStore>((set, get) => ({
  cache: new Map(),
  listResults: [],

  setListResults: (results) => {
    const cache = new Map(get().cache);
    // 목록 결과를 캐시에 추가
    results.forEach((result) => {
      cache.set(result.id, result);
    });
    set({ listResults: results, cache });
  },

  setCachedResult: (id, result) => {
    const cache = new Map(get().cache);
    cache.set(id, result);
    set({ cache });
  },

  getCachedResult: (id) => {
    return get().cache.get(id) || null;
  },

  updateCachedResult: (id, updates) => {
    const cache = new Map(get().cache);
    const existing = cache.get(id);
    if (existing) {
      cache.set(id, { ...existing, ...updates });
      set({ cache });
    }
  },

  clearCache: () => {
    set({ cache: new Map(), listResults: [] });
  },
}));
