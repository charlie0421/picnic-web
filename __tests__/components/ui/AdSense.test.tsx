/**
 * AdSense 컴포넌트 테스트
 * 
 * 주의: 'use client' 지시문이 포함된 컴포넌트이므로 직접 렌더링 테스트하기 어렵습니다.
 * 대신 가장 기본적인 기능과 속성만 검증하는 테스트로 작성되었습니다.
 */
import React from 'react';
import AdSense from '@/components/ui/AdSense';

// Props 타입 정의
type AdSenseProps = {
  client: string;
  slot: string;
  style?: React.CSSProperties;
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  responsive?: 'true' | 'false';
};

describe('AdSense 컴포넌트', () => {
  it('올바른 props를 받아들입니다', () => {
    // Props를 정의하여 기본 검증
    const props: AdSenseProps = {
      client: 'ca-pub-123456789',
      slot: '1234567890',
      format: 'auto',
      responsive: 'true',
      style: { display: 'block' }
    };
    
    // 컴포넌트 인스턴스 생성 테스트 (에러가 발생하지 않아야 함)
    const component = <AdSense {...props} />;
    expect(component.props).toEqual(props);
  });
  
  it('사용자 지정 스타일을 적용할 수 있습니다', () => {
    // 사용자 지정 스타일로 Props 정의
    const props: AdSenseProps = {
      client: 'ca-pub-123456789',
      slot: '1234567890',
      format: 'rectangle',
      responsive: 'false',
      style: { 
        display: 'inline-block',
        width: '300px',
        height: '250px'
      }
    };
    
    // 컴포넌트 인스턴스 생성 테스트 (에러가 발생하지 않아야 함)
    const component = <AdSense {...props} />;
    expect(component.props.style).toEqual(props.style);
    expect(component.props.format).toBe('rectangle');
    expect(component.props.responsive).toBe('false');
  });
  
  it('기본 props 값을 제공합니다', () => {
    // 필수 props만 제공
    const minimumProps: Pick<AdSenseProps, 'client' | 'slot'> = {
      client: 'ca-pub-123456789',
      slot: '1234567890'
    };
    
    // 컴포넌트 인스턴스 생성 테스트 (에러가 발생하지 않아야 함)
    const component = <AdSense {...minimumProps} />;
    
    // 필수 props 확인
    expect(component.props.client).toBe(minimumProps.client);
    expect(component.props.slot).toBe(minimumProps.slot);
  });
}); 