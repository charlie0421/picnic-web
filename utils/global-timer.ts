import {create} from 'zustand';

interface GlobalTimerState {
  currentTime: Date;
  subscribe: (callback: (time: Date) => void) => () => void;
}

const useGlobalTimer = create<GlobalTimerState>((set, get) => {
  let subscribers = new Set<(time: Date) => void>();
  let timer: NodeJS.Timeout | null = null;

  const startTimer = () => {
    if (timer || typeof window === 'undefined') return;

    timer = setInterval(() => {
      const now = new Date();
      set({ currentTime: now });
      console.log('currentTime', now);
      subscribers.forEach(callback => callback(now));
    }, 1000);
  };

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  // 서버 사이드에서는 고정된 시간, 클라이언트에서는 현재 시간
  const initialTime = typeof window !== 'undefined' ? new Date() : new Date(0);

  return {
    currentTime: initialTime,
    subscribe: (callback) => {
      subscribers.add(callback);
      if (subscribers.size === 1 && typeof window !== 'undefined') {
        startTimer();
      }
      return () => {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          stopTimer();
        }
      };
    },
  };
});

export default useGlobalTimer;
