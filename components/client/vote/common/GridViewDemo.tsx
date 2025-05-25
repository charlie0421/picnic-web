'use client';

import React from 'react';
import { GridView } from './GridView';

// 샘플 데이터 - 타입 오류를 피하기 위해 any 사용
const sampleItems: any[] = [
  {
    id: 1,
    artist_id: 1,
    created_at: new Date().toISOString(),
    deleted_at: null,
    group_id: 1,
    updated_at: null,
    vote_id: 1,
    vote_total: 1250,
    artist: {
      id: 1,
      name: { ko: '아이유', en: 'IU' },
      image: '/images/artists/iu.jpg'
    }
  },
  {
    id: 2, 
    artist_id: 2,
    created_at: new Date().toISOString(),
    deleted_at: null,
    group_id: 1,
    updated_at: null,
    vote_id: 1,
    vote_total: 980,
    artist: {
      id: 2,
      name: { ko: '뉴진스', en: 'NewJeans' },
      image: '/images/artists/newjeans.jpg'
    }
  },
  {
    id: 3,
    artist_id: 3,
    created_at: new Date().toISOString(),
    deleted_at: null,
    group_id: 1,
    updated_at: null,
    vote_id: 1,
    vote_total: 850,
    artist: {
      id: 3,
      name: { ko: '블랙핑크', en: 'BLACKPINK' },
      image: '/images/artists/blackpink.jpg'
    }
  },
  // 더 많은 샘플 데이터...
  ...Array.from({ length: 20 }, (_, i) => ({
    id: i + 4,
    artist_id: i + 4,
    created_at: new Date().toISOString(),
    deleted_at: null,
    group_id: 1,
    updated_at: null,
    vote_id: 1,
    vote_total: Math.floor(Math.random() * 1000) + 100,
    artist: {
      id: i + 4,
      name: { ko: `아티스트 ${i + 4}`, en: `Artist ${i + 4}` },
      image: `/images/artists/sample${i + 4}.jpg`
    }
  }))
];

export const GridViewDemo: React.FC = () => {
  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">GridView 컴포넌트 사용 예시</h1>
      
      {/* 원형 스타일 - 페이지네이션 및 셔플 활성화 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. 원형 스타일 (페이지네이션 + 셔플)</h2>
        <div className="bg-gray-50 p-4 rounded-lg">
          <GridView
            items={sampleItems}
            style="circular"
            enablePagination={true}
            itemsPerPage={12}
            enableShuffle={true}
            keyPrefix="demo-circular"
          />
        </div>
      </section>

      {/* 원형 스타일 - 페이지네이션 없음 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">2. 원형 스타일 (페이지네이션 없음)</h2>
        <div className="bg-gray-50 p-4 rounded-lg">
          <GridView
            items={sampleItems.slice(0, 8)}
            style="circular"
            enablePagination={false}
            enableShuffle={false}
            keyPrefix="demo-circular-no-pagination"
          />
        </div>
      </section>

      {/* 카드 스타일 - 작은 크기 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">3. 카드 스타일 (작은 크기)</h2>
        <div className="bg-gray-50 p-4 rounded-lg">
          <GridView
            items={sampleItems.slice(0, 10)}
            style="card"
            cardSize="sm"
            enablePagination={false}
            keyPrefix="demo-card-sm"
          />
        </div>
      </section>

      {/* 카드 스타일 - 큰 크기 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">4. 카드 스타일 (큰 크기)</h2>
        <div className="bg-gray-50 p-4 rounded-lg">
          <GridView
            items={sampleItems.slice(0, 6)}
            style="card"
            cardSize="lg"
            enablePagination={false}
            keyPrefix="demo-card-lg"
          />
        </div>
      </section>

      {/* 비활성화 상태 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">5. 비활성화 상태</h2>
        <div className="bg-gray-50 p-4 rounded-lg">
          <GridView
            items={sampleItems.slice(0, 8)}
            style="circular"
            disabled={true}
            enablePagination={false}
            keyPrefix="demo-disabled"
          />
        </div>
      </section>

      {/* 반응형 테스트 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">6. 반응형 테스트</h2>
        <p className="text-sm text-gray-600">
          화면 크기를 변경해보세요. 모바일에서는 4열, 태블릿 이상에서는 5열로 표시됩니다.
        </p>
        <div className="bg-gray-50 p-4 rounded-lg">
          <GridView
            items={sampleItems}
            style="circular"
            enablePagination={true}
            itemsPerPage={15}
            enableShuffle={false}
            keyPrefix="demo-responsive"
          />
        </div>
      </section>
    </div>
  );
}; 