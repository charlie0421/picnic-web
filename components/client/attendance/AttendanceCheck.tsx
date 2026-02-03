'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from '@/hooks/useTranslations';
import { useAuth } from '@/hooks/useAuth';
import {
  getAttendanceStatus,
  performAttendanceCheck,
  AttendanceStatusResponse,
  AttendanceCheckResponse,
  AttendanceDayStatus,
} from '@/lib/api/attendance';
import AttendanceWeeklyCalendar from './AttendanceWeeklyCalendar';
import AttendanceDeadlineTimer from './AttendanceDeadlineTimer';

const DAY_LABELS_KO = ['월', '화', '수', '목', '금', '토', '일'];
const DAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function AttendanceCheck() {
  const { t, currentLanguage } = useTranslations();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<AttendanceStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<AttendanceCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const dayLabels = currentLanguage === 'ko' ? DAY_LABELS_KO : DAY_LABELS_EN;

  const fetchStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await getAttendanceStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchStatus();
    } else if (!authLoading) {
      setIsLoading(false);
    }
  }, [authLoading, isAuthenticated, fetchStatus]);

  // Clear result animation after 3s
  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    };
  }, []);

  const handleCheckIn = async () => {
    if (isCheckingIn || status?.todayChecked) return;

    try {
      setIsCheckingIn(true);
      setError(null);
      const result = await performAttendanceCheck();
      setCheckInResult(result);

      // Update local status
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              todayChecked: true,
              weeklyStatus: result.weeklyStatus,
              serverTimeKST: result.serverTimeKST,
            }
          : prev,
      );

      // Clear result display after 3s
      resultTimeoutRef.current = setTimeout(() => {
        setCheckInResult(null);
      }, 3000);
    } catch (err: any) {
      if (err.code === 'ALREADY_CHECKED') {
        setStatus((prev) => (prev ? { ...prev, todayChecked: true } : prev));
      } else {
        setError(err instanceof Error ? err.message : 'Check-in failed');
      }
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleDeadlineReached = useCallback(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-500">
        <p>{t('dialog_content_login_required')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <p className="text-red-500 text-sm">{error}</p>
        <button
          onClick={fetchStatus}
          className="rounded-lg bg-purple-500 px-4 py-2 text-sm text-white hover:bg-purple-600"
        >
          {t('button_retry')}
        </button>
      </div>
    );
  }

  if (!status) return null;

  const { weeklyStatus, todayChecked, deadlineKST } = status;

  return (
    <div className="flex flex-col items-center gap-5 px-4 py-6">
      {/* KST Notice */}
      <p className="text-xs text-gray-400">{t('label_attendance_kst_notice')}</p>

      {/* New user notice */}
      {weeklyStatus.isNewUser && (
        <div className="w-full rounded-lg bg-purple-50 px-4 py-2.5 text-center text-sm text-purple-600">
          {t('label_attendance_new_user_notice')}
        </div>
      )}

      {/* Weekly Calendar */}
      <AttendanceWeeklyCalendar
        days={weeklyStatus.days}
        dayLabels={dayLabels}
        weeklyBonusEligible={weeklyStatus.isWeeklyBonusEligible}
        todayChecked={todayChecked}
        totalRequired={weeklyStatus.totalRequired}
        checkedCount={weeklyStatus.checkedCount}
      />

      {/* Weekly Bonus Banner */}
      <div className="w-full rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-amber-700">
          {t('label_attendance_weekly_bonus')}: 120 Star Candy
        </p>
        <p className="text-xs text-amber-500 mt-0.5">
          {t('label_attendance_weekly_bonus_desc')}
        </p>
      </div>

      {/* Check-in Result Animation */}
      {checkInResult && (
        <div className="animate-bounce rounded-xl bg-purple-500 px-6 py-3 text-center text-white shadow-lg">
          <p className="text-lg font-bold">
            +{checkInResult.rewardAmount}
          </p>
          {checkInResult.weeklyBonusAmount > 0 && (
            <p className="text-sm mt-1">
              +{checkInResult.weeklyBonusAmount} {t('label_attendance_weekly_bonus')}!
            </p>
          )}
        </div>
      )}

      {/* Check-in Button */}
      <button
        onClick={handleCheckIn}
        disabled={todayChecked || isCheckingIn}
        className={`w-full max-w-xs rounded-2xl px-8 py-4 text-lg font-bold shadow-md transition-all ${
          todayChecked
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : isCheckingIn
              ? 'bg-purple-300 text-white cursor-wait'
              : 'bg-purple-500 text-white hover:bg-purple-600 hover:shadow-lg active:scale-95'
        }`}
      >
        {isCheckingIn
          ? '...'
          : todayChecked
            ? t('label_attendance_checked')
            : t('label_attendance_check_in')}
      </button>

      {/* Deadline Timer */}
      {deadlineKST && (
        <AttendanceDeadlineTimer
          deadlineUTC={deadlineKST}
          label={t('label_attendance_deadline')}
          onDeadlineReached={handleDeadlineReached}
        />
      )}
    </div>
  );
}
