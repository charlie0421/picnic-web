import { Metadata } from 'next';
import TimeZoneDebug from '@/components/debug/TimeZoneDebug';

export const metadata: Metadata = {
  title: '시간대 변경 디버깅',
  description: '시간대 변경 감지 기능 테스트',
};

export default function DebugTimezonePage() {
  return (
    <div className="container mx-auto py-6">
      <TimeZoneDebug />
    </div>
  );
} 