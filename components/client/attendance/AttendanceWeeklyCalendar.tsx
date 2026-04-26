'use client';

import { AttendanceDayStatus } from '@/lib/api/attendance';

interface Props {
  days: AttendanceDayStatus[];
  dayLabels: string[];
  weeklyBonusEligible: boolean;
  todayChecked: boolean;
  totalRequired: number;
  checkedCount: number;
}

export default function AttendanceWeeklyCalendar({
  days,
  dayLabels,
  weeklyBonusEligible,
  todayChecked,
  totalRequired,
  checkedCount,
}: Props) {
  return (
    <div className="w-full">
      {/* Progress indicator */}
      <div className="mb-3 flex items-center justify-between text-xs text-gray-400">
        <span>{checkedCount} / {totalRequired}</span>
        <div className="ml-2 flex-1 rounded-full bg-gray-100 h-1.5">
          <div
            className="h-1.5 rounded-full bg-purple-500 transition-all duration-500"
            style={{ width: `${Math.min((checkedCount / totalRequired) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day, i) => {
          const isSunday = day.dayOfWeek === 6;
          const isToday = day.isToday;
          const checked = day.checked || (isToday && todayChecked);
          const isPast = !day.isFuture && !isToday && !checked;

          return (
            <div
              key={day.date}
              className={`
                flex flex-col items-center rounded-xl py-2.5 px-1 transition-all
                ${checked
                  ? 'bg-purple-100 border-2 border-purple-300'
                  : isToday
                    ? 'bg-white border-2 border-purple-500 shadow-sm'
                    : isPast
                      ? 'bg-gray-50 border border-gray-200'
                      : isSunday
                        ? 'bg-amber-50 border border-amber-200'
                        : 'bg-gray-50 border border-gray-100'
                }
              `}
            >
              {/* Day label */}
              <span
                className={`text-[10px] font-medium ${
                  isSunday ? 'text-amber-600' : checked ? 'text-purple-600' : 'text-gray-400'
                }`}
              >
                {dayLabels[i]}
              </span>

              {/* Status icon */}
              <div className="my-1 flex h-7 w-7 items-center justify-center">
                {checked ? (
                  <span className="text-lg text-purple-500">&#10003;</span>
                ) : isToday ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-500 animate-pulse" />
                ) : isPast ? (
                  <span className="text-sm text-gray-300">&times;</span>
                ) : isSunday ? (
                  <span className="text-base">&#127873;</span>
                ) : (
                  <span className="text-gray-200">-</span>
                )}
              </div>

              {/* Reward label */}
              <span
                className={`text-[10px] font-semibold ${
                  checked
                    ? 'text-purple-500'
                    : isSunday
                      ? 'text-amber-500'
                      : 'text-gray-300'
                }`}
              >
                {isSunday ? (weeklyBonusEligible ? '120p' : '60p') : checked ? '60p' : isToday ? '60p' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
