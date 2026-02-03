'use client';

import { useState, useEffect, useRef } from 'react';

interface Props {
  deadlineUTC: string;
  label: string;
  onDeadlineReached?: () => void;
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function AttendanceDeadlineTimer({ deadlineUTC, label, onDeadlineReached }: Props) {
  const [timeLeft, setTimeLeft] = useState('');
  const deadlineCalledRef = useRef(false);

  useEffect(() => {
    const deadline = new Date(deadlineUTC).getTime();
    deadlineCalledRef.current = false;

    const update = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        setTimeLeft('00:00:00');
        if (!deadlineCalledRef.current) {
          deadlineCalledRef.current = true;
          onDeadlineReached?.();
        }
        return;
      }
      setTimeLeft(formatTimeLeft(remaining));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadlineUTC, onDeadlineReached]);

  if (!timeLeft) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <span>{label}</span>
      <span className="font-mono font-semibold text-gray-600">{timeLeft}</span>
    </div>
  );
}
