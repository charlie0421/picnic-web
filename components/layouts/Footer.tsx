import React, { useState, useEffect } from 'react';
import { useLanguageStore } from '@/stores/languageStore';

const Footer: React.FC = () => {
  const { currentLanguage } = useLanguageStore();
  const [mounted, setMounted] = useState(false);

  // 컴포넌트가 마운트된 후에만 언어 변경을 적용
  useEffect(() => {
    setMounted(true);
  }, []);

  const content = {
    ko: {
      company:
        '상호명: 주식회사 아이콘캐스팅 | 사업자등록번호: 715-88-02791 | 대표자명: 황재근',
      address:
        '사업장주소지: 경기도 고양시 일산동구 태극로 60, 1503호(장항동,빛마루)',
      contact:
        '전화번호: 070-8058-9950 | 통신판매업번호: 제2024-성남수정-0657호',
      copyright: '© 2024 IconCasting Inc. All rights reserved.',
    },
    en: {
      company:
        'Company: IconCasting Inc. | Business Registration No: 715-88-02791 | CEO: Jaegeun Hwang',
      address:
        'Address: 1503, 60 Taeguk-ro, Ilsandong-gu, Goyang-si, Gyeonggi-do, Korea',
      contact:
        'Phone: 070-8058-9950 | E-commerce Registration No: 2024-Seongnam-Sujeong-0657',
      copyright: '© 2024 IconCasting Inc. All rights reserved.',
    },
  };

  // 서버사이드에서는 항상 영어로, 클라이언트에서 마운트된 후에 한국어로 변경
  const currentContent = mounted && currentLanguage === 'ko' ? content.ko : content.en;

  return (
    <footer className='w-full py-4 px-10 text-center text-gray-500 text-xs border-t border-gray-200'>
      <p className='space-y-2'>
        <span className='block'>{currentContent.company}</span>
        <span className='block'>{currentContent.address}</span>
        <span className='block'>{currentContent.contact}</span>
        <span className='block mt-4'>{currentContent.copyright}</span>
      </p>
    </footer>
  );
};

export default Footer;
