'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslations } from '@/hooks/useTranslations';
import { getAttendanceStatus } from '@/lib/api/attendance';
import AttendanceModal from './AttendanceModal';

export default function AttendanceIconButton() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useTranslations();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasCheckedToday, setHasCheckedToday] = useState(true); // default true to avoid flash

  const fetchStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await getAttendanceStatus();
      setHasCheckedToday(data.todayChecked);
    } catch {
      // silently ignore - badge just won't show
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchStatus();
    }
  }, [authLoading, isAuthenticated, fetchStatus]);

  // Re-fetch when modal closes (user may have checked in)
  const handleClose = useCallback(() => {
    setIsModalOpen(false);
    fetchStatus();
  }, [fetchStatus]);

  if (authLoading || !isAuthenticated) return null;

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="relative flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
        aria-label={t('label_attendance_check_in') || '출석체크'}
      >
        <CalendarCheck className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
        {!hasCheckedToday && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
        )}
      </button>
      <AttendanceModal isOpen={isModalOpen} onClose={handleClose} />
    </>
  );
}
