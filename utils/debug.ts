// utils/debug.ts
export const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV !== 'development') return;

  console.log(`[DEBUG] ${message}`, data ? data : '');

  try {
    const debugLogs = JSON.parse(localStorage.getItem('debug_logs') || '[]');
    debugLogs.push({
      timestamp: Date.now(),
      message,
      data,
    });
    while (debugLogs.length > 20) {
      debugLogs.shift();
    }
    localStorage.setItem('debug_logs', JSON.stringify(debugLogs));
  } catch (e) {
    // Ignore storage errors
  }
};
