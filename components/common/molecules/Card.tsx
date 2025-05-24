import { cn } from '@/components/utils/cn';

// Card Root Component
export interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  bordered?: boolean;
}

export function Card({ 
  children, 
  className,
  hoverable = false,
  bordered = true
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg',
        bordered && 'border border-gray-200',
        hoverable && 'hover:shadow-lg transition-shadow cursor-pointer',
        'overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

// Card Header Component
export interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

Card.Header = function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-gray-200', className)}>
      {children}
    </div>
  );
};

// Card Body Component
export interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

Card.Body = function CardBody({ children, className }: CardBodyProps) {
  return (
    <div className={cn('px-6 py-4', className)}>
      {children}
    </div>
  );
};

// Card Footer Component
export interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

Card.Footer = function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn('px-6 py-4 border-t border-gray-200 bg-gray-50', className)}>
      {children}
    </div>
  );
}; 