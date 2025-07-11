import { cn } from '@/components/utils/cn';
import Image from 'next/image';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'white';
  className?: string;
}

export function Spinner({ 
  size = 'md',
  color = 'primary',
  className
}: SpinnerProps) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };
  
  const sizeValues = {
    sm: { width: 16, height: 16 },
    md: { width: 32, height: 32 },
    lg: { width: 48, height: 48 },
    xl: { width: 64, height: 64 }
  };
  
  return (
    <div className={cn('inline-block', className)}>
      <Image
        src="/images/logo.png"
        alt="Loading"
        width={sizeValues[size].width}
        height={sizeValues[size].height}
        className={cn(
          'rounded-full animate-pulse drop-shadow-lg object-cover',
          sizes[size]
        )}
        priority
      />
    </div>
  );
} 