import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProfileImageContainer, DefaultAvatar } from '@/components/ui/ProfileImageContainer';

// next/image 모킹
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    return <img {...props} />;
  },
}));

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
    render(<ProfileImageContainer {...defaultProps} borderRadius={borderRadius} />);
    
    const container = screen.getByAltText('프로필 이미지').parentElement;
    expect(container).toHaveStyle(`border-radius: ${borderRadius}px`);
    expect(container).toHaveStyle('overflow: hidden');
  });
});

describe('DefaultAvatar', () => {
  it('renders with correct dimensions', () => {
    const width = 120;
    const height = 120;
    
    render(<DefaultAvatar width={width} height={height} />);
    
    const container = screen.getByText('👤').parentElement;
    expect(container).toHaveClass('bg-gray-200 flex items-center justify-center');
    expect(container).toHaveStyle(`width: ${width}px`);
    expect(container).toHaveStyle(`height: ${height}px`);
  });
}); 