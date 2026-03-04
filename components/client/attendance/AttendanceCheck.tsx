'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
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
  const [showConfetti, setShowConfetti] = useState(false);
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
      setShowConfetti(true);

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

      // Clear result display and confetti after 3s
      resultTimeoutRef.current = setTimeout(() => {
        setCheckInResult(null);
        setShowConfetti(false);
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
      <div className="flex flex-col items-center justify-center gap-3 py-8">
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
    <div className="relative flex flex-col gap-3 px-4 py-4">
      {/* Confetti animation overlay */}
      {showConfetti && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.8}s`,
                animationDuration: `${1.5 + Math.random() * 1.5}s`,
                backgroundColor: ['#a855f7', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#ef4444'][i % 6],
                width: `${6 + Math.random() * 4}px`,
                height: `${6 + Math.random() * 4}px`,
                borderRadius: i % 3 === 0 ? '50%' : '1px',
              }}
            />
          ))}
        </div>
      )}

      {/* Progress header */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-purple-500 to-purple-400 px-2.5 py-0.5 text-[10px] font-semibold text-white">
          {weeklyStatus.checkedCount}/{weeklyStatus.totalRequired}
        </span>
        <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-purple-500 transition-all duration-500"
            style={{ width: `${Math.min((weeklyStatus.checkedCount / weeklyStatus.totalRequired) * 100, 100)}%` }}
          />
        </div>
        {deadlineKST && (
          <AttendanceDeadlineTimer
            deadlineUTC={deadlineKST}
            label=""
            onDeadlineReached={handleDeadlineReached}
          />
        )}
      </div>

      {/* Weekly Calendar */}
      <AttendanceWeeklyCalendar
        days={weeklyStatus.days}
        dayLabels={dayLabels}
        weeklyBonusEligible={weeklyStatus.isWeeklyBonusEligible}
        todayChecked={todayChecked}
        totalRequired={weeklyStatus.totalRequired}
        checkedCount={weeklyStatus.checkedCount}
      />

      {/* Reward info banner */}
      <div className="flex flex-col items-center gap-0.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">
            {t('label_attendance_check_in') || '출석'}
          </span>
          <Image src="/images/star-candy/bonus.png" alt="" width={14} height={14} />
          <span className="text-[10px] font-semibold text-gray-700">+60</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">
            {t('label_attendance_weekly_bonus') || '주간보너스'}
          </span>
          <Image src="/images/star-candy/bonus.png" alt="" width={14} height={14} />
          <span className="text-[10px] font-semibold text-orange-700">+120</span>
          <span className="text-xs">🎁</span>
        </div>
      </div>

      {/* New user notice */}
      {weeklyStatus.isNewUser && (
        <div className="rounded-lg bg-purple-50 px-3 py-2 text-center text-xs text-purple-600">
          {t('label_attendance_new_user_notice')}
        </div>
      )}

      {/* Check-in result animation */}
      {checkInResult && (
        <div className="animate-bounce rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-center text-white shadow-lg">
          <div className="flex items-center justify-center gap-2">
            <Image src="/images/star-candy/bonus.png" alt="" width={22} height={22} />
            <span className="text-xl font-bold">+{checkInResult.totalReward}</span>
          </div>
          {checkInResult.weeklyBonusAmount > 0 && (
            <p className="text-xs mt-1 opacity-90">
              {t('label_attendance_weekly_bonus')} +{checkInResult.weeklyBonusAmount} 🎉
            </p>
          )}
        </div>
      )}

      {/* Check-in Button */}
      <button
        onClick={handleCheckIn}
        disabled={todayChecked || isCheckingIn}
        className={`
          w-full rounded-xl px-6 py-3 text-base font-bold transition-all duration-200
          ${todayChecked
            ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
            : isCheckingIn
              ? 'bg-purple-300 text-white cursor-wait'
              : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-200 hover:shadow-lg hover:shadow-purple-300 active:scale-[0.98]'
          }
        `}
      >
        {isCheckingIn ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <span className="flex items-center justify-center gap-2">
            {!todayChecked && (
              <Image src="/images/star-candy/bonus.png" alt="" width={18} height={18} />
            )}
            {todayChecked
              ? t('label_attendance_checked') || '출석완료'
              : t('label_attendance_check_in') || '출석하기'}
            {!todayChecked && (
              <span className="opacity-70">+60</span>
            )}
          </span>
        )}
      </button>
    </div>
  );
}
