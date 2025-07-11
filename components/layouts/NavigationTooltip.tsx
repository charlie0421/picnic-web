'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface NavigationTooltipProps {
  show: boolean;
  onDismiss: () => void;
}

const NavigationTooltip: React.FC<NavigationTooltipProps> = ({ show, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      // 5초 후 자동으로 숨김
      const timer = setTimeout(() => {
        setIsVisible(false);
        onDismiss();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
      <div className="bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 animate-bounce">
        <div className="flex items-center">
          <ChevronLeft className="w-3 h-3" />
          <ChevronRight className="w-3 h-3" />
        </div>
        <span className="text-sm font-medium">좌우로 스와이프하여 더 많은 메뉴 보기</span>
      </div>
      
      {/* 버튼으로 닫기 가능 */}
      <button
        onClick={onDismiss}
        className="absolute -top-1 -right-1 bg-gray-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs pointer-events-auto"
        aria-label="툴팁 닫기"
      >
        ×
      </button>
    </div>
  );
};

export default NavigationTooltip; 