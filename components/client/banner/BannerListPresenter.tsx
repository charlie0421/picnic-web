'use client';

import React, { useState, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import { BannerItem } from './BannerItem';
import { Banner } from '@/types/interfaces';

// Swiper CSS 스타일 import
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

export interface BannerListProps {
  banners: Banner[];
  className?: string;
}

// 화면 크기별 배너 갯수 설정
const getBreakpoints = () => ({
  // 모바일: 2개
  320: {
    slidesPerView: 2,
    spaceBetween: 12,
  },
  // 태블릿: 3개
  768: {
    slidesPerView: 3,
    spaceBetween: 16,
  },
  // 데스크탑: 3개
  1024: {
    slidesPerView: 3,
    spaceBetween: 20,
  },
});

export function BannerListPresenter({ banners, className }: BannerListProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 서버 사이드에서는 기본 로딩 상태 표시
  if (!isClient) {
    return (
      <div className={`w-full bg-gray-100 rounded-lg animate-pulse banner-aspect-ratio ${className}`}>
        <style jsx>{`
          .banner-aspect-ratio {
            aspect-ratio: 700/356;
          }
        `}</style>
      </div>
    );
  }

  // 배너가 없는 경우
  if (banners.length === 0) {
    return (
      <div className={`bg-gray-100 p-6 rounded-lg text-center banner-aspect-ratio ${className}`}>
        <div className='flex items-center justify-center h-full'>
          <p className='text-gray-500'>현재 표시할 배너가 없습니다.</p>
        </div>
        <style jsx>{`
          .banner-aspect-ratio {
            aspect-ratio: 700/356;
          }
        `}</style>
      </div>
    );
  }

  // 배너가 1개인 경우 (캐러셀 없이 단일 표시)
  if (banners.length === 1) {
    return (
      <div className={className}>
        <BannerItem banner={banners[0]} />
      </div>
    );
  }

  return (
    <div className={`banner-carousel relative ${className}`}>
      <Swiper
        modules={[Navigation, Pagination, Autoplay]}
        spaceBetween={16}
        slidesPerView={2} // 기본값 (모바일)
        breakpoints={getBreakpoints()}
        navigation={{
          nextEl: '.swiper-button-next-custom',
          prevEl: '.swiper-button-prev-custom',
        }}
        pagination={{
          el: '.swiper-pagination-custom',
          clickable: true,
          bulletClass: 'swiper-pagination-bullet-custom',
          bulletActiveClass: 'swiper-pagination-bullet-active-custom',
        }}
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        loop={banners.length > 3} // 3개 이상일 때만 무한 루프
        className='banner-swiper'
      >
        {banners.map((banner) => (
          <SwiperSlide key={banner.id}>
            <BannerItem banner={banner} />
          </SwiperSlide>
        ))}
      </Swiper>

      {/* 커스텀 네비게이션 버튼 */}
      <button
        className='swiper-button-prev-custom absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/30 text-white rounded-full p-2 hover:bg-black/50 focus:outline-none z-10 transition-all duration-200'
        aria-label='이전 배너'
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-5 w-5'
          viewBox='0 0 20 20'
          fill='currentColor'
        >
          <path
            fillRule='evenodd'
            d='M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z'
            clipRule='evenodd'
          />
        </svg>
      </button>
      
      <button
        className='swiper-button-next-custom absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/30 text-white rounded-full p-2 hover:bg-black/50 focus:outline-none z-10 transition-all duration-200'
        aria-label='다음 배너'
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-5 w-5'
          viewBox='0 0 20 20'
          fill='currentColor'
        >
          <path
            fillRule='evenodd'
            d='M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z'
            clipRule='evenodd'
          />
        </svg>
      </button>

      {/* 커스텀 페이지네이션 */}
      <div className='swiper-pagination-custom absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2'></div>

      <style jsx>{`
        .banner-swiper {
          padding-bottom: 50px;
        }
        
        :global(.swiper-pagination-bullet-custom) {
          width: 8px;
          height: 8px;
          background: rgba(255, 255, 255, 0.5);
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        :global(.swiper-pagination-bullet-active-custom) {
          background: white;
          transform: scale(1.2);
        }
        
        :global(.swiper-button-prev-custom:hover),
        :global(.swiper-button-next-custom:hover) {
          transform: translateY(-50%) scale(1.1);
        }
      `}</style>
    </div>
  );
} 