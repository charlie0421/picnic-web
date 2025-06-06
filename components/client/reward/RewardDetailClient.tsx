'use client';

import React, { useState } from 'react';
import { Reward } from '@/types/interfaces';
import { getLocalizedJson, getLocalizedString } from '@/utils/api/strings';
import RewardImageGallery from './RewardImageGallery';
import RewardTabs from './RewardTabs';
import RewardLocationInfo from './RewardLocationInfo';
import RewardSizeGuide from './RewardSizeGuide';
import { useLanguageStore } from '@/stores/languageStore';

interface RewardDetailClientProps {
  reward: Reward;
}

const RewardDetailClient: React.FC<RewardDetailClientProps> = ({ reward }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'location' | 'size'>(
    'overview',
  );
  const { t } = useLanguageStore();

  const title =
    getLocalizedString(reward.title as { [key: string]: string } | null) ||
    '제목 없음';
  const overviewImages = reward.overview_images || [];
  const locationImages = reward.location_images || [];
  const sizeGuideImages = reward.size_guide_images || [];

  // 현재 활성화된 탭에 따라 이미지 배열 선택
  const currentImages = (() => {
    switch (activeTab) {
      case 'overview':
        return overviewImages;
      case 'location':
        return locationImages;
      case 'size':
        return sizeGuideImages;
      default:
        return overviewImages;
    }
  })();

  // 다국어 위치 정보 처리
  const locationInfo = getLocalizedJson(reward.location) || null;

  // 다국어 크기 가이드 정보 처리
  const sizeGuideInfo = getLocalizedJson(reward.size_guide) || null;

  return (
    <div className='container mx-auto px-4 py-8'>

      {/* 탭 메뉴 */}
      <RewardTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setCurrentImageIndex={setCurrentImageIndex}
        t={t}
      />

      {/* 이미지 갤러리 */}
      <div className='mb-8'>
        {currentImages.length > 0 ? (
          <RewardImageGallery
            images={currentImages}
            title={title}
            currentImageIndex={currentImageIndex}
            setCurrentImageIndex={setCurrentImageIndex}
          />
        ) : (
          <div className='w-full aspect-video bg-gray-100 rounded-lg flex items-center justify-center'>
            <p className='text-gray-500'>이미지가 없습니다</p>
          </div>
        )}
      </div>

      {/* 위치 정보 */}
      {activeTab === 'location' && locationInfo && (
        <RewardLocationInfo locationInfo={locationInfo} />
      )}

      {/* 사이즈 가이드 */}
      {activeTab === 'size' && sizeGuideInfo && (
        <RewardSizeGuide sizeGuideInfo={sizeGuideInfo} />
      )}
    </div>
  );
};

export default RewardDetailClient; 