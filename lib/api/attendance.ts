'use client';

import { mapAntiAbuseError, AntiAbuseError } from '@/lib/anti-abuse/handler';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export interface AttendanceDayStatus {
  date: string;
  dayOfWeek: number;
  checked: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface AttendanceWeeklyStatus {
  weekStart: string;
  weekEnd: string;
  days: AttendanceDayStatus[];
  checkedCount: number;
  totalRequired: number;
  isWeeklyBonusEligible: boolean;
  isNewUser: boolean;
}

export interface AttendanceStatusResponse {
  weeklyStatus: AttendanceWeeklyStatus;
  todayChecked: boolean;
  serverTimeKST: string;
  deadlineKST: string;
}

export interface AttendanceCheckResponse {
  rewardAmount: number;
  weeklyBonusAmount: number;
  totalReward: number;
  weeklyStatus: AttendanceWeeklyStatus;
  serverTimeKST: string;
}

export async function getAttendanceStatus(): Promise<AttendanceStatusResponse> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.functions.invoke('attendance-check', {
    method: 'GET',
  });

  if (error) {
    const aa = mapAntiAbuseError(error);
    if (aa instanceof AntiAbuseError) throw aa;
    throw error;
  }
  if (!data?.success) throw new Error(data?.error?.message || 'Failed to fetch attendance status');
  return data.data;
}

export async function performAttendanceCheck(): Promise<AttendanceCheckResponse> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.functions.invoke('attendance-check', {
    method: 'POST',
  });

  if (error) {
    const aa = mapAntiAbuseError(error);
    if (aa instanceof AntiAbuseError) throw aa;
    throw error;
  }
  if (!data?.success) {
    const err = new Error(data?.error?.message || 'Failed to check in');
    (err as any).code = data?.error?.code;
    throw err;
  }
  return data.data;
}
