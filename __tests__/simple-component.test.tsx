import React from 'react';
import { renderWithProviders, screen } from '@/__tests__/utils/test-utils';

// 간단한 테스트 컴포넌트
const SimpleComponent: React.FC<{ message: string }> = ({ message }) => {
  return <div data-testid="simple-component">{message}</div>;
};

describe('Simple Component Test', () => {
  it('should render with test-utils', () => {
    renderWithProviders(<SimpleComponent message="Hello Test" />);
    
    expect(screen.getByTestId('simple-component')).toBeInTheDocument();
    expect(screen.getByText('Hello Test')).toBeInTheDocument();
  });

  it('should render with simple wrapper', () => {
    renderWithProviders(<SimpleComponent message="Test Message" />);
    
    expect(screen.getByTestId('test-wrapper')).toBeInTheDocument();
    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });
}); 