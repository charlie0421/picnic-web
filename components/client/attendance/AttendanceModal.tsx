'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslations } from '@/hooks/useTranslations';
import AttendanceCheck from './AttendanceCheck';

interface AttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AttendanceModal({ isOpen, onClose }: AttendanceModalProps) {
  const { userProfile } = useAuth();
  const { t } = useTranslations();

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const starCandyBonus = userProfile?.star_candy_bonus || 0;
  const starCandy = userProfile?.star_candy || 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto transition-all duration-300">
        {/* Gradient Header */}
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 px-5 pt-4 pb-5">
          {/* Decorative circles */}
          <div className="absolute -right-5 -top-5 w-20 h-20 rounded-full bg-white/[0.08]" />
          <div className="absolute -left-3 -bottom-4 w-14 h-14 rounded-full bg-white/[0.06]" />

          {/* Title + Close */}
          <div className="relative flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">
              {t('label_attendance_check_in') || '출석체크'}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white/70" />
            </button>
          </div>

          {/* Star candy balance cards */}
          <div className="relative flex gap-2">
            {/* Star candy (paid) - first */}
            <div className="flex-1 bg-white/[0.22] border border-white/[0.35] rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Image
                  src="/images/star-candy/star_candy.png"
                  alt={t('jma_voting_my_star_candy') || '별사탕'}
                  width={28}
                  height={28}
                />
                <div className="min-w-0">
                  <p className="text-[10px] text-white leading-tight">
                    {t('jma_voting_my_star_candy') || '나의 별사탕'}
                  </p>
                  <p className="text-sm font-bold text-amber-300">
                    {starCandy.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Bonus candy - second */}
            <div className="flex-1 bg-white/[0.22] border border-white/[0.35] rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Image
                  src="/images/star-candy/bonus.png"
                  alt={t('label_bonus') || '보너스'}
                  width={28}
                  height={28}
                />
                <div className="min-w-0">
                  <p className="text-[10px] text-white leading-tight">
                    {t('label_bonus') || '보너스'}
                  </p>
                  <p className="text-sm font-bold text-amber-300">
                    {starCandyBonus.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Check Content */}
        <AttendanceCheck />

        {/* KST Notice */}
        <p className="text-center text-[10px] text-gray-400 pb-4">
          {t('label_attendance_kst_notice') || '* 매일 한국시간(KST) 자정에 초기화됩니다'}
        </p>
      </div>
    </div>
  );
}
