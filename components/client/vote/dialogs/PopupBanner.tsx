import { useLanguageStore } from '@/stores/languageStore';
import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';

interface Slide {
  imageUrl?: string;
  title?: string;
  content?: string;
}

interface PopupBannerProps {
  isOpen: boolean;
  onClose: () => void;
  onCloseFor7Days: () => void;
  slides: Slide[];
}

const PopupBanner: React.FC<PopupBannerProps> = ({
  isOpen,
  onClose,
  onCloseFor7Days,
  slides,
}) => {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);

  const { imageUrl, title, content } = slides[current] || {};
  const { t } = useLanguageStore();

  useEffect(() => {
    if (contentRef.current) {
      setIsOverflow(contentRef.current.scrollHeight > contentRef.current.clientHeight);
    }
  }, [content, current]);

  if (!isOpen || !slides || slides.length === 0) return null;

  const handlePrev = () => {
    if (current > 0) {
      setDirection('left');
      setTimeout(() => {
        setCurrent((prev) => prev - 1);
        setDirection(null);
      }, 250);
    }
  };

  const handleNext = () => {
    if (current < slides.length - 1) {
      setDirection('right');
      setTimeout(() => {
        setCurrent((prev) => prev + 1);
        setDirection(null);
      }, 250);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
      <div
        className={`bg-white rounded-lg shadow-lg w-full max-w-sm flex flex-col relative overflow-hidden min-h-[400px] max-h-[90vh]`}
      >
        {/* 좌우 버튼 */}
        {current > 0 && (
          <button
            className='absolute left-2 top-1/2 -translate-y-1/2 bg-primary bg-opacity-80 shadow-lg rounded-full p-2 flex items-center justify-center hover:bg-primary-dark hover:bg-opacity-100 transition-all duration-200 z-10'
            onClick={handlePrev}
            aria-label='이전'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6'
              fill='none'
              viewBox='0 0 24 24'
              stroke='white'
              strokeWidth={2}
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M15 19l-7-7 7-7'
              />
            </svg>
          </button>
        )}
        {current < slides.length - 1 && (
          <button
            className='absolute right-2 top-1/2 -translate-y-1/2 bg-primary bg-opacity-80 shadow-lg rounded-full p-2 flex items-center justify-center hover:bg-primary-dark hover:bg-opacity-100 transition-all duration-200 z-10'
            onClick={handleNext}
            aria-label='다음'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6'
              fill='none'
              viewBox='0 0 24 24'
              stroke='white'
              strokeWidth={2}
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M9 5l7 7-7 7'
              />
            </svg>
          </button>
        )}
        
        {/* 콘텐츠 영역 */}
        <div className='flex-1 flex flex-col overflow-hidden'>
          <div
            className={`flex flex-col items-center w-full h-full transition-transform duration-300 ease-in-out ${
              direction === 'left'
                ? '-translate-x-10 opacity-0'
                : direction === 'right'
                ? 'translate-x-10 opacity-0'
                : 'translate-x-0 opacity-100'
            }`}
          >
            {/* 이미지 영역 */}
            <div
              className='w-full flex-shrink-0 rounded-t-lg overflow-hidden bg-gray-100'
              style={{ position: 'relative', paddingTop: '56.25%' }}
            >
              <Image
                src={imageUrl || '/images/logo_alpha.png'}
                alt='popup'
                fill
                className={`${imageUrl ? 'object-cover' : 'object-contain'}`}
              />
            </div>
            
            {/* 제목과 내용 영역 */}
            <div className='flex-1 flex flex-col w-full p-4 overflow-hidden'>
              {title && (
                <h2 className='text-lg font-bold mb-3 text-center text-black px-2 py-1 flex-shrink-0'>
                  {title}
                </h2>
              )}
              {content && (
                <div className='flex-1 px-2 relative text-sm overflow-hidden'>
                  <p
                    ref={contentRef}
                    className='text-gray-700 text-left whitespace-pre-line overflow-y-auto h-full p-3 rounded-lg bg-gray-50'
                  >
                    {content}
                  </p>
                  {isOverflow && (
                    <div className='pointer-events-none absolute left-5 right-5 bottom-3 h-6 bg-gradient-to-t from-gray-50 to-transparent rounded-b-lg' />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* 버튼 영역 - 항상 하단에 고정 */}
        <div className='flex-shrink-0 flex flex-row gap-2 w-full p-4 pt-2 bg-white border-t border-gray-100'>
          <button
            className='flex-1 py-2 px-4 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors'
            onClick={onClose}
          >
            {t('label_popup_close')}
          </button>
          <button
            className='flex-1 py-2 px-4 rounded bg-primary text-white hover:bg-primary-dark transition-colors'
            onClick={onCloseFor7Days}
          >
            {t('label_popup_hide_7days')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PopupBanner; 