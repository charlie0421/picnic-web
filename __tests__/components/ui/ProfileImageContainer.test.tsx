/**
 * ProfileImageContainer 컴포넌트 테스트
 *
 * 이 테스트는 공통 UI 컴포넌트인 ProfileImageContainer의 기능을 검증합니다.
 * 테스트 대상: 렌더링, 이미지 소스 처리, 스타일 적용
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProfileImageContainer, DefaultAvatar } from '@/components/ui/ProfileImageContainer';

// next/image 모킹
jest.mock('next/image', () => {
  return function MockImage({ src, alt, width, height, className, ...props }: any) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        {...props}
      />
    );
  };
});

describe('ProfileImageContainer', () => {
  const defaultProps = {
    avatarUrl: 'https://example.com/avatar.png',
    width: 100,
    height: 100,
  };

  it('renders the image with correct props', () => {
    render(<ProfileImageContainer {...defaultProps} />);
    
    const image = screen.getByAltText('프로필 이미지');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', defaultProps.avatarUrl);
    expect(image).toHaveAttribute('width', defaultProps.width.toString());
    expect(image).toHaveAttribute('height', defaultProps.height.toString());
    expect(image).toHaveClass('object-cover');
  });

  it('applies custom border radius', () => {
    const borderRadius = 8;
    const { container } = render(
      <ProfileImageContainer {...defaultProps} borderRadius={borderRadius} />
    );
    
    const containerDiv = container.firstChild as HTMLElement;
    expect(containerDiv).toHaveStyle(`border-radius: ${borderRadius}px`);
    expect(containerDiv).toHaveStyle('overflow: hidden');
  });

  it('applies default border radius when not specified', () => {
    const { container } = render(<ProfileImageContainer {...defaultProps} />);
    
    const containerDiv = container.firstChild as HTMLElement;
    expect(containerDiv).toHaveStyle('overflow: hidden');
    expect(containerDiv).toHaveStyle('border-radius: 0');
  });

  it('renders with different image dimensions', () => {
    const customProps = {
      avatarUrl: 'https://example.com/custom-avatar.jpg',
      width: 200,
      height: 150,
    };

    render(<ProfileImageContainer {...customProps} />);
    
    const image = screen.getByAltText('프로필 이미지');
    expect(image).toHaveAttribute('width', '200');
    expect(image).toHaveAttribute('height', '150');
    expect(image).toHaveAttribute('src', customProps.avatarUrl);
  });

  it('renders with large border radius', () => {
    const borderRadius = 50;
    const { container } = render(
      <ProfileImageContainer {...defaultProps} borderRadius={borderRadius} />
    );
    
    const containerDiv = container.firstChild as HTMLElement;
    expect(containerDiv).toHaveStyle(`border-radius: ${borderRadius}px`);
  });

  it('maintains aspect ratio with object-cover class', () => {
    render(<ProfileImageContainer {...defaultProps} />);
    
    const image = screen.getByAltText('프로필 이미지');
    expect(image).toHaveClass('object-cover');
  });

  it('renders container with overflow hidden', () => {
    const { container } = render(<ProfileImageContainer {...defaultProps} />);
    
    const containerDiv = container.firstChild as HTMLElement;
    expect(containerDiv).toHaveStyle('overflow: hidden');
  });
});

describe('DefaultAvatar', () => {
  it('renders default avatar with correct dimensions', () => {
    const { container } = render(<DefaultAvatar width={50} height={50} />);
    
    const avatarDiv = container.firstChild as HTMLElement;
    expect(avatarDiv).toHaveClass('bg-gray-200', 'flex', 'items-center', 'justify-center');
    expect(avatarDiv).toHaveStyle('width: 50px');
    expect(avatarDiv).toHaveStyle('height: 50px');
  });

  it('displays default avatar icon', () => {
    render(<DefaultAvatar width={40} height={40} />);
    
    const iconSpan = screen.getByText('👤');
    expect(iconSpan).toBeInTheDocument();
    expect(iconSpan).toHaveClass('text-gray-500');
  });

  it('renders with different dimensions', () => {
    const { container } = render(<DefaultAvatar width={80} height={80} />);
    
    const avatarDiv = container.firstChild as HTMLElement;
    expect(avatarDiv).toHaveStyle('width: 80px');
    expect(avatarDiv).toHaveStyle('height: 80px');
  });

  it('has proper styling classes', () => {
    const { container } = render(<DefaultAvatar width={60} height={60} />);
    
    const avatarDiv = container.firstChild as HTMLElement;
    expect(avatarDiv).toHaveClass(
      'bg-gray-200',
      'flex',
      'items-center',
      'justify-center'
    );
  });

  it('renders with inline styles for dimensions', () => {
    const width = 120;
    const height = 100;
    const { container } = render(<DefaultAvatar width={width} height={height} />);
    
    const avatarDiv = container.firstChild as HTMLElement;
    expect(avatarDiv).toHaveStyle(`width: ${width}px`);
    expect(avatarDiv).toHaveStyle(`height: ${height}px`);
  });
}); 