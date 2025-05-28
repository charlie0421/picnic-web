import {
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import { DialogType } from './types';
import { dialogColors } from './theme';
import { cn } from '@/lib/utils';

interface DialogIconProps {
  type: DialogType;
  className?: string;
  size?: number;
}

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle,
  confirmation: HelpCircle,
} as const;

export function DialogIcon({ type, className, size = 24 }: DialogIconProps) {
  const IconComponent = iconMap[type];
  const colors = dialogColors[type];

  return (
    <div
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-full',
        colors.background,
        className,
      )}
    >
      <IconComponent size={size} className={colors.icon} />
    </div>
  );
}
