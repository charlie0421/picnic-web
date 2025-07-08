'use client';

import React, { useState, useEffect } from 'react';
import { useTimeZoneDetection } from '@/hooks/useTimeZoneDetection';
import { getTimeZoneCode, type SupportedLanguage } from '@/utils/date';
import { DateTime } from 'luxon';

/**
 * 시간대 변경 디버깅을 위한 컴포넌트 (Luxon 기반)
 */
export function TimeZoneDebug() {
  const { timeZone, offset, changed, checkTimeZone } = useTimeZoneDetection();
  const [manualCheck, setManualCheck] = useState('');
  
  // 수동 체크 함수
  const performManualCheck = () => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const browserOffset = new Date().getTimezoneOffset();
    
    // 테스트할 시간대들
    const testTimeZones = [browserTimeZone, 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Kolkata', 'America/New_York'];
    
    // 우리 함수 결과 (주요 시간대는 표준 약어 사용)
    const luxonResults = testTimeZones.map(tz => {
      try {
        const abbr = getTimeZoneCode(tz, 'ko' as SupportedLanguage);
        const dt = DateTime.now().setZone(tz);
        const offsetHours = dt.offset / 60;
        const offsetStr = offsetHours >= 0 ? `+${offsetHours}` : `${offsetHours}`;
        return `${tz}: ${abbr} (UTC${offsetStr})`;
      } catch (e) {
        return `${tz}: 함수 오류`;
      }
    }).join('\n      ');
    
    // 표준 API 결과
    const apiResults = testTimeZones.map(tz => {
      try {
        const formatter = new Intl.DateTimeFormat('ko-KR', {
          timeZone: tz,
          timeZoneName: 'short'
        });
        const parts = formatter.formatToParts(new Date());
        const tzPart = parts.find(part => part.type === 'timeZoneName');
        const rawValue = tzPart?.value || '?';
        return `${tz}: ${rawValue}`;
      } catch (e) {
        return `${tz}: API 오류`;
      }
    }).join('\n      ');
    
    // 우리 함수 결과 (Luxon + API 폴백)
    const ourFunctionResults = testTimeZones.map(tz => {
      try {
        const code = getTimeZoneCode(tz, 'ko' as SupportedLanguage);
        return `${tz}: ${code}`;
      } catch (e) {
        return `${tz}: 함수 오류`;
      }
    }).join('\n      ');

    setManualCheck(`
      브라우저 정보:
      - 시간대: ${browserTimeZone}
      - 오프셋: ${browserOffset}분
      - 현재 시간: ${new Date().toLocaleString()}
      
      시간대별 현재 시간:
      - 한국: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
      - 일본: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Tokyo' })}
      - 인도: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Kolkata' })}
      - 미국 동부: ${new Date().toLocaleString('ko-KR', { timeZone: 'America/New_York' })}
      - UTC: ${new Date().toLocaleString('ko-KR', { timeZone: 'UTC' })}
      
      === 우리 getTimeZoneCode() 함수 결과 (주요 시간대 표준 약어) ===
      ${luxonResults}
      
      === 표준 API timeZoneName: 'short' 결과 ===
      ${apiResults}
      
      === 우리 getTimeZoneCode() 함수 결과 ===
      ${ourFunctionResults}
    `);
    
    checkTimeZone();
  };

  // 포커스 이벤트 강제 트리거
  const forceFocusEvent = () => {
    console.log('🔧 포커스 이벤트 강제 트리거');
    window.dispatchEvent(new Event('focus'));
  };

  // 가시성 이벤트 강제 트리거
  const forceVisibilityEvent = () => {
    console.log('🔧 가시성 이벤트 강제 트리거');
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true
    });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  
  return (
    <div className="p-4 bg-gray-100 rounded-lg max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4">🔍 시간대 변경 디버깅 (Luxon 기반 - 하드코딩 없음!)</h2>
      
      {/* 현재 훅 상태 */}
      <div className="mb-4 p-3 bg-blue-50 rounded">
        <h3 className="font-semibold">현재 훅 상태:</h3>
        <div className="mt-2 text-sm font-mono">
          <div>시간대: <span className={changed ? 'text-red-600' : 'text-green-600'}>{timeZone}</span></div>
          <div>오프셋: {offset}분</div>
          <div>변경됨: {changed ? '✅ 예' : '❌ 아니오'}</div>
          <div>시간대 코드: <span className="bg-yellow-200 px-1 rounded">{getTimeZoneCode(timeZone, 'ko' as SupportedLanguage)}</span></div>
          <div className="mt-2 text-xs text-gray-600">
            Luxon 직접 호출: {getTimeZoneCode(timeZone, 'ko' as SupportedLanguage)}
          </div>
        </div>
      </div>
      
      {/* 수동 체크 버튼들 */}
      <div className="mb-4 space-x-2">
        <button 
          onClick={performManualCheck}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          수동 시간대 체크
        </button>
        <button 
          onClick={forceFocusEvent}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          포커스 이벤트 트리거
        </button>
        <button 
          onClick={forceVisibilityEvent}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          가시성 이벤트 트리거
        </button>
      </div>
      
      {/* 수동 체크 결과 */}
      {manualCheck && (
        <div className="mb-4 p-3 bg-yellow-50 rounded">
          <h3 className="font-semibold">수동 체크 결과:</h3>
          <pre className="mt-2 text-xs font-mono whitespace-pre-wrap">{manualCheck}</pre>
        </div>
      )}
      
      {/* Luxon vs 표준 API 비교 */}
      <div className="mb-4 p-3 bg-green-50 rounded">
        <h3 className="font-semibold">Luxon vs 표준 API 비교:</h3>
        <div className="mt-2 text-sm">
          <div>우리 함수: {getTimeZoneCode(timeZone, 'ko' as SupportedLanguage)}</div>
          <div>Luxon 원시값: {timeZone !== 'UTC' ? DateTime.now().setZone(timeZone).offsetNameShort : 'UTC'}</div>
          <div className="text-xs text-gray-600 mt-1">
            ✨ 주요 시간대는 표준 약어 사용, 나머지는 Intl API 폴백!
          </div>
        </div>
      </div>
      
      {/* 테스트 안내 */}
      <div className="p-3 bg-gray-50 rounded">
        <h3 className="font-semibold">테스트 방법:</h3>
        <ol className="mt-2 text-sm list-decimal list-inside">
          <li>맥 시스템 환경설정에서 시간대를 다른 지역(예: 인도)으로 변경</li>
          <li>다른 앱(예: Finder)을 클릭했다가 다시 브라우저로 돌아오기</li>
          <li>또는 &quot;수동 시간대 체크&quot; 버튼 클릭</li>
          <li>콘솔 로그 확인 (F12 → Console)</li>
          <li>시간대 코드가 정확히 표시되는지 확인 (예: IST, KST 등)</li>
          <li>🎉 KST, JST 등 표준 약어가 정확히 표시되는지 확인!</li>
        </ol>
      </div>
      
      {/* 변경 알림 */}
      {changed && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 rounded">
          <strong>🚨 시간대 변경 감지됨!</strong>
          <div className="mt-1 text-sm">
            새로운 시간대: {timeZone} ({getTimeZoneCode(timeZone, 'ko' as SupportedLanguage)})
          </div>
        </div>
      )}
    </div>
  );
}

export default TimeZoneDebug; 